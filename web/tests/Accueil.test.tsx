/**
 * The launch landing. What the funnel rests on is pinned: the tagline, the
 * sections a first-time reader looks for, the monthly price, the free analyses
 * and the education offer, with the domains and verification states checked
 * against the extension's own definitions so the page cannot describe a grid the
 * product no longer uses.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HOSTED_ANALYSIS } from '../../shared/src/hosted/disclosure';
import { SCORE_DOMAINS } from '../../shared/src/engine/types';
import { App } from '../src/App';
import { CONTACT_URL } from '../src/components/Layout';
import { CHROME_URL, FIREFOX_URL } from '../src/install';
import { DOMAINS, VERIFICATION_STATES } from '../src/demo';
import { TAGLINE } from '../src/offer';
import { MOBILE } from './helpers';

afterEach(() => {
  cleanup();
  window.history.pushState({}, '', '/');
});

/** The home page as a visitor gets it: inside the site's header and footer. */
function home() {
  window.history.pushState({}, '', '/');
  return render(<App />);
}

const region = (name: string) => within(screen.getByRole('region', { name }));

describe('Accueil', () => {
  it('leads with what the reader gets, as the page heading, and a way to sign in', () => {
    home();
    expect(screen.getByRole('heading', { level: 1, name: TAGLINE })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Se connecter' })).toHaveAttribute('href', '/connexion');
  });

  it('sends everyone to the analysis on the site first, whatever the device', () => {
    const agent = vi.spyOn(navigator, 'userAgent', 'get');
    for (const ua of ['Mozilla/5.0 AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36', ...MOBILE]) {
      agent.mockReturnValue(ua);
      home();
      const hero = screen.getByRole('heading', { level: 1 }).parentElement!;
      expect(within(hero).getByRole('link', { name: 'Analyser un article' })).toHaveAttribute('href', '/analyser');
      expect(within(hero).queryByRole('link', { name: /^Ajouter à/ })).toBeNull();
      cleanup();
    }
    agent.mockRestore();
  });

  // The research stage only looks up the facts the audit itself questioned, so the
  // page must not promise a source check for every verifiable fact.
  it('promises a source check only for the facts it questions', () => {
    home();
    expect(
      region('Comment ça marche').getByText(/^S’il met un fait en question, il consulte d’abord les sources\./),
    ).toBeInTheDocument();
    expect(screen.queryByText(/faits vérifiables/)).toBeNull();
  });

  it('keeps the model and the plumbing off the home page', () => {
    const { container } = home();
    const text = container.textContent ?? '';
    expect(text).not.toContain(HOSTED_ANALYSIS.modelLabel);
    expect(text).not.toMatch(/OpenRouter|modèle de langage/);
  });

  it('repeats the headline in the page title and the link preview', () => {
    const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
    const title = `Squiggle : ${TAGLINE.charAt(0).toLowerCase()}${TAGLINE.slice(1, -1)}`;
    expect(html).toContain(`<title>${title}</title>`);
    expect(html).toContain(`<meta property="og:title" content="${title}" />`);
  });

  it('loads its faces from its own origin, never from a font service', () => {
    const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
    const css = readFileSync(resolve(__dirname, '../src/index.css'), 'utf8');
    expect(`${html}${css}`).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
  });

  it('explains its drawing in words: the passage, the reason, the note', () => {
    home();
    const legend = screen.getByText('Le passage fragile, surligné.').closest('ol')!;
    expect(
      within(legend)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['1Le passage fragile, surligné.', '2La raison, en une phrase.', '3Une note sur 100.']);
  });

  it('shows an article with its highlights beside the report that explains them', async () => {
    home();
    const article = within(screen.getByRole('article', { name: /article d’exemple/ }));
    const report = within(screen.getByRole('group', { name: 'Le rapport Squiggle sur cet article' }));
    expect(report.getByText('61')).toBeInTheDocument();
    expect(report.getByText('Article fragile')).toBeInTheDocument();
    expect(report.getByText('5 passages fragiles, 1 point fort.')).toBeInTheDocument();
    expect(report.getByText('Chiffre mis en doute')).toBeInTheDocument();
    expect(report.getByText('Douteuse')).toBeInTheDocument();

    const passage = article.getByRole('button', { name: /Selon un expert/ });
    expect(passage).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(passage);
    expect(passage).toHaveAttribute('aria-pressed', 'true');
    expect(report.getByText('Autorité non nommée')).toBeInTheDocument();
    expect(report.queryByText('Douteuse')).toBeNull();

    await userEvent.click(article.getByRole('button', { name: /bibliothécaires et enseignants/ }));
    expect(report.getByText('Point fort')).toBeInTheDocument();
    expect(report.getByText('Témoins de terrain')).toBeInTheDocument();
  });

  it('has every section a first-time reader looks for', () => {
    home();
    for (const name of [
      'Un exemple',
      'Comment ça marche',
      'La même grille pour tous',
      'Où que vous lisiez',
      'Vos données',
      'Tarifs',
      'Questions fréquentes',
    ]) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }
  });

  it('draws the path of an analysis as a sequence, with what passes between the steps', () => {
    home();
    const steps = within(region('Comment ça marche').getByRole('list'));
    expect(steps.getAllByRole('listitem')).toHaveLength(4);
    for (const label of ['le texte', 'les faits mis en doute', 'les constats retenus']) {
      expect(steps.getByText(label)).toBeInTheDocument();
    }
  });

  it('describes the five domains and their weights exactly as the engine defines them', () => {
    expect(DOMAINS.map(([label, weight]) => [label, weight])).toEqual(
      Object.values(SCORE_DOMAINS).map((domain) => [domain.label, domain.weight]),
    );
    home();
    const list = within(screen.getByRole('list', { name: 'Les cinq domaines' }));
    expect(list.getAllByRole('listitem')).toHaveLength(5);
  });

  // The weights are the engine's to change: the page says what is read, never the points.
  it('names what the grid reads without printing its weights', () => {
    home();
    const text = screen.getByRole('region', { name: 'La même grille pour tous' }).textContent ?? '';
    for (const [, weight] of DOMAINS) expect(text).not.toMatch(new RegExp(`\\b${weight}\\b`));
    expect(text).not.toMatch(/points/);
  });

  it('names the four verification states with the extension’s own labels', () => {
    const badge = readFileSync(resolve(__dirname, '../../src/ui/components/VerificationBadge.tsx'), 'utf8');
    expect(VERIFICATION_STATES).toHaveLength(4);
    for (const { label } of VERIFICATION_STATES) {
      expect(badge).toContain(`label: '${label}'`);
    }
    home();
    const section = region('La même grille pour tous');
    for (const { label } of VERIFICATION_STATES) {
      expect(section.getByText(label)).toBeInTheDocument();
    }
  });

  it('says how it stays neutral: one grid, no verdict on people, a public method', () => {
    home();
    const section = region('La même grille pour tous');
    expect(section.getByText('Les mêmes critères pour chaque article.')).toBeInTheDocument();
    expect(section.getByText('Le texte est jugé, jamais son auteur.')).toBeInTheDocument();
    expect(section.getByRole('link', { name: /Lire la méthode sur GitHub/ })).toHaveAttribute(
      'href',
      'https://github.com/TheGlitching/Squiggle',
    );
  });

  it('keeps the privacy paragraph honest and links Transparence', () => {
    home();
    const section = region('Vos données');
    expect(section.getByText(/Aucune publicité, aucun traceur/)).toBeInTheDocument();
    expect(section.getByText('sans votre identité')).toBeInTheDocument();
    // How the server stores text is a question for publishers, answered on Transparence.
    expect(section.queryByText(/serveur|n’écrit pas/)).toBeNull();
    expect(within(section.getByRole('list', { name: 'Le trajet d’un article' })).getAllByRole('listitem')).toHaveLength(
      3,
    );
    expect(section.getByRole('link', { name: 'Voir le trajet des données' })).toHaveAttribute('href', '/transparence');
    expect(screen.queryByText(/tout reste privé/i)).toBeNull();
    expect(screen.queryByText(/^sécurisé$/i)).toBeNull();
  });

  it('sells one plan with one sign-up action, then the trial and the education offer', () => {
    home();
    const pricing = region('Tarifs');
    expect(pricing.getByRole('link', { name: 'S’abonner : 4,99 €/mois' })).toHaveAttribute('href', '/connexion');
    expect(pricing.getAllByRole('link', { name: /S’abonner|Commencer|Essayer/ })).toHaveLength(1);
    const included = within(pricing.getByRole('list', { name: 'Ce qui est compris' }));
    expect(included.getByText('10 analyses par jour')).toBeInTheDocument();
    expect(pricing.getByText(/3 analyses offertes, sans carte bancaire/)).toBeInTheDocument();
    expect(pricing.getByText(/Gratuit pour les enseignants, sur demande/)).toBeInTheDocument();
    expect(pricing.getByRole('link', { name: 'Offre enseignants' })).toHaveAttribute('href', '/enseignants');
    expect(screen.queryByText(/€\/jour/)).toBeNull();
  });

  it('answers the questions a hesitant reader asks, each openable on its own', () => {
    const { container } = home();
    const faq = region('Questions fréquentes');
    for (const question of [
      /Une analyse peut-elle se tromper/,
      /Mon article est-il envoyé quelque part/,
      /Comment résilier/,
      /Puis-je l’utiliser en classe/,
    ]) {
      expect(faq.getByText(question)).toBeInTheDocument();
    }
    expect(container.querySelectorAll('details').length).toBeGreaterThanOrEqual(5);
  });

  it('links the transparency page, the legal pages and a contact route', () => {
    home();
    const footer = within(screen.getByRole('navigation', { name: 'Navigation de pied de page' }));
    expect(footer.getByRole('link', { name: 'Transparence' })).toHaveAttribute('href', '/transparence');
    expect(footer.getByRole('link', { name: 'Mentions légales' })).toHaveAttribute('href', '/mentions-legales');
    expect(footer.getByRole('link', { name: 'Confidentialité' })).toHaveAttribute('href', '/confidentialite');
    expect(footer.getByRole('link', { name: 'Contact' })).toHaveAttribute('href', CONTACT_URL);
    expect(screen.getByRole('link', { name: /code source est sur GitHub/ })).toHaveAttribute(
      'href',
      'https://github.com/TheGlitching/Squiggle',
    );
  });

  it('offers the browser button as an option, naming the store it opens', () => {
    const agent = vi.spyOn(navigator, 'userAgent', 'get');
    for (const [ua, label, href] of [
      ['Mozilla/5.0 AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36', 'Ajouter à Chrome', CHROME_URL],
      ['Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0', 'Ajouter à Firefox', FIREFOX_URL],
    ]) {
      agent.mockReturnValue(ua);
      home();
      expect(region('Où que vous lisiez').getByRole('link', { name: label })).toHaveAttribute('href', href);
      cleanup();
    }
    agent.mockRestore();
  });

  it('names both stores where neither applies, and none on a phone', () => {
    const agent = vi.spyOn(navigator, 'userAgent', 'get');
    agent.mockReturnValue('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15');
    home();
    expect(screen.queryByRole('link', { name: /^Ajouter à/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Chrome' })).toHaveAttribute('href', CHROME_URL);
    expect(screen.getByRole('link', { name: 'Firefox' })).toHaveAttribute('href', FIREFOX_URL);
    cleanup();
    for (const ua of MOBILE) {
      agent.mockReturnValue(ua);
      home();
      expect(screen.queryByRole('link', { name: /^Ajouter à|^Chrome$|^Firefox$/ })).toBeNull();
      cleanup();
    }
    agent.mockRestore();
  });

  it('offers the browser’s own install prompt when it has one', async () => {
    const agent = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(MOBILE[0]);
    home();
    expect(screen.queryByRole('button', { name: 'Installer l’appli' })).toBeNull();
    const prompt = vi.fn(() => Promise.resolve());
    act(() => {
      window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), { prompt }));
    });
    await userEvent.click(screen.getAllByRole('button', { name: 'Installer l’appli' })[0]);
    expect(prompt).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Installer l’appli' })).toBeNull());
    agent.mockRestore();
  });

  it('tells iOS Safari where its install lives, and not Chrome on iOS', () => {
    const agent = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(MOBILE[3]);
    home();
    expect(screen.getByText(/Partager, puis « Sur l’écran d’accueil »/)).toBeInTheDocument();
    cleanup();
    agent.mockReturnValue(MOBILE[4]);
    home();
    expect(screen.queryByText(/Partager, puis/)).toBeNull();
    agent.mockRestore();
  });

  it('keeps the example one tap away and leaves the price out of the hero', () => {
    home();
    expect(screen.getByRole('link', { name: 'Voir un exemple' })).toHaveAttribute('href', '#exemple');
    const hero = screen.getByRole('heading', { level: 1 }).parentElement!;
    expect(hero.textContent).not.toMatch(/analyses offertes|€/);
  });

  it('walks through the passages while left alone, and stops under the pointer', () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(private readonly callback: IntersectionObserverCallback) {}
        observe() {
          this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as never);
        }
        disconnect() {}
      },
    );
    home();
    const report = within(screen.getByRole('group', { name: 'Le rapport Squiggle sur cet article' }));
    expect(report.getByText('Chiffre mis en doute')).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(3500));
    expect(report.queryByText('Chiffre mis en doute')).toBeNull();
    const scene = screen.getByRole('article', { name: /article d’exemple/ }).parentElement!;
    fireEvent.pointerEnter(scene);
    const before = report
      .getAllByText(/./)
      .map((node) => node.textContent)
      .join('|');
    act(() => void vi.advanceTimersByTime(7000));
    expect(
      report
        .getAllByText(/./)
        .map((node) => node.textContent)
        .join('|'),
    ).toBe(before);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('stays on one passage when the reader prefers reduced motion', () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(private readonly callback: IntersectionObserverCallback) {}
        observe() {
          this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as never);
        }
        disconnect() {}
      },
    );
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query }));
    home();
    act(() => void vi.advanceTimersByTime(10000));
    const report = within(screen.getByRole('group', { name: 'Le rapport Squiggle sur cet article' }));
    expect(report.getByText('Chiffre mis en doute')).toBeInTheDocument();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('describes the free offer honestly to search engines and link previews', () => {
    const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
    const meta = (attr: string, key: string) => html.match(new RegExp(`${attr}="${key}"\\s+content="([^"]+)"`))?.[1];
    expect(meta('name', 'description')).toContain('3 analyses offertes');
    expect(meta('name', 'description')).not.toMatch(/par jour/);
    expect(meta('property', 'og:description')).toBe(meta('name', 'description'));
    expect(meta('property', 'og:title')).toBe(html.match(/<title>([^<]+)<\/title>/)?.[1]);
    expect(meta('property', 'og:image')).toBe('https://squiggle.fr/og.png');
  });

  it('hides its drawings from assistive technology, which reads the words beside them', () => {
    const { container } = home();
    for (const svg of container.querySelectorAll('main svg')) {
      expect(svg.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('sets running text at 16 px or more, and section leads on a 68ch measure', () => {
    const { container } = home();
    // The example's report keeps the product's own scale for its labels.
    for (const p of container.querySelectorAll('main p, main dd, main li')) {
      if (p.closest('[data-ui]')) continue;
      expect(p.className, p.textContent ?? '').not.toMatch(/\btext-(xs|sm)\b|text-\[[\d.]+px\]/);
    }
    const lead = region('Tarifs').getByText('Essayez d’abord. Payez seulement si l’outil vous sert.');
    expect(lead.className).toContain('max-w-[68ch]');
  });

  it('keeps every navigation link a comfortable target, not a bare line of text', () => {
    home();
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
