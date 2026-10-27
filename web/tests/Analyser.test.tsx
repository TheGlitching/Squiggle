/**
 * The analysis page, driven through `fetch` the way the browser drives it.
 * Pinned: a signed-out visitor runs one analysis without an account, then is
 * offered an account that keeps the report, without losing the paste; a
 * share lands in the form and leaves the address bar; a run walks the
 * session stages on the reader's cookie and never asks for the source page;
 * the report highlights the passages it discusses; a refusal says what to do.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AnalysisReport } from '../../shared/src/engine/types';
import type { Account } from '../src/api';
import { loadSeance, saveSeance } from '../src/classe';
import { loadDraft, saveDraft } from '../src/paste';
import { Analyser } from '../src/pages/Analyser';
import { account, jsonResponse, memoryStorage } from './helpers';

const TEXT = [
  'Depuis la rentrée, les cantines servent un repas végétarien par semaine, une mesure votée en juin.',
  'Selon un expert, la fréquentation aurait chuté de 30 % dès le premier mois.',
  'La mairie promet un bilan chiffré à la fin du trimestre, en reconnaissant qu’il est trop tôt pour conclure.',
].join('\n\n');

const REPORT: AnalysisReport = {
  schemaVersion: 1,
  score: 58,
  scoreBand: 'problematique',
  summary: 'Le texte avance un chiffre sans source.',
  categories: [
    { domain: 'robustesse_factuelle', label: 'Robustesse factuelle et sourcing', score: 14.5, maxScore: 35, strengths: [], weaknesses: [] },
  ],
  findings: [
    {
      id: 'f1',
      blockId: 'b3',
      quote: 'la fréquentation aurait chuté de 30 %',
      category: 'affirmation-non-etayee',
      severity: 3,
      label: 'Chiffre sans source',
      explanation: 'Ni institut, ni date, ni méthode.',
      confidence: 0.9,
      verification: 'douteuse',
      sources: [{ title: 'Statistiques publiques', url: 'https://stats.example/cantines', origin: 'search' }],
    },
    {
      id: 'f2',
      blockId: 'b9',
      quote: 'Une phrase que le texte ne contient pas.',
      category: 'cadrage',
      severity: 1,
      label: 'Formule appuyée',
      explanation: 'Le mot charge le constat.',
      confidence: 0.6,
    },
  ],
  claims: [],
  research: { performed: true, queries: [], withdrawn: [] },
  meta: { model: 'openrouter/test-model', promptVersion: '1.0.0', analyzedAt: '2026-10-23T10:00:00.000Z', durationMs: 1000 },
};

interface Seen {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
  credentials?: RequestCredentials;
}

/** The server as the page sees it: an account, then the five stages. */
function serve(who: Account | null, stages: { audit?: () => Response; hit?: boolean } = {}) {
  const seen: Seen[] = [];
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      seen.push({
        url,
        method: init?.method ?? 'GET',
        body: typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null,
        credentials: init?.credentials,
      });
      const path = url.split('?')[0];
      // The account answers a tick after the first render, as a network does: the
      // button stays disabled until then, and a test must wait for it.
      if (path === '/web/account') await new Promise((resolve) => setTimeout(resolve, 20));
      if (path === '/web/account') return who ? jsonResponse({ ok: true, ...who }) : jsonResponse({ ok: false, error: 'invalid_session' }, 401);
      const stage = path.replace(/^\/web\/(analyze|anon)\//, '');
      if (stage === 'check') return jsonResponse(stages.hit ? { ok: true, hit: true, report: REPORT } : { ok: true, hit: false });
      if (stage === 'audit') return stages.audit?.() ?? jsonResponse({ ok: true, runId: 'r1', report: REPORT, researchable: [] });
      if (stage === 'finalize') return jsonResponse({ ok: true, report: REPORT, cached: true });
      if (path === '/web/account/checkout') return jsonResponse({ ok: true, url: 'https://checkout.stripe.example/cs_1' });
      return jsonResponse({ ok: false, error: 'not_found' }, 404);
    }),
  );
  return seen;
}

/** The analyse button once the account has loaded: until then it is rightly disabled. */
async function analyseButton(): Promise<HTMLElement> {
  // Queried again on each try: a signed-out visitor's button replaces the loading one.
  const button = () => screen.getByRole('button', { name: 'Analyser le texte' });
  await waitFor(() => expect(button()).toBeEnabled());
  return button();
}

function at(path: string) {
  window.history.pushState({}, '', path);
}

function paste(text: string) {
  fireEvent.change(screen.getByLabelText('Texte de l’article'), { target: { value: text } });
}

