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
  it('states the offer at a glance: who, what is free, how to get it', () => {
    render(<Enseignants />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Squiggle pour les enseignants' }),
    ).toBeInTheDocument();
    const offer = screen.getByText('Pour qui', { selector: 'dt' }).closest('dl') as HTMLElement;
    expect(offer.textContent).toContain('L’abonnement complet, gratuit');
    expect(offer.textContent).toContain('En un clic, avec une adresse académique');
    const steps = screen.getByRole('list', { name: 'Comment activer l’accès enseignant' });
    expect(steps).toHaveTextContent('@ac-….fr');
    expect(steps).toHaveTextContent('« Accès enseignant »');
    expect(steps).toHaveTextContent('jusqu’au 30 juin, sans carte bancaire');
  });

  it('says what the classroom mode does, and that the students use no AI', () => {
    render(<Enseignants />);
    const mode = region('Le mode classe');
    for (const title of ['Préparer en privé', 'Révéler un à un', 'Une fiche à photocopier'])
      expect(mode.getByRole('heading', { level: 3, name: title })).toBeInTheDocument();
    expect(mode.getByText(/Les élèves n’utilisent pas d’IA et n’ont pas de compte/)).toBeInTheDocument();
    expect(mode.getByRole('link', { name: 'Ouvrir le mode classe' })).toHaveAttribute('href', '/classe');
    expect(screen.queryByText('Le rapport complet, à projeter en classe')).toBeNull();
    expect(region('Une séance, pas à pas').getByText('Étape 1 sur 6')).toBeInTheDocument();
  });

  // The CLEMI publishes the code to registered teachers only: this public page explains it, never prints it.
  it('explains the 2027 press-week access without ever printing its code', () => {
    const { container } = render(<Enseignants />);
    const week = region('Semaines de la presse 2027');
    expect(week.getByText(/du 15 au 28 mars 2027/)).toBeInTheDocument();
    expect(week.getByRole('list', { name: 'Ce qui est offert pendant les Semaines de la presse' })).toHaveTextContent(
      'rien ne sera prélevé',
    );
    const steps = week.getByRole('list', { name: 'Comment activer l’accès des Semaines de la presse' });
    expect(steps).toHaveTextContent('site du CLEMI');
    expect(steps).toHaveTextContent('Ajouter un code promotionnel');
    expect(week.getByText(/Aucun compte élève/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/SEMAINEPRESSE|[A-Z]{6,}\d{2}/);
    expect(screen.getByText(/jamais un texte d’élève/)).toBeInTheDocument();
  });

  it('sends an academic address to the account page, from the top and again at the end', () => {
    render(<Enseignants />);
    const activations = screen.getAllByRole('link', { name: 'Activer l’accès enseignant' });
    expect(activations).toHaveLength(2);
    for (const link of activations) expect(link).toHaveAttribute('href', '/connexion?next=/compte');
  });

  it('keeps a prefilled request by e-mail for a teacher without an academic address', () => {
    render(<Enseignants />);
    expect(TEACHER_REQUEST_URL.startsWith(`${CONTACT_URL}?subject=`)).toBe(true);
    expect(decodeURIComponent(TEACHER_REQUEST_URL)).toContain('Établissement :');
    expect(screen.getByText(/Pas d’adresse académique/)).toHaveTextContent('le total passe à 0 €');
    expect(screen.getByRole('link', { name: 'Demander un code par e-mail' })).toHaveAttribute('href', TEACHER_REQUEST_URL);
  });

  // The classroom mode and its exercise are shown on this page, never by sending the teacher back to the home page.
  it('points to the classroom mode and the exercise on the page itself', () => {
    render(<Enseignants />);
    expect(screen.getByRole('link', { name: 'Découvrir le mode classe' })).toHaveAttribute('href', '#mode-classe');
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
