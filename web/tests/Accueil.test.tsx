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
import { TAGLINE } from '../src/offer';
import { MEASURE } from '../src/components/Landing';
import { MOBILE } from './helpers';

afterEach(cleanup);

describe('Accueil', () => {
  it('leads with what the reader gets, as the page heading, and a way to sign in', () => {
    render(<Accueil />);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: TAGLINE,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Se connecter' })).toHaveAttribute('href', '/connexion');
  });

  // The research stage only looks up the facts the audit itself questioned, so the
  // lead must not promise a source check for every verifiable fact.
  it('promises a source check only for the facts it questions', () => {
    render(<Accueil />);
    expect(screen.getByText(/S’il met un fait en question, il consulte d’abord les sources\.$/)).toBeInTheDocument();
    expect(screen.queryByText(/faits vérifiables/)).toBeNull();
  });

  it('repeats the headline in the page title and the link preview', () => {
    const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
    const title = `Squiggle : ${TAGLINE.charAt(0).toLowerCase()}${TAGLINE.slice(1, -1)}`;
    expect(html).toContain(`<title>${title}</title>`);
    expect(html).toContain(`<meta property="og:title" content="${title}" />`);
  });

  it('lets a reader try the example in place, without an account or a request', async () => {
    const fetch = vi.fn(() => Promise.reject(new Error('no request expected')));
    vi.stubGlobal('fetch', fetch);
    render(<Accueil />);
    const article = within(screen.getByRole('article', { name: /article d’exemple/ }));
    // Before: the text, already pasted, and no highlight yet.
    expect(article.queryAllByRole('button')).toHaveLength(0);

    const hero = within(screen.getByRole('region', { name: TAGLINE }));
    await userEvent.click(hero.getByRole('button', { name: 'Analyser cet exemple' }));
    expect(await hero.findByText('61')).toBeInTheDocument();
    expect(hero.getByText('Article fragile')).toBeInTheDocument();
    expect(hero.getByText('Chiffre mis en doute')).toBeInTheDocument();
    expect(hero.getByText('Douteuse')).toBeInTheDocument();

    const passage = article.getByRole('button', { name: /Selon un expert/ });
    await userEvent.click(passage);
    expect(passage).toHaveAttribute('aria-pressed', 'true');
    expect(hero.getByText('Autorité non nommée')).toBeInTheDocument();
    expect(hero.queryByText('Chiffre mis en doute')).toBeNull();
    // The strength is marked too: the example shows what is solid.
    expect(article.getByRole('button', { name: /témoins de terrain/ })).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'À votre tour : collez un article' })).toHaveAttribute('href', '/analyser');
    expect(screen.getByRole('link', { name: 'Voir le rapport complet' })).toHaveAttribute('href', '/analyser?exemple');
    expect(screen.getByText(/Exemple analysé à l’avance/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('has every section a first-time reader looks for', () => {
    render(<Accueil />);
    for (const name of [
      'Comment ça marche',
      'Une note sur 100, cinq questions',
      'Partout où vous lisez',
      'Neutre par construction',
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
    const section = within(screen.getByRole('region', { name: 'Une note sur 100, cinq questions' }));
    for (const { label } of VERIFICATION_STATES) {
      expect(section.getByText(label)).toBeInTheDocument();
    }
  });

  it('explains how it stays neutral: one grid, a public method, no verdict on people', () => {
    render(<Accueil />);
    const section = within(screen.getByRole('region', { name: 'Neutre par construction' }));
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

  it('offers the browser button on a computer, in plain words, below the try', () => {
    const agent = vi.spyOn(navigator, 'userAgent', 'get');
    for (const [ua, store] of [
      ['Mozilla/5.0 AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36', CHROME_URL],
      ['Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0', FIREFOX_URL],
      ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', null],
    ] as const) {
      agent.mockReturnValue(ua);
      render(<Accueil />);
      // The hero leads with the example, never with a store.
      const hero = within(screen.getByRole('region', { name: TAGLINE }));
      expect(hero.queryByRole('link', { name: /^Ajouter à/ })).toBeNull();
      expect(hero.getByRole('button', { name: 'Analyser cet exemple' })).toBeInTheDocument();
      const partout = within(screen.getByRole('region', { name: 'Partout où vous lisez' }));
      expect(partout.getByRole('link', { name: 'Ajouter à Chrome' })).toHaveAttribute('href', CHROME_URL);
      expect(partout.getByRole('link', { name: 'Ajouter à Firefox' })).toHaveAttribute('href', FIREFOX_URL);
      // The store this browser installs from is the one set as a button.
      for (const [name, href] of [['Ajouter à Chrome', CHROME_URL], ['Ajouter à Firefox', FIREFOX_URL]] as const) {
        const link = partout.getByRole('link', { name });
        expect(link.className.includes('min-h-12'), name).toBe(href === store);
      }
      expect(partout.getByText(/Ajoutez le bouton Squiggle à votre navigateur/)).toBeInTheDocument();
      expect(screen.queryByText(/extension/i)).toBeNull();
      cleanup();
    }
    agent.mockRestore();
  });

  it('on a phone, points at the site and the app, never at a store', () => {
    const agent = vi.spyOn(navigator, 'userAgent', 'get');
    for (const ua of MOBILE) {
      agent.mockReturnValue(ua);
      render(<Accueil />);
      const partout = within(screen.getByRole('region', { name: 'Partout où vous lisez' }));
      expect(partout.getByRole('link', { name: 'Analyser un texte' })).toHaveAttribute('href', '/analyser');
      expect(screen.queryByRole('link', { name: /^Ajouter à/ })).toBeNull();
      cleanup();
    }
    agent.mockRestore();
  });

  it('offers the browser’s own install prompt when it has one', async () => {
    const agent = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(MOBILE[0]);
    render(<Accueil />);
    expect(screen.queryByRole('button', { name: 'Installer l’appli' })).toBeNull();
    const prompt = vi.fn(() => Promise.resolve());
    act(() => {
      window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), { prompt }));
    });
    // In the header too, on a phone.
    expect(screen.getByRole('button', { name: 'Installer' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Installer l’appli' }));
    expect(prompt).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Installer l’appli' })).toBeNull());
    agent.mockRestore();
  });

  it('tells iOS Safari where its install lives, and not Chrome on iOS', async () => {
    const agent = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(MOBILE[3]);
    render(<Accueil />);
    expect(screen.getByText('Touchez Partager, puis « Sur l’écran d’accueil ».')).toBeInTheDocument();
    // The header's button shows the same steps on demand.
    const install = screen.getByRole('button', { name: 'Installer' });
    expect(install).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(install);
    expect(install).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/Squiggle s’ouvre alors comme une appli/)).toBeInTheDocument();
    cleanup();
    agent.mockReturnValue(MOBILE[4]);
    render(<Accueil />);
    expect(screen.queryByText(/Touchez Partager/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Installer' })).toBeNull();
    agent.mockRestore();
  });

  it('links the source code from the footer', () => {
    render(<Accueil />);
    const footer = within(screen.getByRole('navigation', { name: 'Navigation de pied de page' }));
    expect(footer.getByRole('link', { name: /Code source/ })).toHaveAttribute('href', 'https://github.com/TheGlitching/Squiggle');
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

  it('says what each figure shows, and lets it be played from the keyboard', async () => {
    // With reduced motion the figure lands on its result at once.
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
    render(<Accueil />);
    expect(screen.getByRole('img', { name: /Squiggle le parcourt, surligne 5 passages fragiles et un point fort/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Un ordinateur portable et un téléphone/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Relire l’article' }));
    expect(await screen.findByText(/5 passages fragiles, 1 point fort · 61 sur 100/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sur téléphone' }));
    expect(screen.getByText('Téléphone : le rapport dans l’appli')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('sets running text at 16 px or more, on a 68ch measure', () => {
    const { container } = render(<Accueil />);
    for (const p of container.querySelectorAll('p, dd, li > p')) {
      expect(p.className, p.textContent ?? '').not.toMatch(/\btext-(xs|sm)\b|text-\[[\d.]+px\]/);
    }
    const lead = screen.getByText(/surligne ce qui est fragile dans un article/);
    expect(lead.className).toContain(MEASURE);
    const privacy = within(screen.getByRole('region', { name: 'Vos données' })).getByText(/transite par notre serveur/);
    expect(privacy.className).toContain(MEASURE);
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
