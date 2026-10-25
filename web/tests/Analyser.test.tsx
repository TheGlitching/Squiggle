/**
 * The analysis page, driven through `fetch` the way the browser drives it.
 * Pinned: a signed-out reader is sent to sign in without losing the paste; a
 * share lands in the form and leaves the address bar; a run walks the
 * session stages on the reader's cookie and never asks for the source page;
 * the report highlights the passages it discusses; a refusal says what to do.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AnalysisReport } from '../../shared/src/engine/types';
import type { Account } from '../src/api';
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
function serve(who: Account | null, stages: { audit?: () => Response } = {}) {
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
      if (path === '/web/account') return who ? jsonResponse({ ok: true, ...who }) : jsonResponse({ ok: false, error: 'invalid_session' }, 401);
      if (path === '/web/analyze/check') return jsonResponse({ ok: true, hit: false });
      if (path === '/web/analyze/audit') return stages.audit?.() ?? jsonResponse({ ok: true, runId: 'r1', report: REPORT, researchable: [] });
      if (path === '/web/analyze/finalize') return jsonResponse({ ok: true, report: REPORT, cached: true });
      return jsonResponse({ ok: false, error: 'not_found' }, 404);
    }),
  );
  return seen;
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
  it('opens the sign-in in place, under the text, and keeps the paste for a round trip', async () => {
    serve(null);
    const first = render(<Analyser />);
    paste(TEXT);
    fireEvent.click(await screen.findByRole('button', { name: 'Analyser le texte' }));
    const panel = within(await screen.findByRole('region', { name: 'Connectez-vous pour lancer l’analyse' }));
    expect(panel.getByText(/Votre texte reste ici/)).toBeInTheDocument();
    expect(panel.getByLabelText('Adresse e-mail')).toBeInTheDocument();
    const google = panel.getByRole('link', { name: 'Continuer avec Google' }).getAttribute('href')!;
    expect(new URL(google, 'https://squiggle.fr').searchParams.get('next')).toBe('/analyser');
    expect(screen.getByLabelText('Texte de l’article')).toHaveValue(TEXT);
    first.unmount();

    // Back from Google, in the same browser.
    render(<Analyser />);
    expect(screen.getByLabelText('Texte de l’article')).toHaveValue(TEXT);
  });

  it('starts the analysis on its own once the code is accepted', async () => {
    let signedIn = false;
    const seen: string[] = [];
    vi.stubGlobal('localStorage', memoryStorage());
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const path = (typeof input === 'string' ? input : input.toString()).split('?')[0];
        seen.push(path);
        if (path === '/web/account') {
          return signedIn ? jsonResponse({ ok: true, ...account() }) : jsonResponse({ ok: false, error: 'invalid_session' }, 401);
        }
        if (path === '/auth/magic-link') return jsonResponse({ ok: true, sent: true });
        if (path === '/auth/magic-link/verify') {
          signedIn = true;
          return jsonResponse({ ok: true, userId: 'u1', email: 'marie@example.com', next: '/analyser' });
        }
        if (path === '/web/analyze/check') return jsonResponse({ ok: true, hit: false });
        if (path === '/web/analyze/audit') return jsonResponse({ ok: true, runId: 'r1', report: REPORT, researchable: [] });
        if (path === '/web/analyze/finalize') return jsonResponse({ ok: true, report: REPORT, cached: true });
        return jsonResponse({ ok: false, error: 'not_found' }, 404);
      }),
    );
    render(<Analyser />);
    paste(TEXT);
    fireEvent.click(await screen.findByRole('button', { name: 'Analyser le texte' }));
    fireEvent.change(await screen.findByLabelText('Adresse e-mail'), { target: { value: 'marie@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Recevoir mon code' }));
    fireEvent.change(await screen.findByLabelText('Code de connexion'), { target: { value: 'abcd2345' } });
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));

    expect(await screen.findByText('58')).toBeInTheDocument();
    expect(seen).toContain('/web/analyze/audit');
    expect(window.location.pathname).toBe('/analyser');
  });
});

describe('Analyser, the example', () => {
  it('opens the full example report without an account or a request', async () => {
    const seen = serve(null);
    at('/analyser?exemple');
    render(<Analyser />);
    expect(screen.getByText(/Rapport d’exemple\./)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Lecture : une génération perdue ?' })).toBeInTheDocument();
    expect(screen.getByText('61')).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Chiffre mis en doute' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Témoins de terrain' })).toBeInTheDocument();
    expect(screen.getByText(/préparé à l’avance sur un article fictif/)).toBeInTheDocument();
    expect(seen.filter((s) => s.url.startsWith('/web/analyze/'))).toEqual([]);

    // From there, straight to the reader's own article.
    fireEvent.click(screen.getByRole('button', { name: 'Analyser votre article' }));
    expect(screen.getByLabelText('Texte de l’article')).toBeInTheDocument();
    expect(window.location.search).toBe('');
  });

  it('is one tap away from an empty form', () => {
    serve(null);
    render(<Analyser />);
    fireEvent.click(screen.getByRole('button', { name: /Voir un rapport d’exemple/ }));
    expect(screen.getByText('61')).toBeInTheDocument();
  });

  it('never names the model in the report', async () => {
    serve(account());
    render(<Analyser />);
    paste(TEXT);
    fireEvent.click(await screen.findByRole('button', { name: 'Analyser le texte' }));
    await screen.findByText('58');
    expect(screen.queryByText(/openrouter\/test-model/)).toBeNull();
    expect(screen.getByText(/par un modèle de langage/)).toBeInTheDocument();
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
    fireEvent.click(await screen.findByRole('button', { name: 'Analyser le texte' }));

    expect(await screen.findByText('58')).toBeInTheDocument();
    const stages = seen.filter((s) => s.url.startsWith('/web/analyze/'));
    expect(stages.map((s) => s.url.split('?')[0])).toEqual(['/web/analyze/check', '/web/analyze/audit', '/web/analyze/finalize']);
    for (const stage of stages) expect(stage.credentials).toBe('include');
    expect(stages[1].body).toMatchObject({ url: 'https://presse.example/cantines', citedSources: [] });
    expect(seen.some((s) => s.url.includes('presse.example') && !s.url.startsWith('/web/'))).toBe(false);

    // The passage is highlighted in the pasted text and leads to its finding.
    const passage = screen.getByRole('link', { name: /la fréquentation aurait chuté de 30 %/ });
    expect(passage).toHaveAttribute('href', '#constat-f1');
    const card = screen.getByRole('article', { name: 'Chiffre sans source' });
    expect(within(card).getByText('Douteuse')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Statistiques publiques' })).toHaveAttribute('href', 'https://stats.example/cantines');
    // A quote the text does not contain is still reported, and says so.
    expect(
      within(screen.getByRole('article', { name: 'Formule appuyée' })).getByText(/n’a pas été retrouvé tel quel/),
    ).toBeInTheDocument();
  });

  it('sends a text without an address as one, so it is filed by its words alone', async () => {
    const seen = serve(account());
    render(<Analyser />);
    paste(TEXT);
    fireEvent.click(await screen.findByRole('button', { name: 'Analyser le texte' }));
    await screen.findByText('58');
    expect(seen.find((s) => s.url.startsWith('/web/analyze/check'))?.url).not.toContain('url=');
    expect(seen.find((s) => s.url === '/web/analyze/audit')?.body).not.toHaveProperty('url');
  });

  it('stops a paste too short to be an article, before any request', async () => {
    const seen = serve(account());
    render(<Analyser />);
    paste('https://presse.example/cantines');
    fireEvent.click(await screen.findByRole('button', { name: 'Analyser le texte' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/au moins 200 caractères/);
    expect(seen.filter((s) => s.url.startsWith('/web/analyze/'))).toEqual([]);
  });

  it('keeps the text and says what failed when the model does not answer', async () => {
    serve(account(), {
      audit: () => jsonResponse({ ok: false, error: 'provider_unavailable', message: 'x' }, 502),
    });
    render(<Analyser />);
    paste(TEXT);
    fireEvent.click(await screen.findByRole('button', { name: 'Analyser le texte' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Le modèle n’a pas répondu/);
    expect(screen.getByLabelText('Texte de l’article')).toHaveValue(TEXT);
  });

  it('offers the subscription, not the button, once the trial is used', async () => {
    serve(account({ usage: { used: 3, limit: 3, remaining: 0, resetsAt: null } }));
    render(<Analyser />);
    paste(TEXT);
    expect(await screen.findByText('Essai épuisé')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'S’abonner' })).toHaveAttribute('href', '/compte');
    expect(screen.queryByRole('button', { name: 'Analyser le texte' })).toBeNull();
  });
});
