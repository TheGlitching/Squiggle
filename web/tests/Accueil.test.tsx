/**
 * The launch landing. What the funnel rests on is pinned: the tagline, the
 * sections a first-time reader looks for, the monthly price, the free analyses
 * and the education offer, with the domains and verification states checked
 * against the extension's own definitions so the page cannot describe a grid the
 * product no longer uses.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SCORE_DOMAINS } from '../../shared/src/engine/types';
import { CONTACT_URL } from '../src/components/Layout';
import { CHROME_URL, FIREFOX_URL } from '../src/install';
import { DOMAINS } from '../src/pages/Accueil';
import { Accueil } from '../src/pages/Accueil';
import { VERIFICATION_STATES } from '../src/demo';

afterEach(cleanup);

describe('Accueil', () => {
  it('leads with the approved tagline as the page heading and a way to sign in', () => {
    render(<Accueil />);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Analyse l’article que vous lisez et montre ce qui ne tient pas.',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Se connecter' })).toHaveAttribute('href', '/connexion');
  });

  it('shows a real capture of the report beside the promise', () => {
    render(<Accueil />);
    const capture = screen.getByRole('img', { name: /Capture du panneau Squiggle/ });
    expect(capture).toHaveAttribute('src', '/landing/rapport.png');
    expect(screen.getByText('Le panneau de l’extension, sur un article d’exemple.')).toBeInTheDocument();
  });

  it('has every section a first-time reader looks for', () => {
    render(<Accueil />);
    for (const name of [
      'Ce qu’il vérifie',
      'Comment il reste neutre',
      'Vos données',
      'Tarifs',
      'Questions fréquentes',
    ]) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }
  });

  it('describes the five domains and their weights exactly as the engine defines them', () => {
    expect(DOMAINS.map(([label, weight]) => [label, weight])).toEqual(
      Object.values(SCORE_DOMAINS).map((domain) => [domain.label, domain.weight]),
    );
    render(<Accueil />);
    const list = within(screen.getByRole('list', { name: 'Les cinq domaines' }));
    expect(list.getAllByRole('listitem')).toHaveLength(5);
  });

  it('names the four verification states with the extension’s own labels', () => {
    const badge = readFileSync(resolve(__dirname, '../../src/ui/components/VerificationBadge.tsx'), 'utf8');
    expect(VERIFICATION_STATES).toHaveLength(4);
    for (const { label } of VERIFICATION_STATES) {
      expect(badge).toContain(`label: '${label}'`);
    }
    render(<Accueil />);
    for (const { label } of VERIFICATION_STATES) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('explains how it stays neutral: one grid, a public method, no verdict on people', () => {
    render(<Accueil />);
    const section = within(screen.getByRole('region', { name: 'Comment il reste neutre' }));
    expect(section.getByText('Une seule grille pour tous les articles')).toBeInTheDocument();
    expect(section.getByText('Une méthode publique')).toBeInTheDocument();
    expect(section.getByText('Aucun verdict sur les personnes')).toBeInTheDocument();
    expect(section.getByRole('link', { name: /Lire la méthode et le code sur GitHub/ })).toHaveAttribute(
      'href',
      'https://github.com/TheGlitching/Squiggle',
    );
  });

  it('keeps the privacy paragraph honest and links Transparence', () => {
    render(<Accueil />);
    const section = within(screen.getByRole('region', { name: 'Vos données' }));
    expect(section.getByText(/transite par notre serveur/)).toBeInTheDocument();
    expect(section.getByText(/Aucune publicité, aucun traceur/)).toBeInTheDocument();
    expect(section.getByRole('link', { name: 'Voir le trajet exact des données' })).toHaveAttribute(
      'href',
      '/transparence',
    );
    expect(screen.queryByText(/tout reste privé/i)).toBeNull();
    expect(screen.queryByText(/^sécurisé$/i)).toBeNull();
  });

  it('states the monthly price first, the free analyses and the education offer', () => {
    render(<Accueil />);
    const pricing = within(screen.getByRole('region', { name: 'Tarifs' }));
    expect(pricing.getByRole('link', { name: 'S’abonner : 4,99 €/mois' })).toHaveAttribute(
      'href',
      '/connexion',
    );
    expect(pricing.getByText(/3 analyses offertes à l’inscription/)).toBeInTheDocument();
    expect(pricing.getByText(/10 analyses par jour/)).toBeInTheDocument();
    expect(pricing.getByText(/Gratuit pour les enseignants, sur demande/)).toBeInTheDocument();
    expect(pricing.getByRole('link', { name: 'Offre enseignants' })).toHaveAttribute('href', '/enseignants');
    expect(screen.queryByText(/€\/jour/)).toBeNull();
  });

  it('answers the questions a hesitant reader asks, each openable on its own', () => {
    const { container } = render(<Accueil />);
    const faq = within(screen.getByRole('region', { name: 'Questions fréquentes' }));
    for (const question of [
      'Une analyse peut-elle se tromper ?',
      'Mon article est-il envoyé quelque part ?',
      'Comment résilier mon abonnement ?',
      'Puis-je l’utiliser en classe ?',
    ]) {
      expect(faq.getByText(question)).toBeInTheDocument();
    }
    expect(container.querySelectorAll('details').length).toBeGreaterThanOrEqual(6);
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

  it('sets running text at 16 px or more, on a 68ch measure', () => {
    const { container } = render(<Accueil />);
    for (const p of container.querySelectorAll('p, dd, li > p')) {
      expect(p.className, p.textContent ?? '').not.toMatch(/\btext-(xs|sm)\b|text-\[[\d.]+px\]/);
    }
    const lead = screen.getByText(/Squiggle relit un article de presse/);
    expect(lead.className).toContain('max-w-[68ch]');
    const privacy = within(screen.getByRole('region', { name: 'Vos données' })).getByText(/transite par notre serveur/);
    expect(privacy.className).toContain('max-w-[68ch]');
  });

  it('keeps every navigation link a comfortable target, not a bare line of text', () => {
    render(<Accueil />);
    const links = [
      ...within(screen.getByRole('navigation', { name: 'Navigation principale' })).getAllByRole('link'),
      ...within(screen.getByRole('navigation', { name: 'Navigation de pied de page' })).getAllByRole('link'),
    ];
    expect(links.length).toBeGreaterThanOrEqual(7);
    for (const link of links) {
      expect(link.className, link.textContent ?? '').toMatch(/\bpy-[1-3]\b/);
    }
  });
});
