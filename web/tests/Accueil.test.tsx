/**
 * The launch landing. What the funnel rests on is pinned: the tagline, the
 * sections a first-time reader looks for, the monthly price, the free analyses
 * and the education offer, with the domains and verification states checked
 * against the extension's own definitions so the page cannot describe a grid the
 * product no longer uses.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SCORE_DOMAINS } from '../../shared/src/engine/types';
import { CONTACT_URL } from '../src/components/Layout';
import { CHROME_URL, FIREFOX_URL } from '../src/install';
import { Accueil } from '../src/pages/Accueil';
import { DOMAINS, VERIFICATION_STATES } from '../src/demo';
import { MOBILE } from './helpers';

afterEach(cleanup);

describe('Accueil', () => {
  it('leads with what the reader gets, as the page heading, and a way to sign in', () => {
    render(<Accueil />);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Sachez ce qu’un article prouve, et ce qu’il se contente d’affirmer.',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Se connecter' })).toHaveAttribute('href', '/connexion');
  });

  it('shows an article with its highlights beside the panel that explains them', async () => {
    render(<Accueil />);
    const article = within(screen.getByRole('article', { name: /article d’exemple/ }));
    const panel = within(screen.getByRole('group', { name: 'Le rapport Squiggle sur cet article' }));
    expect(panel.getByText('61')).toBeInTheDocument();
    expect(panel.getByText('Article fragile')).toBeInTheDocument();
    expect(panel.getByText('Vérification factuelle')).toBeInTheDocument();
    expect(panel.getByText('Faux dilemme')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /Capture du panneau/ })).toBeNull();
    expect(screen.queryByText(/sur un article d’exemple/)).toBeNull();

    const passage = article.getByRole('button', { name: /Selon un expert/ });
    expect(passage).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(passage);
    expect(passage).toHaveAttribute('aria-pressed', 'true');
    expect(panel.getByText('Source anonyme')).toBeInTheDocument();
    expect(panel.queryByText('Faux dilemme')).toBeNull();
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
    const section = within(screen.getByRole('region', { name: 'Ce qu’il vérifie' }));
    for (const { label } of VERIFICATION_STATES) {
      expect(section.getByText(label)).toBeInTheDocument();
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
    expect(footer.getByRole('link', { name: 'Mentions légales' })).toHaveAttribute('href', '/mentions-legales');
    expect(footer.getByRole('link', { name: 'Confidentialité' })).toHaveAttribute('href', '/confidentialite');
    expect(footer.getByRole('link', { name: 'Contact' })).toHaveAttribute('href', CONTACT_URL);
  });

  it('names the store the install button opens, with the analysis on the site second', () => {
    const agent = vi.spyOn(navigator, 'userAgent', 'get');
    for (const [ua, label, href] of [
      ['Mozilla/5.0 AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36', 'Ajouter à Chrome', CHROME_URL],
      ['Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0', 'Ajouter à Firefox', FIREFOX_URL],
    ]) {
      agent.mockReturnValue(ua);
      render(<Accueil />);
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href);
      expect(screen.getByRole('link', { name: 'Analyser un article sur le site' })).toHaveAttribute('href', '/analyser');
      cleanup();
    }
    agent.mockRestore();
  });

  it('leads with the analysis on the site where no extension can be installed', () => {
    const agent = vi.spyOn(navigator, 'userAgent', 'get');
    agent.mockReturnValue('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15');
    render(<Accueil />);
    expect(screen.queryByRole('link', { name: /^Ajouter à/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Analyser un article' })).toHaveAttribute('href', '/analyser');
    expect(screen.getByRole('link', { name: 'Chrome' })).toHaveAttribute('href', CHROME_URL);
    expect(screen.getByRole('link', { name: 'Firefox' })).toHaveAttribute('href', FIREFOX_URL);
    agent.mockRestore();
  });

  it('on a phone, leads with the analysis and never points at a store', () => {
    const agent = vi.spyOn(navigator, 'userAgent', 'get');
    for (const ua of MOBILE) {
      agent.mockReturnValue(ua);
      render(<Accueil />);
      expect(screen.getByRole('link', { name: 'Analyser un article' })).toHaveAttribute('href', '/analyser');
      expect(screen.queryByRole('link', { name: /^Ajouter à|^Chrome$|^Firefox$/ })).toBeNull();
      cleanup();
    }
    agent.mockRestore();
  });

  it('offers the browser’s own install prompt when it has one', async () => {
    const agent = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(MOBILE[0]);
    render(<Accueil />);
    expect(screen.queryByRole('button', { name: 'Installer l’application' })).toBeNull();
    const prompt = vi.fn(() => Promise.resolve());
    act(() => {
      window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), { prompt }));
    });
    await userEvent.click(screen.getByRole('button', { name: 'Installer l’application' }));
    expect(prompt).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Installer l’application' })).toBeNull());
    agent.mockRestore();
  });

  it('tells iOS Safari where its install lives, and not Chrome on iOS', () => {
    const agent = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(MOBILE[3]);
    render(<Accueil />);
    expect(screen.getByText(/touchez Partager puis « Sur l’écran d’accueil »/)).toBeInTheDocument();
    cleanup();
    agent.mockReturnValue(MOBILE[4]);
    render(<Accueil />);
    expect(screen.queryByText(/touchez Partager/)).toBeNull();
    agent.mockRestore();
  });

  it('keeps the example one tap away and states the offer without a card', () => {
    render(<Accueil />);
    expect(screen.getByRole('link', { name: 'Voir un exemple' })).toHaveAttribute('href', '#verifie');
    expect(
      screen.getByText('3 analyses offertes, sans carte bancaire. Ensuite 4,99 € par mois, sans engagement.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /code source est sur GitHub/ })).toHaveAttribute(
      'href',
      'https://github.com/TheGlitching/Squiggle',
    );
  });

  it('describes the free offer honestly to search engines and link previews', () => {
    const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
    const meta = (attr: string, key: string) =>
      html.match(new RegExp(`${attr}="${key}"\\s+content="([^"]+)"`))?.[1];
    expect(meta('name', 'description')).toContain('3 analyses offertes');
    expect(meta('name', 'description')).not.toMatch(/par jour/);
    expect(meta('property', 'og:description')).toBe(meta('name', 'description'));
    expect(meta('property', 'og:title')).toBe(html.match(/<title>([^<]+)<\/title>/)?.[1]);
    expect(meta('property', 'og:image')).toBe('https://squiggle.fr/og.png');
  });

  it('names the five demo domains for screen readers', () => {
    render(<Accueil />);
    expect(screen.getByText(/Faux dilemme \(solidité logique\)/)).toBeInTheDocument();
  });

  it('sets running text at 16 px or more, on a 68ch measure', () => {
    const { container } = render(<Accueil />);
    // The rebuilt extension panel keeps the panel's own 12 px scale.
    for (const p of container.querySelectorAll('p, dd, li > p')) {
      if (p.closest('[data-ui]')) continue;
      expect(p.className, p.textContent ?? '').not.toMatch(/\btext-(xs|sm)\b|text-\[[\d.]+px\]/);
    }
    const lead = screen.getByText(/Avant de le partager ou d’en débattre/);
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
