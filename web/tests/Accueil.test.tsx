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
import { HOSTED_ANALYSIS } from '../../shared/src/hosted/disclosure';
import { CONTACT_URL } from '../src/components/Layout';
import { CHROME_URL, FIREFOX_URL } from '../src/install';
import { Accueil } from '../src/pages/Accueil';
import { DOMAINS, VERIFICATION_STATES } from '../src/demo';
import { TAGLINE } from '../src/offer';
import { MOBILE } from './helpers';

afterEach(cleanup);

const CHROME_UA = 'Mozilla/5.0 AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36';
const FIREFOX_UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0';

describe('Accueil', () => {
  it('leads with what the reader gets, as the page heading, and a way to sign in', () => {
    render(<Accueil />);
    expect(screen.getByRole('heading', { level: 1, name: TAGLINE })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Se connecter' })).toHaveAttribute('href', '/connexion');
  });

  // The research stage only looks up the facts the audit itself questioned, so the
  // page must not promise a source check for every verifiable fact.
  it('promises a source check only for the facts it questions', () => {
    render(<Accueil />);
    expect(screen.getByText(/S’il met un fait en question, il consulte d’abord les sources\.$/)).toBeInTheDocument();
    expect(screen.queryByText(/faits vérifiables/)).toBeNull();
  });

  it('names neither the model nor its provider: that belongs to the transparency page', () => {
    const { container } = render(<Accueil />);
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

  it('shows the example article as a figure, with its passages to pick and the finding each one gets', async () => {
    render(<Accueil />);
    expect(screen.getByRole('img', { name: /5 passages surlignés et une note de 61 sur 100/ })).toBeInTheDocument();

    const passages = within(screen.getByRole('group', { name: 'Les passages surlignés' }));
    expect(passages.getAllByRole('button')).toHaveLength(5);
    const card = within(document.getElementById('hero-constat')!);
    // The claim the sources put in doubt is the one shown first.
    expect(passages.getByRole('button', { name: /Chiffre mis en doute/ })).toHaveAttribute('aria-pressed', 'true');
    expect(card.getByText('Douteuse')).toBeInTheDocument();
    expect(card.getByText(/rien n’y appuie/)).toBeInTheDocument();

    const expert = passages.getByRole('button', { name: /Autorité non nommée/ });
    await userEvent.click(expert);
    expect(expert).toHaveAttribute('aria-pressed', 'true');
    expect(card.getByText('Autorité non nommée')).toBeInTheDocument();
    expect(card.getByText('Selon un expert')).toBeInTheDocument();
    expect(card.queryByText('Douteuse')).toBeNull();

    expect(screen.getByText(/Article d’exemple, analysé à l’avance/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /À votre tour : collez un article/ })).toHaveAttribute('href', '/analyser');
  });

  it('has every section a first-time reader looks for, each reachable from the header', () => {
    const { container } = render(<Accueil />);
    for (const name of [
      'Trois gestes, un deuxième avis',
      'Ce que dit le rapport',
      'Neutre par construction',
      'Ce que devient votre article',
      'Essayez d’abord',
      'Questions fréquentes',
    ]) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }
    const nav = within(screen.getByRole('navigation', { name: 'Navigation principale' }));
    for (const [label, id] of [
      ['Comment ça marche', 'comment'],
      ['Tarifs', 'tarifs'],
      ['FAQ', 'faq'],
    ]) {
      expect(nav.getByRole('link', { name: label })).toHaveAttribute('href', `/#${id}`);
      expect(container.querySelector(`#${id}`)).not.toBeNull();
    }
  });

  it('shows how it works in three steps', () => {
    render(<Accueil />);
    const steps = within(screen.getByRole('list', { name: 'Les trois étapes' }));
    expect(steps.getAllByRole('listitem')).toHaveLength(3);
  });

  it('describes the five domains and their weights exactly as the engine defines them', () => {
    expect(DOMAINS.map(([label, weight]) => [label, weight])).toEqual(
      Object.values(SCORE_DOMAINS).map((domain) => [domain.label, domain.weight]),
    );
    render(<Accueil />);
    const list = within(screen.getByRole('list', { name: 'Les cinq domaines' }));
    expect(list.getAllByRole('listitem')).toHaveLength(5);
    for (const [label] of DOMAINS) expect(list.getByText(label)).toBeInTheDocument();
  });

  it('names the four verification states with the extension’s own labels', () => {
    const badge = readFileSync(resolve(__dirname, '../../src/ui/components/VerificationBadge.tsx'), 'utf8');
    expect(VERIFICATION_STATES).toHaveLength(4);
    for (const { label } of VERIFICATION_STATES) {
      expect(badge).toContain(`label: '${label}'`);
    }
    render(<Accueil />);
    const section = within(screen.getByRole('region', { name: 'Ce que dit le rapport' }));
    for (const { label } of VERIFICATION_STATES) {
      expect(section.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(section.getByText('Jamais « vrai » ou « faux »')).toBeInTheDocument();
  });

  it('explains how it stays neutral: one grid, a public method, no verdict on people', () => {
    render(<Accueil />);
    const section = within(screen.getByRole('region', { name: 'Neutre par construction' }));
    expect(section.getByText('Une seule grille')).toBeInTheDocument();
    expect(section.getByText('Une méthode publique')).toBeInTheDocument();
    expect(section.getByText('Le texte, jamais l’auteur')).toBeInTheDocument();
    expect(section.getByText(/Aucun verdict sur une personne ou un média/)).toBeInTheDocument();
    expect(section.getByRole('link', { name: /Lire la méthode et le code sur GitHub/ })).toHaveAttribute(
      'href',
      'https://github.com/TheGlitching/Squiggle',
    );
  });

  it('keeps the data section honest and links Transparence', () => {
    render(<Accueil />);
    const section = within(screen.getByRole('region', { name: 'Ce que devient votre article' }));
    const route = within(section.getByRole('list', { name: 'Le trajet d’un article' }));
    expect(route.getByText('Notre serveur')).toBeInTheDocument();
    expect(route.getByText('Le service d’analyse')).toBeInTheDocument();
    expect(route.getByText(/Gardé 30 jours, avec de courts extraits/)).toBeInTheDocument();
    expect(section.getByText(/n’est pas conservé\. Aucune publicité, aucun traceur\./)).toBeInTheDocument();
    expect(section.getByRole('link', { name: 'Voir le trajet exact des données' })).toHaveAttribute(
      'href',
      '/transparence',
    );
    expect(screen.queryByText(/tout reste privé/i)).toBeNull();
    expect(screen.queryByText(/^sécurisé$/i)).toBeNull();
  });

  it('states the monthly price, the free analyses and the education offer', () => {
    render(<Accueil />);
    const pricing = within(screen.getByRole('region', { name: 'Essayez d’abord' }));
    expect(pricing.getByRole('link', { name: 'S’abonner : 4,99 €/mois' })).toHaveAttribute('href', '/connexion');
    expect(pricing.getByText(/3 analyses offertes à l’inscription/)).toBeInTheDocument();
    expect(pricing.getByText(/10 analyses par jour\./)).toBeInTheDocument();
    expect(pricing.getByText(/Gratuit pour les enseignants, sur demande/)).toBeInTheDocument();
    expect(pricing.getByRole('link', { name: 'Offre enseignants' })).toHaveAttribute('href', '/enseignants');
    expect(screen.queryByText(/€\/jour/)).toBeNull();
  });

  it('answers the questions a hesitant reader asks, each openable on its own', () => {
    const { container } = render(<Accueil />);
    const faq = within(screen.getByRole('region', { name: 'Questions fréquentes' }));
    for (const question of [
      'Sur quel appareil ?',
      'Une analyse peut-elle se tromper ?',
      'Mon article est-il envoyé quelque part ?',
      'Comment résilier mon abonnement ?',
      'Puis-je l’utiliser en classe ?',
    ]) {
      expect(faq.getByText(question)).toBeInTheDocument();
    }
    expect(container.querySelectorAll('details').length).toBeGreaterThanOrEqual(6);
    expect(faq.getByRole('link', { name: 'Le trajet exact' })).toHaveAttribute('href', '/transparence');
  });

  it('links the transparency page, the legal page and a contact route', () => {
    render(<Accueil />);
    const footer = within(screen.getByRole('navigation', { name: 'Navigation de pied de page' }));
    expect(footer.getByRole('link', { name: 'Transparence' })).toHaveAttribute('href', '/transparence');
    expect(footer.getByRole('link', { name: 'Mentions légales' })).toHaveAttribute('href', '/mentions-legales');
    expect(footer.getByRole('link', { name: 'Confidentialité' })).toHaveAttribute('href', '/confidentialite');
    expect(footer.getByRole('link', { name: 'Contact' })).toHaveAttribute('href', CONTACT_URL);
  });

  it('leads with the analysis on the site, and names the store the browser button comes from second', () => {
    const agent = vi.spyOn(navigator, 'userAgent', 'get');
    for (const [ua, label, href] of [
      [CHROME_UA, 'Ajouter à Chrome', CHROME_URL],
      [FIREFOX_UA, 'Ajouter à Firefox', FIREFOX_URL],
    ]) {
      agent.mockReturnValue(ua);
      render(<Accueil />);
      const [analyse] = screen.getAllByRole('link', { name: 'Analyser un article' });
      const store = screen.getByRole('link', { name: label });
      expect(analyse).toHaveAttribute('href', '/analyser');
      expect(store).toHaveAttribute('href', href);
      expect(analyse.compareDocumentPosition(store) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      cleanup();
    }
    agent.mockRestore();
  });

  it('names both browsers where no store applies to this one', () => {
    const agent = vi.spyOn(navigator, 'userAgent', 'get');
    agent.mockReturnValue('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15');
    render(<Accueil />);
    expect(screen.queryByRole('link', { name: /^Ajouter à/ })).toBeNull();
    expect(screen.getAllByRole('link', { name: 'Analyser un article' })[0]).toHaveAttribute('href', '/analyser');
    expect(screen.getByRole('link', { name: 'Chrome' })).toHaveAttribute('href', CHROME_URL);
    expect(screen.getByRole('link', { name: 'Firefox' })).toHaveAttribute('href', FIREFOX_URL);
    agent.mockRestore();
  });

  it('on a phone, leads with the analysis and never points at a store', () => {
    const agent = vi.spyOn(navigator, 'userAgent', 'get');
    for (const ua of MOBILE) {
      agent.mockReturnValue(ua);
      render(<Accueil />);
      for (const link of screen.getAllByRole('link', { name: 'Analyser un article' })) {
        expect(link).toHaveAttribute('href', '/analyser');
      }
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

  it('states the offer without a card, and that the code is open', () => {
    render(<Accueil />);
    expect(screen.getByText('3 analyses offertes, sans carte bancaire.')).toBeInTheDocument();
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

  it('sets running text at 16 px or more, on a 68ch measure', () => {
    const { container } = render(<Accueil />);
    for (const p of container.querySelectorAll('p, dd, li > p')) {
      expect(p.className, p.textContent ?? '').not.toMatch(/\btext-(xs|sm)\b|text-\[[\d.]+px\]/);
    }
    expect(screen.getByText(/Collez un article : Squiggle surligne/).className).toContain('max-w-[68ch]');
    expect(screen.getByText(/n’est pas conservé\. Aucune publicité/).className).toContain('max-w-[68ch]');
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
