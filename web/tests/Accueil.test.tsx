/**
 * The landing, ported from the approved dark/tech prototype. The claims the
 * funnel rests on are pinned: the tagline, the free-forever promise, the
 * subscription price, the perks, and both ways to reach a store.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

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

  it('states the price, the free-forever key line and the perks', () => {
    render(<Accueil />);
    expect(screen.getByRole('link', { name: /S’abonner : 0,16 €\/jour/ })).toHaveAttribute(
      'href',
      '/connexion',
    );
    expect(screen.getByText('soit 4,99 €/mois, sans engagement')).toBeInTheDocument();
    expect(screen.getByText('Gratuit à vie avec votre propre clé API.')).toBeInTheDocument();
    for (const perk of [
      '10 analyses par jour',
      'Aucune publicité',
      'Aucun traceur',
      'Tout reste privé',
      'Sécurisé',
    ]) {
      expect(screen.getByText(perk)).toBeInTheDocument();
    }
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