beforeEach(() => {
  at('/analyser');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Analyser, signed out', () => {
  it('runs the visitor’s analysis without a cookie, then offers an account that keeps the report', async () => {
    const seen = serve(null);
    const first = render(<Analyser />);
    paste(TEXT);
    expect(await screen.findByText(/Une analyse offerte sans compte, chaque jour/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Se connecter' })).toHaveAttribute('href', '/connexion?next=/analyser');
    fireEvent.click(await analyseButton());

    expect(await screen.findByText('58')).toBeInTheDocument();
    const stages = seen.filter((s) => s.url.startsWith('/web/anon/'));
    expect(stages.map((s) => s.url.split('?')[0])).toEqual(['/web/anon/check', '/web/anon/audit', '/web/anon/finalize']);
    for (const stage of stages) expect(stage.credentials).toBe('omit');
    expect(seen.some((s) => s.url.startsWith('/web/analyze/'))).toBe(false);

    const keep = screen.getByRole('region', { name: 'Gardez ce rapport, et faites-en 3 de plus' });
    expect(within(keep).getByRole('link', { name: 'Créer un compte gratuit' })).toHaveAttribute(
      'href',
      '/connexion?next=%2Fanalyser%3Fapres%3Dessai',
    );
    first.unmount();

    // Back from that sign-in, in the same browser: the paste is there, and the
    // report comes back from the shared cache, without an audit.
    const draft = loadDraft();
    const back = serve(account(), { hit: true });
    saveDraft(draft);
    at('/analyser?apres=essai');
    render(<Analyser />);
    expect(await screen.findByText('58')).toBeInTheDocument();
    expect(back.map((s) => s.url.split('?')[0])).toEqual(['/web/account', '/web/analyze/check']);
    expect(screen.queryByRole('region', { name: /Gardez ce rapport/ })).toBeNull();
    await waitFor(() => expect(window.location.search).toBe(''));
  });

  it('leaves a returning reader on their text when the cache has no report for it', async () => {
    const seen = serve(account());
    saveDraft({ text: TEXT, title: '', source: '' });
    at('/analyser?apres=essai');
    render(<Analyser />);
    await analyseButton();
    await waitFor(() => expect(seen.some((s) => s.url.startsWith('/web/analyze/check'))).toBe(true));
    expect(seen.some((s) => s.url === '/web/analyze/audit')).toBe(false);
    expect(screen.queryByText('58')).toBeNull();
  });

  it('turns a refused visitor to an account, keeping the paste', async () => {
    serve(null, {
      audit: () => jsonResponse({ ok: false, error: 'anon_used', message: 'x' }, 429),
    });
    render(<Analyser />);
    paste(TEXT);
    fireEvent.click(await analyseButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(/analyse sans compte du jour est faite/);
    expect(screen.getByRole('link', { name: 'Créer un compte gratuit' })).toHaveAttribute('href', '/connexion?next=/analyser');
    expect(screen.queryByRole('button', { name: 'Analyser le texte' })).toBeNull();
    expect(screen.getByLabelText('Texte de l’article')).toHaveValue(TEXT);
  });
});

describe('Analyser, from a share', () => {
  it('puts a shared text in the form and wipes it from the address bar', async () => {
    serve(account());
    at(`/analyser?${new URLSearchParams({ title: 'Cantines', text: TEXT })}`);
    render(<Analyser />);
    expect(screen.getByLabelText('Texte de l’article')).toHaveValue(TEXT);
    expect(screen.getByLabelText(/Titre/)).toHaveValue('Cantines');
    await waitFor(() => expect(window.location.search).toBe(''));
  });

  it('takes a shared address as the source only, and asks for the text', async () => {
    serve(account());
    at(`/analyser?${new URLSearchParams({ title: 'Cantines', text: 'https://presse.example/cantines' })}`);
    render(<Analyser />);
    expect(screen.getByLabelText(/Adresse de l’article/)).toHaveValue('https://presse.example/cantines');
    expect(screen.getByLabelText('Texte de l’article')).toHaveValue('');
    expect(screen.getByRole('status')).toHaveTextContent(/Collez maintenant le texte de l’article/);
  });
});

describe('Analyser, signed in', () => {
  it('runs the session stages on the cookie, never fetches the source, and annotates the text', async () => {
    const seen = serve(account());
    render(<Analyser />);
    paste(TEXT);
    fireEvent.change(screen.getByLabelText(/Adresse de l’article/), { target: { value: 'https://presse.example/cantines' } });
    fireEvent.click(await analyseButton());

    expect(await screen.findByText('58')).toBeInTheDocument();
    const stages = seen.filter((s) => s.url.startsWith('/web/analyze/'));
    expect(stages.map((s) => s.url.split('?')[0])).toEqual(['/web/analyze/check', '/web/analyze/audit', '/web/analyze/finalize']);
    // The model behind a report changes over time; the page never names it.
    expect(screen.queryByText(/test-model/)).toBeNull();
    for (const stage of stages) expect(stage.credentials).toBe('include');
    expect(stages[1].body).toMatchObject({ url: 'https://presse.example/cantines', citedSources: [] });
    expect(seen.some((s) => s.url.includes('presse.example') && !s.url.startsWith('/web/'))).toBe(false);

    // The passage is highlighted in the pasted text and leads to its finding.
    const passage = screen.getByRole('link', { name: /la fréquentation aurait chuté de 30 %/ });
    expect(passage).toHaveAttribute('href', '#constat-f1');
    const card = screen.getByRole('article', { name: 'Chiffre sans source' });
    expect(within(card).getByText('Douteuse')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Statistiques publiques' })).toHaveAttribute('href', 'https://stats.example/cantines');
    // Each finding names its notion in the glossary, in a new tab so the report stays open.
    const notion = within(card).getByRole('link', { name: 'Glossaire : Chiffre sans origine (nouvel onglet)' });
    expect(notion).toHaveAttribute('href', '/glossaire/chiffre-sans-origine');
    expect(notion).toHaveAttribute('target', '_blank');
    expect(
      within(screen.getByRole('article', { name: 'Formule appuyée' })).getByRole('link', { name: /Glossaire : Vocabulaire chargé/ }),
    ).toHaveAttribute('href', '/glossaire/vocabulaire-charge');
    // A quote the text does not contain is still reported, and says so.
    expect(
      within(screen.getByRole('article', { name: 'Formule appuyée' })).getByText(/n’a pas été retrouvé tel quel/),
    ).toBeInTheDocument();
  });

  it('counts a finding reported as wrong by its category and a reason from the list, never its text', async () => {
    const seen = serve(account());
    render(<Analyser />);
    paste(TEXT);
    fireEvent.click(await analyseButton());
    await screen.findByText('58');

    const card = screen.getByRole('article', { name: 'Chiffre sans source' });
    await userEvent.click(within(card).getByRole('button', { name: 'Signaler une erreur' }));
    const reasons = within(card).getByRole('group', { name: 'Qu’est-ce qui ne va pas ?' });
    expect(within(reasons).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Le passage ne dit pas cela',
      'L’article donne sa source',
      'Ce n’est pas ce procédé',
      'Trop sévère',
      'Autre raison',
      'Annuler',
    ]);
    await userEvent.click(within(reasons).getByRole('button', { name: 'L’article donne sa source' }));
    expect(within(card).getByRole('status')).toHaveTextContent('Merci, c’est noté.');
    expect(within(card).queryByRole('button', { name: 'Signaler une erreur' })).toBeNull();

    const counts = seen.filter((s) => s.url.endsWith('/web/count'));
    expect(counts.map((s) => s.body)).toEqual([{ name: 'flag_finding_affirmation_non_etayee' }, { name: 'flag_reason_sourced' }]);
    for (const c of counts) expect(c.credentials).toBe('omit');

    // Cancelling sends nothing.
    const other = screen.getByRole('article', { name: 'Formule appuyée' });
    await userEvent.click(within(other).getByRole('button', { name: 'Signaler une erreur' }));
    await userEvent.click(within(other).getByRole('button', { name: 'Annuler' }));
    expect(within(other).getByRole('button', { name: 'Signaler une erreur' })).toBeInTheDocument();
    expect(seen.filter((s) => s.url.endsWith('/web/count'))).toHaveLength(2);
  });

  it('prepares the report for the class, in this browser only', async () => {
    vi.stubGlobal('sessionStorage', memoryStorage());
    const seen = serve(account());
    render(<Analyser />);
    paste(TEXT);
    fireEvent.change(screen.getByLabelText(/Titre/), { target: { value: 'Cantines' } });
    fireEvent.click(await analyseButton());
    await screen.findByText('58');
    const requests = seen.length;

    fireEvent.click(screen.getByRole('button', { name: 'Préparer pour la classe' }));
    expect(window.location.pathname).toBe('/classe');
    const seance = loadSeance();
    expect(seance).toMatchObject({ title: 'Cantines', fromFile: false, hideScore: true });
    expect(seance?.report.score).toBe(58);
    expect(seance?.blocks[0]).toMatchObject({ type: 'heading', text: 'Cantines' });
    // Preparing sends nothing: the report and the text are already in the page.
    expect(seen).toHaveLength(requests);
    saveSeance(null);
  });

  it('sends a text without an address as one, so it is filed by its words alone', async () => {
    const seen = serve(account());
    render(<Analyser />);
    paste(TEXT);
    fireEvent.click(await analyseButton());
    await screen.findByText('58');
    expect(seen.find((s) => s.url.startsWith('/web/analyze/check'))?.url).not.toContain('url=');
    expect(seen.find((s) => s.url === '/web/analyze/audit')?.body).not.toHaveProperty('url');
  });

  it('reads a pasted video transcript without its times, and puts them back in the report', async () => {
    const transcript = [
      '0:00',
      '0 secondes',
      'Depuis la rentrée, les cantines servent un repas végétarien par semaine, une mesure votée en juin par le conseil municipal',
      '0:07',
      '7 secondes',
      'et que la mairie présente comme un succès. Alors on est allé voir sur place ce que les parents et les enfants en pensent vraiment.',
      '0:15',
      '15 secondes',
      'Dans cette école du centre-ville, les avis sont partagés : certains parents applaudissent, d’autres beaucoup moins.',
      '1:02',
      '1 minute et 2 secondes',
      'Selon un expert, la fréquentation aurait chuté de 30 % dès le premier mois.',
    ].join('\n');
    const seen = serve(account());
    render(<Analyser />);
    expect(screen.getByText(/Une vidéo YouTube \? Copiez sa transcription/)).toBeInTheDocument();
    paste(transcript);
    expect(screen.getByText(/Transcription reconnue : les horodatages sont retirés/)).toBeInTheDocument();
    fireEvent.click(await analyseButton());
    await screen.findByText('58');

    // The server reads the speech alone.
    const blocks = seen.find((s) => s.url === '/web/analyze/audit')?.body?.blocks as Array<{ text: string }>;
    expect(blocks.map((b) => b.text).join(' ')).not.toMatch(/\d:\d\d|secondes/);
    expect(seen.filter((s) => s.url === '/web/count').map((s) => s.body)).toEqual([{ name: 'paste_transcript' }]);

    // The report times each passage and each finding.
    const text = screen.getByRole('article', { name: /Le texte collé/ });
    expect(within(text).getByText('0:00')).toBeInTheDocument();
    expect(within(text).getByText('1:02')).toBeInTheDocument();
    const card = screen.getByRole('article', { name: 'Chiffre sans source' });
    expect(card).toHaveTextContent('À 1:02 dans la vidéo');
  });

  it('stops a paste too short to be an article, before any request', async () => {
    const seen = serve(account());
    render(<Analyser />);
    paste('https://presse.example/cantines');
    fireEvent.click(await analyseButton());
    expect(screen.getByRole('alert')).toHaveTextContent(/au moins 200 caractères/);
    expect(seen.filter((s) => s.url.startsWith('/web/analyze/'))).toEqual([]);
  });

  it('keeps the text and asks for a retry in a few minutes when the model cannot answer', async () => {
    serve(account(), {
      audit: () => jsonResponse({ ok: false, error: 'provider_unavailable', message: 'x' }, 502),
    });
    render(<Analyser />);
    paste(TEXT);
    fireEvent.click(await analyseButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(/momentanément indisponible.*quelques minutes/);
    expect(screen.getByLabelText('Texte de l’article')).toHaveValue(TEXT);
  });

  it('offers the subscription, payable here, not the button, once the trial is used', async () => {
    serve(account({ usage: { used: 3, limit: 3, remaining: 0, resetsAt: null } }));
    render(<Analyser />);
    paste(TEXT);
    const offer = await screen.findByRole('region', { name: 'Essai épuisé' });
    expect(within(offer).getByText('60 analyses par mois, 4,99 €, sans engagement.')).toBeInTheDocument();
    expect(within(offer).getByRole('button', { name: /s’abonner : 4,99 €\/mois/i })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Analyser le texte' })).toBeNull();
  });

  it('says under each report how many trial analyses are left', async () => {
    const me = account({ usage: { used: 0, limit: 3, remaining: 3, resetsAt: null } });
    serve(me);
    render(<Analyser />);
    paste(TEXT);
    fireEvent.click(await analyseButton());
    me.usage = { used: 1, limit: 3, remaining: 2, resetsAt: null };
    await screen.findByText('58');
    expect(await screen.findByText('Il vous reste 2 analyses offertes.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Essai épuisé' })).toBeNull();
  });

  it('after the last trial analysis, pays from under the report and comes back here', async () => {
    const me = account({ usage: { used: 2, limit: 3, remaining: 1, resetsAt: null } });
    const seen = serve(me);
    render(<Analyser />);
    paste(TEXT);
    fireEvent.click(await analyseButton());
    me.usage = { used: 3, limit: 3, remaining: 0, resetsAt: null };
    await screen.findByText('58');

    const offer = await screen.findByRole('region', { name: 'Essai épuisé' });
    const subscribe = within(offer).getByRole('button', { name: /s’abonner/i });
    expect(subscribe).toBeDisabled();
    fireEvent.click(within(offer).getByRole('checkbox', { name: /commence dès le paiement/ }));
    fireEvent.click(subscribe);
    await waitFor(() => expect(seen.some((s) => s.url === '/web/account/checkout')).toBe(true));
    expect(seen.find((s) => s.url === '/web/account/checkout')?.body).toEqual({ retour: '/analyser' });
  });

  it('thanks the reader back from the payment, and keeps the text', async () => {
    serve(account({ plan: 'active', usage: { used: 0, limit: 60, remaining: 60, resetsAt: null } }));
    at('/analyser?paiement=ok');
    render(<Analyser />);
    expect(screen.getByRole('status')).toHaveTextContent(/Merci ! Votre abonnement s’active/);
    await waitFor(() => expect(window.location.search).toBe(''));
  });
});

describe('Analyser, from the clipboard', () => {
  function clipboard(readText: () => Promise<string>) {
    Object.defineProperty(navigator, 'clipboard', { value: { readText }, configurable: true });
  }

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
  });

  it('reads the copied text and starts the analysis in the same tap', async () => {
    const seen = serve(account());
    clipboard(async () => TEXT);
    render(<Analyser />);
    await analyseButton();
    fireEvent.click(screen.getByRole('button', { name: 'Coller le texte copié' }));
    expect(await screen.findByText('58')).toBeInTheDocument();
    expect(seen.filter((s) => s.url.startsWith('/web/analyze/'))).toHaveLength(3);
  });

  it('starts a visitor’s analysis in the same tap', async () => {
    const seen = serve(null);
    clipboard(async () => TEXT);
    render(<Analyser />);
    await analyseButton();
    fireEvent.click(screen.getByRole('button', { name: 'Coller le texte copié' }));
    expect(await screen.findByText('58')).toBeInTheDocument();
    expect(seen.filter((s) => s.url.startsWith('/web/anon/'))).toHaveLength(3);
  });

  it('fills the form but leaves the next step to the account when it cannot analyse', async () => {
    const seen = serve(account({ usage: { used: 3, limit: 3, remaining: 0, resetsAt: null } }));
    clipboard(async () => TEXT);
    render(<Analyser />);
    await screen.findByText('Essai épuisé');
    fireEvent.click(screen.getByRole('button', { name: 'Coller le texte copié' }));
    await waitFor(() => expect(screen.getByLabelText('Texte de l’article')).toHaveValue(TEXT));
    expect(seen.filter((s) => s.url.startsWith('/web/analyze/'))).toEqual([]);
  });

  it('stops a copied text the server would refuse, before any request', async () => {
    const seen = serve(account());
    clipboard(async () => 'Trop court.');
    render(<Analyser />);
    await analyseButton();
    fireEvent.click(screen.getByRole('button', { name: 'Coller le texte copié' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/au moins 200 caractères/);
    expect(seen.filter((s) => s.url.startsWith('/web/analyze/'))).toEqual([]);
  });

  it('sends a copied address to the source field and asks for the text', async () => {
    serve(account());
    clipboard(async () => 'https://presse.example/cantines');
    render(<Analyser />);
    fireEvent.click(screen.getByRole('button', { name: 'Coller le texte copié' }));
    await waitFor(() => expect(screen.getByLabelText(/Adresse de l’article/)).toHaveValue('https://presse.example/cantines'));
    expect(screen.getByRole('status')).toHaveTextContent(/Collez maintenant le texte de l’article/);
  });

  it('falls back to a long press when the clipboard is refused or missing', async () => {
    serve(account());
    clipboard(() => Promise.reject(new DOMException('denied', 'NotAllowedError')));
    render(<Analyser />);
    fireEvent.click(screen.getByRole('button', { name: 'Coller le texte copié' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/appuyez longuement dans le champ, puis Coller/);
    expect(screen.getByLabelText('Texte de l’article')).toHaveFocus();
    cleanup();

    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    render(<Analyser />);
    fireEvent.click(screen.getByRole('button', { name: 'Coller le texte copié' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/appuyez longuement/);
  });
});
