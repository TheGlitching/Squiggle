/**
 * A fetch stub for the web tests. Every API call the app makes goes through
 * `window.fetch`, so intercepting that one global is enough to drive the pages
 * without a server.
 */
import { vi } from 'vitest';

import type { AnalysisReport, Finding, TextBlock } from '../../shared/src/engine/types';
import type { Account } from '../src/api';

export interface Call {
  url: string;
  method: string;
  body: unknown;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function installFetch(
  route: (call: Call) => Response | undefined,
): { calls: Call[] } {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      let body: unknown;
      if (typeof init?.body === 'string') {
        try {
          body = JSON.parse(init.body);
        } catch {
          body = init.body;
        }
      }
      const call: Call = { url, method, body };
      calls.push(call);
      return route(call) ?? jsonResponse({ ok: false, error: 'not_found' }, 404);
    }),
  );
  return { calls };
}

export function account(overrides: Partial<Account> = {}): Account {
  return {
    id: 'u1',
    email: 'marie@example.com',
    plan: 'trial',
    planExpiresAt: null,
    usage: { used: 0, limit: 3, remaining: 3, resetsAt: null },
    ...overrides,
  };
}

/** An in-memory `Storage`: the test environment's own `localStorage` is Node's, and not usable. */
export function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

/** Phone and tablet user agents: Android Chrome (phone and tablet), Android Firefox, iPhone Safari, iPad Chrome. */
export const MOBILE = [
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Android 14; Mobile; rv:128.0) Gecko/128.0 Firefox/128.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1',
];

/**
 * The landing's example article as a pasted text and its report: seven
 * sentences, six findings (one doubtful claim, one strength), for the
 * classroom-mode tests.
 */
export function lesson(): { title: string; blocks: TextBlock[]; report: AnalysisReport } {
  const title = 'Lecture : une génération perdue ?';
  const paragraphs = [
    'La lecture recule chez les adolescents, et le constat inquiète. Selon une étude, 78 % des Français seraient concernés. Puisque les jeunes sont sur les réseaux, ils ne lisent plus.',
    'La situation est un désastre absolu, une hémorragie incontrôlée. Neuf adolescents sur dix n’ouvrent plus un livre en dehors des cours. Selon un expert, le mouvement serait irréversible.',
    'Dans les médiathèques, pourtant, bibliothécaires et enseignants décrivent des lecteurs qui ont changé de supports plus que de goûts.',
  ];
  const blocks: TextBlock[] = [];
  let offset = 0;
  const texts: Array<[TextBlock['type'], string]> = [['heading', title], ...paragraphs.map((p): [TextBlock['type'], string] => ['paragraph', p])];
  for (const [type, text] of texts) {
    blocks.push({ id: `b${blocks.length + 1}`, type, text, charStart: offset });
    offset += text.length + 2;
  }
  const finding = (
    id: string,
    blockId: string,
    quote: string,
    category: Finding['category'],
    severity: Finding['severity'],
    label: string,
    verification?: Finding['verification'],
  ): Finding => ({ id, blockId, quote, category, severity, label, explanation: `Explication de « ${label} ».`, confidence: 0.8, ...(verification ? { verification } : {}) });
  // Listed out of reading order on purpose: the session sorts them.
  const findings = [
    finding('f6', 'b4', 'bibliothécaires et enseignants décrivent des lecteurs', 'point-fort', 1, 'Témoins de terrain'),
    finding('f1', 'b2', 'une étude', 'source-absente', 2, 'Étude non nommée', 'non-sourcee'),
    finding('f2', 'b2', 'ils ne lisent plus', 'sophisme', 2, 'Faux dilemme'),
    finding('f3', 'b3', 'un désastre absolu', 'cadrage', 2, 'Exagération'),
    finding('f4', 'b3', 'Neuf adolescents sur dix n’ouvrent plus un livre', 'affirmation-non-etayee', 2, 'Chiffre mis en doute', 'douteuse'),
    finding('f5', 'b3', 'Selon un expert', 'cadrage', 1, 'Autorité non nommée'),
  ];
  const report: AnalysisReport = {
    schemaVersion: 1,
    score: 61,
    scoreBand: 'fragile',
    summary: 'Un vrai sujet, un chiffre central sans source.',
    categories: [],
    findings,
    claims: [],
    research: { performed: true, queries: [], withdrawn: [] },
    meta: { model: 'test', promptVersion: '2.3.0', analyzedAt: '2026-10-26T09:00:00.000Z', durationMs: 1000 },
  };
  return { title, blocks, report };
}
