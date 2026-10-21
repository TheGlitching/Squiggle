/** The teachers' page: what Squiggle is for in class, and how the free offer is asked for. */
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CONTACT_URL } from '../src/components/Layout';
import { App } from '../src/App';
import { Enseignants } from '../src/pages/Enseignants';

afterEach(() => {
  cleanup();
  window.history.pushState({}, '', '/');
});

describe('Enseignants', () => {
  it('states the offer plainly: free for teachers, on request', () => {
    render(<Enseignants />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Squiggle pour les enseignants' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Gratuit pour les enseignants, sur demande.')).toBeInTheDocument();
  });

  it('gives a route to ask for it, from the top and again at the end', () => {
    render(<Enseignants />);
    const requests = screen.getAllByRole('link', { name: 'Demander l’accès enseignant' });
    expect(requests).toHaveLength(2);
    for (const request of requests) expect(request).toHaveAttribute('href', CONTACT_URL);
  });

  it('shows what to do with it in class, and that it judges a text, not a person', () => {
    render(<Enseignants />);
    const uses = within(screen.getByRole('region', { name: 'Ce que vous pouvez en faire' }));
    expect(uses.getAllByRole('listitem')).toHaveLength(3);
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
