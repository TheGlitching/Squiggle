/**
 * The analysis page, driven through `fetch` the way the browser drives it.
 * Pinned: a signed-out visitor runs one analysis without an account, then is
 * offered an account that keeps the report, without losing the paste; a
 * report with findings kept back draws them blurred, with no word of them,
 * and shows them whole once the reader is back signed in; a
 * share lands in the form and leaves the address bar; a run walks the
 * session stages on the reader's cookie and never asks for the source page;
 * the report highlights the passages it discusses; a refusal says what to do.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AnalysisReport } from '../../shared/src/engine/types';
import type { Account } from '../src/api';
import { loadSeance, saveSeance } from '../src/classe';
import { readCaptures, takeSharedCaptures } from '../src/captures';
import { readPdfFile } from '../src/pdf';
import { mediaDuration, soundPart, takeSharedMedia } from '../src/media';
import { pageFragment } from '../src/favori/payload';
import { loadDraft, saveDraft } from '../src/paste';
import { Analyser } from '../src/pages/Analyser';
import { account, jsonResponse, memoryStorage } from './helpers';

// The OCR itself is pinned on real screenshots in captures-ocr.test.ts; here it is the page around it.
vi.mock('../src/captures', async (actual) => ({
  ...(await actual<typeof import('../src/captures')>()),
  readCaptures: vi.fn(),
  takeSharedCaptures: vi.fn(),
}));
// The PDF layout is pinned in shared/tests/pdf.test.ts, and pdf.js in the browser; here it is the page around it.
vi.mock('../src/pdf', async (actual) => ({
  ...(await actual<typeof import('../src/pdf')>()),
  readPdfFile: vi.fn(),
}));

// Decoding needs a real browser's audio stack; here it is the page around it.
vi.mock('../src/media', async (actual) => ({
  ...(await actual<typeof import('../src/media')>()),
  mediaDuration: vi.fn(),
  soundPart: vi.fn(),
  takeSharedMedia: vi.fn(),
}));

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
function serve(
  who: Account | null,
  stages: {
    account?: () => Response;
    audit?: () => Response;
    hit?: boolean;
    link?: boolean;
    finalize?: AnalysisReport;
    transcribe?: () => Response;
  } = {},
) {
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
      if (path === '/web/account' && stages.account) return stages.account();
      if (path === '/web/account') return who ? jsonResponse({ ok: true, ...who }) : jsonResponse({ ok: false, error: 'invalid_session' }, 401);
      const stage = path.replace(/^\/web\/(analyze|anon)\//, '');
      if (stage === 'link')
        return jsonResponse(stages.link ? { ok: true, hit: true, report: REPORT, cachedAt: 1 } : { ok: true, hit: false });
      if (stage === 'check') return jsonResponse(stages.hit ? { ok: true, hit: true, report: REPORT } : { ok: true, hit: false });
      if (stage === 'audit') return stages.audit?.() ?? jsonResponse({ ok: true, runId: 'r1', report: REPORT, researchable: [] });
      if (stage === 'finalize') return jsonResponse({ ok: true, report: stages.finalize ?? REPORT, cached: true });
      if (path === '/web/transcribe') return stages.transcribe?.() ?? jsonResponse({ ok: false, error: 'not_found' }, 404);
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
  fireEvent.change(screen.getByLabelText('Texte de l’article ou du message'), { target: { value: text } });
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
    expect(await screen.findByText(/Une analyse offerte sans compte\./)).toBeInTheDocument();
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

  it('draws the findings a visitor’s report kept back blurred, then shows them whole once signed in', async () => {
    const withheld: AnalysisReport = {
      ...REPORT,
      findings: [REPORT.findings[0]],
      withheld: [{ category: 'cadrage', severity: 1 }],
    };
    serve(null, { finalize: withheld });
    const first = render(<Analyser />);
    paste(TEXT);
    fireEvent.click(await analyseButton());

    expect(await screen.findByText('Chiffre sans source')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '2 constats' })).toBeInTheDocument();
    // Nothing of the second finding is on the page: the server never sent it.
    expect(screen.queryByText('Formule appuyée')).toBeNull();
    expect(screen.getByText('Créez un compte gratuit pour voir l’autre constat.')).toBeInTheDocument();
    for (const link of screen.getAllByRole('link', { name: 'Créer un compte gratuit' })) {
      expect(link).toHaveAttribute('href', '/connexion?next=%2Fanalyser%3Fapres%3Dflou');
    }
    // A class session is prepared from a whole report only.
    expect(screen.queryByRole('button', { name: 'Préparer pour la classe' })).toBeNull();
    first.unmount();

    const draft = loadDraft();
    const back = serve(account(), { hit: true });
    saveDraft(draft);
    at('/analyser?apres=flou');
    render(<Analyser />);
    expect(await screen.findByText('Formule appuyée')).toBeInTheDocument();
    expect(back.map((s) => s.url.split('?')[0])).toEqual(['/web/account', '/web/analyze/check']);
    expect(screen.queryByText(/Créez un compte gratuit pour voir/)).toBeNull();
  });

  it('follows the stages the server runs, one at a time, and draws none ahead of it', async () => {
    let answer: ((res: Response) => void) | null = null;
    serve(null, {
      audit: () => new Promise<Response>((resolve) => (answer = resolve)) as unknown as Response,
    });
    render(<Analyser />);
    paste(TEXT);
    fireEvent.click(await analyseButton());

    const current = () => document.querySelector('[aria-current="step"]')?.textContent ?? '';
    await waitFor(() => expect(current()).toContain('Lecture : en cours'));
    expect(screen.getByText('Recherche des sources')).toBeInTheDocument();
    expect(screen.queryByText(/: fait$/)).toBeNull();
    expect(screen.queryByLabelText('Texte de l’article')).not.toBeInTheDocument();

    // The step shows from the cache lookup on, which comes before the audit is asked:
    // answering before then would answer nothing, and the run would hang.
    await waitFor(() => expect(answer).not.toBeNull());
    // The audit answered with nothing to look up: the run goes straight to the report.
    answer!(jsonResponse({ ok: true, runId: 'r1', report: REPORT, researchable: [] }));
    expect(await screen.findByText('58')).toBeInTheDocument();
    // Nor does it come back around the report.
    expect(screen.queryByLabelText('Texte de l’article')).not.toBeInTheDocument();
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

  it('keeps the analysis without an account when the account cannot be checked', async () => {
    const seen = serve(null, {
      account: () => jsonResponse({ ok: false, error: 'origin_not_allowed', message: 'x' }, 403),
    });
    render(<Analyser />);
    paste(TEXT);
    fireEvent.click(await analyseButton());
    expect(await screen.findByText('58')).toBeInTheDocument();
    expect(seen.some((s) => s.url === '/web/anon/audit')).toBe(true);
    expect(screen.queryByText(/n’a pas pu être vérifié/)).toBeNull();
  });

  it('turns a refused visitor to an account, keeping the paste', async () => {
    serve(null, {
      audit: () => jsonResponse({ ok: false, error: 'anon_used', message: 'x' }, 429),
    });
    render(<Analyser />);
    paste(TEXT);
    fireEvent.click(await analyseButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Votre analyse offerte sans compte est déjà faite. Créez un compte gratuit : 3 analyses de plus vous sont offertes.',
    );
    expect(screen.getByRole('link', { name: 'Créer un compte gratuit' })).toHaveAttribute('href', '/connexion?next=/analyser');
    expect(screen.queryByRole('button', { name: 'Analyser le texte' })).toBeNull();
    expect(screen.getByLabelText('Texte de l’article ou du message')).toHaveValue(TEXT);
  });
});

describe('Analyser, from a share', () => {
  it('puts a shared text in the form and wipes it from the address bar', async () => {
    serve(account());
    at(`/analyser?${new URLSearchParams({ title: 'Cantines', text: TEXT })}`);
    render(<Analyser />);
    expect(screen.getByLabelText('Texte de l’article ou du message')).toHaveValue(TEXT);
    expect(screen.getByLabelText(/Titre/)).toHaveValue('Cantines');
    await waitFor(() => expect(window.location.search).toBe(''));
  });

  it('reads the iPhone shortcut’s article after the #, and wipes it from the address bar', async () => {
    serve(account());
    // As `web/shortcut/page.ts` writes it: encodeURIComponent, so a "+" stays a "+".
    const fields = { title: 'Cantines', text: `${TEXT}\n1 + 1 = 2 & c’est tout`, url: 'https://presse.example/cantines' };
    at(`/analyser#${Object.entries(fields).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`);
    render(<Analyser />);
    expect(screen.getByLabelText('Texte de l’article ou du message')).toHaveValue(fields.text);
    expect(screen.getByLabelText(/Titre/)).toHaveValue('Cantines');
    expect(screen.getByLabelText(/Adresse de l’article/)).toHaveValue('https://presse.example/cantines');
    await waitFor(() => expect(window.location.hash).toBe(''));
  });

  it('takes a shared address as the source only, and asks for the text', async () => {
    serve(account());
    at(`/analyser?${new URLSearchParams({ title: 'Cantines', text: 'https://presse.example/cantines' })}`);
    render(<Analyser />);
    expect(screen.getByLabelText(/Adresse de l’article/)).toHaveValue('https://presse.example/cantines');
    expect(screen.getByLabelText('Texte de l’article ou du message')).toHaveValue('');
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/pas encore de rapport. Collez maintenant le texte de l’article/),
    );
  });

  it('serves the report a reader made with the extension from a shared video link, sending only the link', async () => {
    const seen = serve(null, { link: true });
    const link = 'https://youtu.be/dQw4w9WgXcQ?si=AbCdEf123';
    at(`/analyser?${new URLSearchParams({ text: link })}`);
    render(<Analyser />);

    const watch = await screen.findByRole('link', { name: 'Regarder la vidéo sur YouTube' });
    expect(watch).toHaveAttribute('href', link);
    expect(screen.getByText(/courtes citations/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Chiffre sans source' })).toBeInTheDocument();
    // No text to annotate, and no claim that a passage is missing from one.
    expect(screen.queryByRole('heading', { name: 'Le texte, annoté' })).toBeNull();
    expect(screen.queryByText(/n’a pas été retrouvé/)).toBeNull();

    const lookup = seen.find((s) => s.url.startsWith('/web/anon/link'))!;
    expect(new URL(lookup.url, 'https://squiggle.example').searchParams.get('url')).toBe(link);
    expect(lookup.credentials).toBe('omit');
    expect(seen.some((s) => /\/(check|audit|finalize)/.test(s.url))).toBe(false);
  });

  it('points to the publisher above an article’s report found by its link', async () => {
    serve(account(), { link: true });
    at(`/analyser?${new URLSearchParams({ title: 'Cantines', url: 'https://m.presse.example/cantines' })}`);
    render(<Analyser />);
    expect(await screen.findByRole('link', { name: 'Lire l’article sur presse.example' })).toHaveAttribute(
      'href',
      'https://m.presse.example/cantines',
    );
  });

  it('says in one sentence how to analyse a video nobody has analysed yet', async () => {
    serve(null);
    at(`/analyser?${new URLSearchParams({ text: 'https://youtu.be/dQw4w9WgXcQ' })}`);
    render(<Analyser />);
    expect(screen.getByRole('status')).toHaveTextContent(/Recherche d’un rapport/);
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        /Cette vidéo n’a pas encore de rapport : collez ici sa transcription .* avec l’extension Squiggle\./,
      ),
    );
  });

  it('gives a phone a next step it can take, since its YouTube app does not let a transcript be copied', async () => {
    const original = navigator.userAgent;
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
      configurable: true,
    });
    try {
      serve(null);
      at(`/analyser?${new URLSearchParams({ text: 'https://youtu.be/dQw4w9WgXcQ' })}`);
      render(<Analyser />);
      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent(
          /ne lit pas encore les vidéos sur téléphone\. Envoyez-vous ce lien par e-mail, puis ouvrez-le sur un ordinateur/,
        ),
      );
      expect(screen.getByRole('status')).not.toHaveTextContent(/transcription/);
    } finally {
      Object.defineProperty(navigator, 'userAgent', { value: original, configurable: true });
    }
  });
});

describe('Analyser, a whole text from the iPhone shortcut or the Android app', () => {
  it.each([
    ['raccourci', 'entry_shortcut'],
    ['appli', 'entry_app_text'],
  ])('analyses it at once for via=%s, and counts %s', async (via, counter) => {
    const seen = serve(account());
    at(`/analyser#${new URLSearchParams({ text: TEXT, via })}`);
    render(<Analyser />);
    expect(await screen.findByText('58')).toBeInTheDocument();
    expect(seen.filter((s) => s.url === '/web/count').map((s) => s.body)).toEqual([{ name: counter }]);
  });

  it('reads a share that arrives while the page is already open, as the app’s tab only changes the fragment', async () => {
    const seen = serve(account());
    at('/analyser');
    render(<Analyser />);
    window.location.hash = new URLSearchParams({ text: TEXT, via: 'appli' }).toString();
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(await screen.findByText('58')).toBeInTheDocument();
    expect(seen.filter((s) => s.url === '/web/count').map((s) => s.body)).toEqual([{ name: 'entry_app_text' }]);
  });

  it('keeps a text too short to claim anything in the field, and says why it is not analysed', async () => {
    const seen = serve(account());
    const message = 'Vu, merci !';
    at(`/analyser#${new URLSearchParams({ text: message, via: 'appli' })}`);
    render(<Analyser />);
    expect(screen.getByRole('status')).toHaveTextContent(/Ce message est trop court pour être analysé/);
    expect(screen.getByLabelText(/Texte/)).toHaveValue(message);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(seen.filter((s) => s.url.startsWith('/web/analyze/'))).toEqual([]);
    expect(seen.filter((s) => s.url === '/web/count').map((s) => s.body)).toEqual([{ name: 'entry_short_message' }]);
  });
});

describe('Analyser, from the bookmark', () => {
  const favori = (payload: Record<string, string>) => `/analyser#${new URLSearchParams({ ...payload, via: 'favori' })}`;

  it('analyses the article the bookmark read, and wipes it from the address bar', async () => {
    const seen = serve(account());
    at(favori({ title: 'Cantines', url: 'https://presse.example/cantines', text: TEXT }));
    render(<Analyser />);
    expect(await screen.findByText('58')).toBeInTheDocument();
    expect(window.location.hash).toBe('');
    const audit = seen.find((s) => s.url === '/web/analyze/audit');
    expect(audit?.body).toMatchObject({ url: 'https://presse.example/cantines', title: 'Cantines' });
    expect(seen.filter((s) => s.url === '/web/count').map((s) => s.body)).toEqual([{ name: 'entry_bookmarklet' }]);
  });

  it('analyses at once a message shared to the Android app, as the message itself and not a title', async () => {
    const seen = serve(account());
    const rumour = 'URGENT ⚠️ à partir du 1er novembre la CAF supprime les APL pour les retraités propriétaires. Transférez à tous vos contacts !';
    at(`/analyser#${new URLSearchParams({ text: rumour, via: 'appli' })}`);
    render(<Analyser />);
    expect(await screen.findByText('58')).toBeInTheDocument();
    expect(window.location.hash).toBe('');
    const audit = seen.find((s) => s.url === '/web/analyze/audit');
    expect(audit?.body).toMatchObject({ title: '', blocks: [{ text: rumour }] });
    expect(seen.filter((s) => s.url === '/web/count').map((s) => s.body)).toEqual([{ name: 'entry_app_text' }]);
  });

  it('shows the analysis as started from the first frame, with nothing to tap', async () => {
    const seen = serve(account());
    at(favori({ title: 'Cantines', url: 'https://presse.example/cantines', text: TEXT }));
    render(<Analyser />);
    // The account is still being checked, and the page already says the analysis is running.
    expect(screen.getByRole('status')).toHaveTextContent('Analyse lancée automatiquement');
    expect(document.querySelector('[aria-current="step"]')?.textContent).toContain('Lecture : en cours');
    // The run is all the page shows: no form under it, and one thing to tap, to stop it.
    expect(screen.queryByLabelText('Texte de l’article')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Annuler']);
    expect(await screen.findByText('58')).toBeInTheDocument();
    expect(seen.filter((s) => s.url === '/web/analyze/audit')).toHaveLength(1);
  });

  it('can be cancelled before the account has answered', async () => {
    const seen = serve(account());
    at(favori({ title: 'Cantines', url: 'https://presse.example/cantines', text: TEXT }));
    render(<Analyser />);
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(await screen.findByText('Analyse annulée. Votre texte est toujours là.')).toBeInTheDocument();
    await analyseButton();
    expect(seen.filter((s) => s.url.startsWith('/web/analyze/'))).toEqual([]);
  });

  it('leaves the article in the form when the account cannot analyse it', async () => {
    const seen = serve(account({ usage: { used: 3, limit: 3, remaining: 0, resetsAt: null } }));
    at(favori({ title: 'Cantines', url: 'https://presse.example/cantines', text: TEXT }));
    render(<Analyser />);
    await screen.findByText('Essai épuisé');
    expect(screen.getByLabelText('Texte de l’article ou du message')).toHaveValue(TEXT);
    expect(seen.filter((s) => s.url.startsWith('/web/analyze/'))).toEqual([]);
  });
});

describe('Analyser, from the bookmark that brings the page', () => {
  const html = (body: string) =>
    `<html><head><title>Cantines</title><link rel="canonical" href="https://presse.example/cantines"></head><body>${body}</body></html>`;
  const articlePage = html(`<article><h1>Cantines</h1>${TEXT.split('\n').map((line) => `<p>${line}</p>`).join('')}</article>`);

  it('reads the article out of the page, then analyses it at once', async () => {
    const seen = serve(account());
    at(`/analyser${await pageFragment(articlePage, 'https://presse.example/cantines?xtor=RSS')}`);
    render(<Analyser />);
    expect(screen.getByRole('status')).toHaveTextContent('Analyse lancée automatiquement');
    expect(await screen.findByText('58')).toBeInTheDocument();
    expect(window.location.hash).toBe('');
    const audit = seen.find((s) => s.url === '/web/analyze/audit');
    expect(audit?.body).toMatchObject({ url: 'https://presse.example/cantines', title: 'Cantines' });
    expect(seen.filter((s) => s.url === '/web/count').map((s) => s.body)).toEqual([{ name: 'entry_bookmarklet' }]);
  });

  it('says so, and analyses nothing, when the page has no article in it', async () => {
    const seen = serve(account());
    at(`/analyser${await pageFragment(html('<nav><a href="/">Accueil</a></nav>'), 'https://presse.example/')}`);
    render(<Analyser />);
    expect(await screen.findByText(/Squiggle n’a pas trouvé d’article dans la page que le favori a apportée/)).toBeInTheDocument();
    await analyseButton();
    expect(seen.filter((s) => s.url.startsWith('/web/analyze/'))).toEqual([]);
  });

  it('can be cancelled while the page is still being read', async () => {
    const seen = serve(account());
    at(`/analyser${await pageFragment(articlePage, 'https://presse.example/cantines')}`);
    render(<Analyser />);
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    await analyseButton();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(seen.filter((s) => s.url.startsWith('/web/analyze/'))).toEqual([]);
  });
});

describe('Analyser, a link received alone', () => {
  const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
  const original = navigator.userAgent;
  const agent = (value: string) => Object.defineProperty(navigator, 'userAgent', { value, configurable: true });

  afterEach(() => agent(original));

  function receive() {
    serve(account());
    at(`/analyser?${new URLSearchParams({ text: 'https://presse.example/cantines?xtor=RSS' })}`);
    render(<Analyser />);
  }

  it('opens it in Chrome on Android, not in the publisher’s app', () => {
    agent(ANDROID);
    receive();
    expect(screen.getByRole('link', { name: 'Ouvrir dans le navigateur' })).toHaveAttribute(
      'href',
      `intent://presse.example/cantines?xtor=RSS#Intent;scheme=https;action=android.intent.action.VIEW;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent('https://presse.example/cantines?xtor=RSS')};end`,
    );
    expect(screen.getByRole('heading', { name: 'Depuis une appli de presse' })).toBeInTheDocument();
  });

  it('opens it in Safari on an iPhone', () => {
    agent(IPHONE);
    receive();
    expect(screen.getByRole('link', { name: 'Ouvrir dans le navigateur' })).toHaveAttribute(
      'href',
      'x-safari-https://presse.example/cantines?xtor=RSS',
    );
  });

  it('leaves the last report’s article behind, and keeps a text pasted before its address', () => {
    serve(account());
    saveDraft({ title: 'Budget', source: 'https://presse.example/budget', text: TEXT });
    at(`/analyser?${new URLSearchParams({ text: 'https://presse.example/cantines' })}`);
    render(<Analyser />);
    expect(screen.getByLabelText('Texte de l’article ou du message')).toHaveValue('');
    expect(screen.getByRole('link', { name: 'Ouvrir l’article' })).toBeInTheDocument();
    cleanup();

    saveDraft({ title: '', source: '', text: TEXT });
    at(`/analyser?${new URLSearchParams({ text: 'https://presse.example/cantines' })}`);
    render(<Analyser />);
    expect(screen.getByLabelText('Texte de l’article ou du message')).toHaveValue(TEXT);
    expect(screen.getByLabelText(/Adresse de l’article/)).toHaveValue('https://presse.example/cantines');
  });

  it('is a plain link on a computer, with no phone guide', () => {
    receive();
    expect(screen.getByRole('link', { name: 'Ouvrir l’article' })).toHaveAttribute('href', 'https://presse.example/cantines?xtor=RSS');
    expect(screen.queryByRole('heading', { name: 'Depuis une appli de presse' })).toBeNull();
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

  it('sends one analysis for two taps in a row', async () => {
    const seen = serve(account());
    render(<Analyser />);
    paste(TEXT);
    const button = await analyseButton();
    // The second tap lands before the page has redrawn without the button.
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(await screen.findByText('58')).toBeInTheDocument();
    expect(seen.filter((s) => s.url === '/web/analyze/audit')).toHaveLength(1);
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
    expect(card).toHaveTextContent('À 1:02 dans l’enregistrement');
  });

  it('stops a paste that is only an address, before any request', async () => {
    const seen = serve(account());
    render(<Analyser />);
    paste('https://presse.example/cantines');
    fireEvent.click(await analyseButton());
    expect(screen.getByRole('alert')).toHaveTextContent(/n’est qu’une adresse/);
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
    expect(screen.getByLabelText('Texte de l’article ou du message')).toHaveValue(TEXT);
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
    await waitFor(() => expect(screen.getByLabelText('Texte de l’article ou du message')).toHaveValue(TEXT));
    expect(seen.filter((s) => s.url.startsWith('/web/analyze/'))).toEqual([]);
  });

  it('stops a copied text the server would refuse, before any request', async () => {
    const seen = serve(account());
    clipboard(async () => 'Trop court.');
    render(<Analyser />);
    await analyseButton();
    fireEvent.click(screen.getByRole('button', { name: 'Coller le texte copié' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/au moins 20 caractères/);
    expect(seen.filter((s) => s.url.startsWith('/web/analyze/'))).toEqual([]);
  });

  it('sends a copied address to the source field and asks for the text', async () => {
    serve(account());
    clipboard(async () => 'https://presse.example/cantines');
    render(<Analyser />);
    fireEvent.click(screen.getByRole('button', { name: 'Coller le texte copié' }));
    await waitFor(() => expect(screen.getByLabelText(/Adresse de l’article/)).toHaveValue('https://presse.example/cantines'));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/Collez maintenant le texte de l’article/));
  });

  it('adds the next passage copied after the text, without what it repeats', async () => {
    serve(account());
    const [first, second, third] = TEXT.split('\n\n');
    render(<Analyser />);
    paste(`${first}\n${second}`);
    clipboard(async () => `${second}\n\n${third}`);
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la suite' }));
    await waitFor(() => expect(screen.getByLabelText('Texte de l’article ou du message')).toHaveValue(`${first}\n${second}\n${third}`));
    expect(screen.getByRole('status')).toHaveTextContent(/Suite ajoutée/);

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la suite' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/déjà dans le texte/);
  });

  it('adds a markup-only next passage, and hands an empty read over to the field', async () => {
    serve(account());
    const [first, second, third] = TEXT.split('\n\n');
    render(<Analyser />);
    paste(first);
    const html = `<p>${second}</p>\n<p>${third}</p>`;
    Object.defineProperty(navigator, 'clipboard', {
      value: { read: async () => [{ types: ['text/html'], getType: async () => new Blob([html], { type: 'text/html' }) }] },
      configurable: true,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la suite' }));
    await waitFor(() => expect(screen.getByLabelText('Texte de l’article ou du message')).toHaveValue(`${first}\n${second}\n${third}`));

    clipboard(async () => '');
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la suite' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/appuyez longuement à la fin du texte, puis Coller/);
    expect(screen.getByLabelText('Texte de l’article ou du message')).toHaveFocus();
  });

  it('analyses a copy the page only put on the clipboard as markup', async () => {
    const seen = serve(account());
    const html = TEXT.split('\n\n').map((p) => `<p>${p}</p>`).join('');
    Object.defineProperty(navigator, 'clipboard', {
      value: { read: async () => [{ types: ['text/html'], getType: async () => new Blob([html], { type: 'text/html' }) }] },
      configurable: true,
    });
    render(<Analyser />);
    await analyseButton();
    fireEvent.click(screen.getByRole('button', { name: 'Coller le texte copié' }));
    expect(await screen.findByText('58')).toBeInTheDocument();
    expect(seen.filter((s) => s.url.startsWith('/web/analyze/'))).toHaveLength(3);
  });

  it('hands an empty read over to the field’s own paste, with what to do', async () => {
    serve(account());
    clipboard(async () => '');
    render(<Analyser />);
    fireEvent.click(screen.getByRole('button', { name: 'Coller le texte copié' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      /ne trouve pas de texte copié\. Si vous venez de copier l’article, appuyez longuement dans le champ, puis Coller/,
    );
    expect(screen.getByLabelText('Texte de l’article ou du message')).toHaveFocus();
  });

  it('pastes the text of a markup-only copy into the field, where the cursor is', async () => {
    serve(account());
    render(<Analyser />);
    const field = screen.getByLabelText('Texte de l’article ou du message') as HTMLTextAreaElement;
    paste('Début. ');
    field.setSelectionRange(7, 7);
    const data = { getData: (type: string) => (type === 'text/html' ? '<p>Un.</p><p>Deux.</p>' : '') };
    fireEvent.paste(field, { clipboardData: data });
    expect(field).toHaveValue('Début. Un.\n\nDeux.');

    // A copy with plain text is left to the browser's own paste.
    const plain = { getData: (type: string) => (type === 'text/plain' ? 'Simple' : '<p>Riche</p>') };
    expect(fireEvent.paste(field, { clipboardData: plain })).toBe(true);
    expect(field).toHaveValue('Début. Un.\n\nDeux.');
  });

  it('falls back to a long press when the clipboard is refused or missing', async () => {
    serve(account());
    clipboard(() => Promise.reject(new DOMException('denied', 'NotAllowedError')));
    render(<Analyser />);
    fireEvent.click(screen.getByRole('button', { name: 'Coller le texte copié' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/appuyez longuement dans le champ, puis Coller/);
    expect(screen.getByLabelText('Texte de l’article ou du message')).toHaveFocus();
    cleanup();

    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    render(<Analyser />);
    fireEvent.click(screen.getByRole('button', { name: 'Coller le texte copié' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/appuyez longuement/);
  });
});

describe('Analyser, from screenshots', () => {
  const image = (name: string) => new File(['png'], name, { type: 'image/png' });
  const counted = (seen: Seen[]) => seen.filter((s) => s.url === '/web/count').map((s) => s.body?.name);

  beforeEach(() => {
    vi.mocked(readCaptures).mockReset();
    vi.mocked(takeSharedCaptures).mockReset();
  });

  it('reads the imported screenshots into the form, for the reader to check before the analysis', async () => {
    const seen = serve(account());
    vi.mocked(readCaptures).mockImplementation(async (files, onProgress) => {
      onProgress(0, files.length);
      onProgress(1, files.length);
      return TEXT;
    });
    render(<Analyser />);
    await userEvent.upload(screen.getByTestId('captures'), [image('capture-1.png'), image('capture-2.png')]);

    expect(await screen.findByRole('status')).toHaveTextContent(/Texte lu sur 2 captures, sur cet appareil : aucune image n’a été envoyée/);
    expect(screen.getByLabelText('Texte de l’article ou du message')).toHaveValue(TEXT);
    expect(vi.mocked(readCaptures).mock.calls[0][0].map((file) => (file as File).name)).toEqual(['capture-1.png', 'capture-2.png']);
    // Nothing is analysed, and no image goes anywhere: only the counters, by kind and by bucket.
    expect(seen.some((s) => s.url.startsWith('/web/analyze/'))).toBe(false);
    expect(counted(seen)).toEqual(['import_screenshots', 'screenshots_2_4']);

    fireEvent.click(await analyseButton());
    expect(await screen.findByText('58')).toBeInTheDocument();
  });

  it('shows where the reading stands, and lets it be cancelled', async () => {
    serve(account());
    let progress: (done: number, total: number) => void = () => {};
    vi.mocked(readCaptures).mockImplementation(
      (_, onProgress, signal) =>
        new Promise((_, reject) => {
          progress = onProgress;
          signal?.addEventListener('abort', () => reject(new DOMException('Lecture annulée', 'AbortError')));
        }),
    );
    render(<Analyser />);
    await userEvent.upload(screen.getByTestId('captures'), [image('a.png'), image('b.png'), image('c.png')]);
    expect(await screen.findByText('Préparation de la lecture…')).toBeInTheDocument();
    act(() => progress(1, 3));
    expect(screen.getByText('Lecture de la capture 2 sur 3…')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(await screen.findByText('Lecture annulée.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importer des captures' })).toBeInTheDocument();
  });

  it('says so when nothing was read, or when the reader could not load', async () => {
    serve(account());
    vi.mocked(readCaptures).mockResolvedValueOnce('  ').mockRejectedValueOnce(new Error('network'));
    render(<Analyser />);
    await userEvent.upload(screen.getByTestId('captures'), [image('vide.png')]);
    expect(await screen.findByText(/Aucun texte n’a été lu sur ces images/)).toBeInTheDocument();
    await userEvent.upload(screen.getByTestId('captures'), [image('hors-ligne.png')]);
    expect(await screen.findByText(/le lecteur de texte se télécharge la première fois/)).toBeInTheDocument();
    expect(screen.getByLabelText('Texte de l’article ou du message')).toHaveValue('');
  });

  it('reads the screenshots shared to the installed app, and wipes the share from the address bar', async () => {
    const seen = serve(account());
    vi.mocked(takeSharedCaptures).mockResolvedValue([image('0'), image('1'), image('2'), image('3'), image('4')]);
    vi.mocked(readCaptures).mockResolvedValue(TEXT);
    at('/analyser?title=Un+article&captures=5');
    render(<Analyser />);
    // The title came with the screenshots, which bring the text: no request for a paste.
    expect(screen.queryByText(/Adresse reçue/)).not.toBeInTheDocument();

    expect(await screen.findByText(/Texte lu sur 5 captures/)).toBeInTheDocument();
    expect(screen.getByLabelText('Texte de l’article ou du message')).toHaveValue(TEXT);
    expect(screen.getByLabelText(/Titre/)).toHaveValue('Un article');
    expect(window.location.search).toBe('');
    expect(counted(seen)).toEqual(['share_screenshots', 'screenshots_5_9']);
  });

  it('asks for an import when the shared screenshots are gone', async () => {
    serve(account());
    vi.mocked(takeSharedCaptures).mockResolvedValue([]);
    at('/analyser?captures=2');
    render(<Analyser />);
    expect(await screen.findByText(/Les fichiers partagés n’ont pas été retrouvés/)).toBeInTheDocument();
    expect(readCaptures).not.toHaveBeenCalled();
  });
});

describe('Analyser, from a PDF', () => {
  const file = (name = 'rapport.pdf') => new File(['%PDF'], name, { type: 'application/pdf' });
  const counted = (seen: Seen[]) => seen.filter((s) => s.url === '/web/count').map((s) => s.body?.name);
  const paragraphs = TEXT.split('\n\n');
  const read = (overrides: Partial<Awaited<ReturnType<typeof readPdfFile>>> = {}) => ({
    title: 'Bilan démographique 2025',
    blocks: paragraphs.map((text, index) => ({ type: 'paragraph' as const, text, page: index + 1 })),
    pages: 3,
    scanned: false,
    scans: [],
    ...overrides,
  });

  beforeEach(() => {
    vi.mocked(readPdfFile).mockReset();
    vi.mocked(readCaptures).mockReset();
    vi.mocked(takeSharedCaptures).mockReset();
  });

  it('reads the imported PDF into the form, title included, for the reader to check before the analysis', async () => {
    const seen = serve(account());
    vi.mocked(readPdfFile).mockResolvedValue(read());
    render(<Analyser />);
    await userEvent.upload(screen.getByTestId('pdf'), file());

    expect(await screen.findByRole('status')).toHaveTextContent(/Texte lu dans le PDF \(3 pages\), sur cet appareil : le fichier n’a pas été envoyé/);
    expect(screen.getByLabelText('Texte de l’article ou du message')).toHaveValue(paragraphs.join('\n'));
    expect(screen.getByLabelText(/Titre/)).toHaveValue('Bilan démographique 2025');
    expect(seen.some((s) => s.url.startsWith('/web/analyze/'))).toBe(false);
    expect(counted(seen)).toEqual(['import_pdf']);

    fireEvent.click(await analyseButton());
    expect(await screen.findByText('58')).toBeInTheDocument();
  });

  it('keeps the first pages of a PDF too long for one analysis, and lets the reader pick others', async () => {
    serve(account());
    const page = (n: number) => `${`Page ${n} : une phrase du rapport. `.repeat(1_400)}`.trim();
    const blocks = [1, 2, 3, 4].map((n) => ({ type: 'paragraph' as const, text: page(n), page: n }));
    vi.mocked(readPdfFile).mockResolvedValue(read({ blocks, pages: 4 }));
    render(<Analyser />);
    await userEvent.upload(screen.getByTestId('pdf'), file());

    expect(await screen.findByText(/Ce PDF de 4 pages est trop long pour une seule analyse : le champ en garde les pages 1 à 2/)).toBeInTheDocument();
    const field = screen.getByLabelText('Texte de l’article ou du message') as HTMLTextAreaElement;
    expect(field.value).toBe(`${page(1)}\n${page(2)}`);

    fireEvent.change(screen.getByLabelText('De la page'), { target: { value: '3' } });
    expect(screen.getByLabelText('à la page')).toHaveValue(4);
    fireEvent.click(screen.getByRole('button', { name: 'Garder ces pages' }));
    expect(field.value).toBe(`${page(3)}\n${page(4)}`);
    expect(screen.getByRole('status')).toHaveTextContent(/Pages 3 à 4 du PDF/);
  });

  it('reads a scanned PDF’s pages with the OCR', async () => {
    const seen = serve(account());
    const scans = [new Blob(['png'], { type: 'image/png' }), new Blob(['png'], { type: 'image/png' })];
    vi.mocked(readPdfFile).mockResolvedValue(read({ blocks: [], pages: 2, scanned: true, scans, title: '' }));
    vi.mocked(readCaptures).mockResolvedValue(TEXT);
    render(<Analyser />);
    await userEvent.upload(screen.getByTestId('pdf'), file('scan.pdf'));

    expect(await screen.findByText(/Ce PDF est un document scanné : ses 2 pages ont été lues comme des captures/)).toBeInTheDocument();
    expect(vi.mocked(readCaptures).mock.calls[0][0]).toEqual(scans);
    expect(screen.getByLabelText('Texte de l’article ou du message')).toHaveValue(TEXT);
    expect(counted(seen)).toEqual(['import_pdf', 'pdf_scanned']);
  });

  it('says what to do with a locked PDF, a file that is not one, and a reader that could not load', async () => {
    serve(account());
    const named = (name: string) => Object.assign(new Error('pdf.js'), { name });
    vi.mocked(readPdfFile)
      .mockRejectedValueOnce(named('PasswordException'))
      .mockRejectedValueOnce(named('InvalidPDFException'))
      .mockRejectedValueOnce(new Error('network'));
    render(<Analyser />);
    await userEvent.upload(screen.getByTestId('pdf'), file());
    expect(await screen.findByText(/Ce PDF est protégé par un mot de passe/)).toBeInTheDocument();
    await userEvent.upload(screen.getByTestId('pdf'), file());
    expect(await screen.findByText(/Ce fichier n’est pas un PDF lisible/)).toBeInTheDocument();
    await userEvent.upload(screen.getByTestId('pdf'), file());
    expect(await screen.findByText(/le lecteur de PDF se télécharge la première fois/)).toBeInTheDocument();
    expect(screen.getByLabelText('Texte de l’article ou du message')).toHaveValue('');
  });

  it('reads a PDF shared to the installed app', async () => {
    const seen = serve(account());
    vi.mocked(takeSharedCaptures).mockResolvedValue([file()]);
    vi.mocked(readPdfFile).mockResolvedValue(read());
    at('/analyser?captures=1');
    render(<Analyser />);

    expect(await screen.findByText(/Texte lu dans le PDF/)).toBeInTheDocument();
    expect(readCaptures).not.toHaveBeenCalled();
    expect(window.location.search).toBe('');
    expect(counted(seen)).toEqual(['share_pdf']);
  });
});

describe('Analyser, from a recording', () => {
  const recording = (type = 'audio/ogg') => new File(['son'], 'PTT-20261031.opus', { type });
  const transcribed = (seconds: number) => () =>
    jsonResponse({
      ok: true,
      seconds,
      text: TEXT,
      segments: TEXT.split('\n\n').map((text, i) => ({ start: i * 20, text })),
    });
  const sent = (seen: Seen[]) => seen.filter((s) => s.url === '/web/transcribe');

  beforeEach(() => {
    vi.mocked(mediaDuration).mockReset();
    vi.mocked(soundPart).mockReset();
    vi.mocked(takeSharedMedia).mockReset();
    vi.mocked(soundPart).mockImplementation(async () => ({ wav: new Blob(['wav'], { type: 'audio/wav' }), seconds: 90 }));
  });

  it('transcribes a short recording into the form, timed, for the reader to check before the analysis', async () => {
    const seen = serve(account(), { transcribe: transcribed(90) });
    vi.mocked(mediaDuration).mockResolvedValue(90);
    render(<Analyser />);
    await analyseButton();
    await userEvent.upload(screen.getByTestId('media'), recording());

    expect(await screen.findByText(/Transcription de 1 min 30 s\. Relisez-la/)).toBeInTheDocument();
    const field = screen.getByLabelText('Texte de l’article ou du message') as HTMLTextAreaElement;
    expect(field.value.split('\n')[1]).toBe('0:20 Selon un expert, la fréquentation aurait chuté de 30 % dès le premier mois.');
    expect(screen.getByText(/Transcription reconnue/)).toBeInTheDocument();
    expect(vi.mocked(soundPart).mock.calls[0][1]).toBe(0);
    expect(sent(seen)).toHaveLength(1);
    expect(sent(seen)[0].method).toBe('POST');
    expect(seen.some((s) => s.url.startsWith('/web/analyze/'))).toBe(false);

    fireEvent.click(await analyseButton());
    expect(await screen.findByText('58')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Transcrire la suite/ })).not.toBeInTheDocument();
  });

  it('asks which fifteen minutes of a longer one first, and offers the next under the report', async () => {
    const seen = serve(account(), { transcribe: transcribed(900) });
    vi.mocked(mediaDuration).mockResolvedValue(2000);
    vi.mocked(soundPart).mockImplementation(async () => ({ wav: new Blob(['wav']), seconds: 2000 }));
    render(<Analyser />);
    await analyseButton();
    await userEvent.upload(screen.getByTestId('media'), recording('video/mp4'));

    const choice = await screen.findByLabelText(/Cet enregistrement dure 33 min 20 s/);
    expect([...(choice as HTMLSelectElement).options].map((o) => o.text)).toEqual([
      'Partie 1 sur 3 : 0:00 à 15:00',
      'Partie 2 sur 3 : 15:00 à 30:00',
      'Partie 3 sur 3 : 30:00 à 33:20',
    ]);
    expect(sent(seen)).toHaveLength(0);
    fireEvent.change(choice, { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Transcrire cette partie' }));

    expect(await screen.findByText(/partie 2 sur 3/)).toBeInTheDocument();
    // The times are the recording's, not the part's.
    expect((screen.getByLabelText('Texte de l’article ou du message') as HTMLTextAreaElement).value).toMatch(/^15:00 Depuis la rentrée/);

    fireEvent.click(await analyseButton());
    fireEvent.click(await screen.findByRole('button', { name: 'Transcrire la suite (30:00 à 33:20)' }));
    expect(await screen.findByText(/partie 3 sur 3/)).toBeInTheDocument();
    expect(vi.mocked(soundPart).mock.calls.map((call) => call[1])).toEqual([1, 2]);
    expect(sent(seen)).toHaveLength(2);
  });

  it('sends nothing without an account, or for a file that is not a recording', async () => {
    const seen = serve(null);
    render(<Analyser />);
    await analyseButton();
    await userEvent.upload(screen.getByTestId('media'), recording());
    expect(await screen.findByText(/La transcription d’un enregistrement demande un compte/)).toBeInTheDocument();
    expect(soundPart).not.toHaveBeenCalled();
    expect(sent(seen)).toHaveLength(0);
  });

  it('says what the server refused, and what this device could not read', async () => {
    serve(account(), {
      transcribe: () => jsonResponse({ ok: false, error: 'transcription_closed', message: 'Squiggle a transcrit aujourd’hui tout ce qu’il peut en un jour.' }, 429),
    });
    vi.mocked(mediaDuration).mockResolvedValue(30);
    render(<Analyser />);
    await analyseButton();
    await userEvent.upload(screen.getByTestId('media'), recording());
    expect(await screen.findByText(/tout ce qu’il peut en un jour/)).toBeInTheDocument();

    vi.mocked(soundPart).mockRejectedValueOnce(new DOMException('decode', 'EncodingError'));
    await userEvent.upload(screen.getByTestId('media'), recording());
    expect(await screen.findByText(/Le son de ce fichier n’a pas pu être lu sur cet appareil/)).toBeInTheDocument();
    expect(screen.getByLabelText('Texte de l’article ou du message')).toHaveValue('');
  });

  it('transcribes a recording shared to the installed app once the account is known', async () => {
    const seen = serve(account(), { transcribe: transcribed(90) });
    vi.mocked(takeSharedMedia).mockResolvedValue(recording());
    vi.mocked(mediaDuration).mockResolvedValue(90);
    at('/analyser?media=1');
    render(<Analyser />);
    expect(await screen.findByText(/Transcription de 1 min 30 s/)).toBeInTheDocument();
    expect(window.location.search).toBe('');
    expect(sent(seen)).toHaveLength(1);
  });
});
