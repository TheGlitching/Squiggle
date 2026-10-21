/**
 * The landing, ported from the approved dark/tech prototype. The claims the
 * funnel rests on are pinned: the tagline, the free-forever promise, the
 * subscription price, the perks, and both ways to reach a store.
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CONTACT_URL } from '../src/components/Layout';
import { Accueil } from '../src/pages/Accueil';
import { CHROME_URL, FIREFOX_URL } from '../src/install';

afterEach(cleanup);

describe('Accueil', () => {
  it('leads with the approved tagline and a way to sign in', () => {
    render(<Accueil />);
    expect(
      screen.getByText('Analyse l’article que vous lisez et montre ce qui ne tient pas.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Se connecter' })).toHaveAttribute(
      'href',
      '/connexion',
    );
  });

  it('states the monthly price first, the free analyses and verifiable perks', () => {
    render(<Accueil />);
    expect(screen.getByRole('link', { name: 'S’abonner : 4,99 €/mois' })).toHaveAttribute(
      'href',
      '/connexion',
    );
    expect(screen.queryByText(/€\/jour/)).toBeNull();
    expect(screen.getByText('3 analyses offertes à l’inscription')).toBeInTheDocument();
    for (const perk of [
      '10 analyses par jour avec l’abonnement',
      'Aucune publicité, aucun traceur',
      'Code source ouvert',
      'Le texte de l’article n’est jamais conservé',
    ]) {
      expect(screen.getByText(perk)).toBeInTheDocument();
    }
  });

  it('makes no privacy promise that hosted mode cannot keep', () => {
    render(<Accueil />);
    expect(screen.queryByText(/tout reste privé/i)).toBeNull();
    expect(screen.queryByText(/^sécurisé$/i)).toBeNull();
  });

  it('links the transparency page, the legal page and a contact route', () => {
    render(<Accueil />);
    const footer = within(screen.getByRole('navigation', { name: 'Navigation de pied de page' }));
    expect(footer.getByRole('link', { name: 'Transparence' })).toHaveAttribute('href', '/transparence');
    expect(footer.getByRole('link', { name: 'Légal' })).toHaveAttribute('href', '/legal');
    expect(footer.getByRole('link', { name: 'Contact' })).toHaveAttribute('href', CONTACT_URL);
  });

  it('offers an install route that is never dead', () => {
    render(<Accueil />);
    const install = screen.queryByRole('link', { name: /Installer l’extension/ });
    if (install) {
      expect(install.getAttribute('href')).toMatch(/(chromewebstore|addons\.mozilla)/);
    } else {
      expect(screen.getByRole('link', { name: 'Chrome' })).toHaveAttribute('href', CHROME_URL);
      expect(screen.getByRole('link', { name: 'Firefox' })).toHaveAttribute('href', FIREFOX_URL);
    }
    expect(screen.getByRole('link', { name: /code source est sur GitHub/ })).toHaveAttribute(
      'href',
      'https://github.com/TheGlitching/Squiggle',
    );
  });

  it('names the five demo domains for screen readers', () => {
    render(<Accueil />);
    expect(screen.getByText(/Faux dilemme \(solidité logique\)/)).toBeInTheDocument();
  });
});
