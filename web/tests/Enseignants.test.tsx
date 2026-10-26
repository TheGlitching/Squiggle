/** The teachers' page: the offer at a glance, the classroom exercise played on the page, and how to ask. */
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { App } from '../src/App';
import { CONTACT_URL } from '../src/components/Layout';
import { EXAMPLES } from '../src/demo';
import { Enseignants, TEACHER_REQUEST_URL } from '../src/pages/Enseignants';

afterEach(() => {
  cleanup();
  window.history.pushState({}, '', '/');
});

const region = (name: string) => within(screen.getByRole('region', { name }));

describe('Enseignants', () => {
  it('states the offer at a glance: who, what is free, how to ask', () => {
    render(<Enseignants />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Squiggle pour les enseignants' }),
    ).toBeInTheDocument();
    const offer = screen.getByText('Pour qui', { selector: 'dt' }).closest('dl') as HTMLElement;
    expect(offer.textContent).toContain('L’abonnement complet, gratuit');
    expect(offer.textContent).toContain('Sur simple demande, par e-mail');
  });

  it('gives a prefilled request from the top and again at the end', () => {
    render(<Enseignants />);
    expect(TEACHER_REQUEST_URL.startsWith(`${CONTACT_URL}?subject=`)).toBe(true);
    expect(decodeURIComponent(TEACHER_REQUEST_URL)).toContain('Établissement :');
    const requests = screen.getAllByRole('link', { name: 'Demander l’accès enseignant' });
    expect(requests).toHaveLength(2);
    for (const request of requests) expect(request).toHaveAttribute('href', TEACHER_REQUEST_URL);
  });

  // The exercise is shown on this page, never by sending the teacher back to the home page.
  it('points to the exercise on the page itself', () => {
    render(<Enseignants />);
    expect(screen.getByRole('link', { name: 'Essayer l’exercice' })).toHaveAttribute('href', '#exercice');
    expect(screen.queryByRole('link', { name: 'Voir un exemple' })).toBeNull();
    const steps = within(region('L’exercice, en trois temps').getByRole('list', { name: 'Les trois temps de l’exercice' }));
    expect(steps.getAllByRole('listitem')).toHaveLength(3);
  });

  it('lets the reader mark sentences, then compares them with the analysis', async () => {
    render(<Enseignants />);
    const exercise = region('L’exercice, en trois temps');
    const sentence = (text: RegExp) => exercise.getByRole('button', { name: text });

    const study = sentence(/^Selon une étude/);
    await userEvent.click(study);
    expect(study).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(sentence(/^La lecture recule/));
    expect(exercise.getByText('2 phrases marquées')).toBeInTheDocument();
    // A second tap takes a mark back.
    await userEvent.click(sentence(/^La lecture recule/));
    expect(exercise.getByText('1 phrase marquée')).toBeInTheDocument();

    await userEvent.click(exercise.getByRole('button', { name: 'Révéler l’analyse' }));
    const weak = EXAMPLES.filter((finding) => finding.category !== 'point-fort').length;
    expect(exercise.getByText(`1 passage fragile repéré sur ${weak}`)).toBeInTheDocument();
    const findings = within(exercise.getByRole('list', { name: 'Les constats de l’analyse' }));
    expect(findings.getAllByRole('listitem')).toHaveLength(EXAMPLES.length);
    expect(findings.getByText('Étude non nommée').parentElement).toHaveTextContent('repéré');
    expect(findings.getByText('Faux dilemme').parentElement).toHaveTextContent('manqué');
    expect(findings.getByText('Témoins de terrain').parentElement).toHaveTextContent('point fort');
    // The sentences are now read, not marked.
    expect(exercise.queryByRole('button', { name: /^Selon une étude/ })).toBeNull();

    await userEvent.click(exercise.getByRole('button', { name: 'Recommencer' }));
    expect(exercise.getByText('Aucune phrase marquée')).toBeInTheDocument();
  });

  it('turns a mark the analysis does not share into a question for the class', async () => {
    render(<Enseignants />);
    const exercise = region('L’exercice, en trois temps');
    await userEvent.click(exercise.getByRole('button', { name: /^La lecture recule/ }));
    await userEvent.click(exercise.getByRole('button', { name: 'Révéler l’analyse' }));
    expect(exercise.getByText(/Une phrase marquée n’a aucun constat/)).toBeInTheDocument();
  });

  it('shows that it judges a text, not a person', () => {
    render(<Enseignants />);
    expect(screen.getByText(/jamais son auteur ni le média/)).toBeInTheDocument();
  });

  it('is served at /enseignants with the landing chrome and a way back home', () => {
    window.history.pushState({}, '', '/enseignants');
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Squiggle pour les enseignants' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Navigation principale' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Retour à l’accueil' })).toHaveAttribute('href', '/');
  });
});
