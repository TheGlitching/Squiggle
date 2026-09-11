/**
 * The abuse and hardening controls (Phase 2e).
 *
 * Each test states a property an attacker must not be able to break, rather
 * than an implementation detail: a forged origin gets nothing, an oversized
 * payload costs nothing, a poisoned article cannot reach a second reader, and
 * no log line can carry a sentence of the article.
 *
 * Every invisible character is written as an escape here, never as a literal:
 * the point of the test is a byte a reviewer cannot see in the diff.
 */
import { describe, expect, it, vi } from 'vitest';

import { generateSigningKeyPair } from '@squiggle/shared';

import {
  CHROME_ORIGIN,
  claim as claimToken,
  exportJwk,
  magicLogin,
  makeTestEnv,
  signedRequest,
  StubLlm,
  type TestEnv,
} from './helpers';
import { MAX_FIELD_CHARS, sanitizeReport, sanitizeString } from '../src/lib/sanitize';
import { originRequired } from '../src/lib/cors';
import { REPORT_MAX_BYTES } from '../src/usage/limits';

const ARTICLE_URL = 'https://presse.example/politique/emploi-2026';
const BLOCKS = [
  { id: 'b1', type: 'paragraph' as const, text: 'Le chomage a baisse de 12 % en un an.', charStart: 0 },
  { id: 'b2', type: 'paragraph' as const, text: 'Tout le monde le sait.', charStart: 40 },
];

/** ESC, a right-to-left override, a zero-width space, U+2028, a BOM. */
const ESC = '\u001B';
const RLO = '\u202E';
const ZWSP = '\u200B';
const LS = '\u2028';
const BOM = '\uFEFF';

/** Every invisible character a sanitized report must be free of. */
const INVISIBLE_RE = new RegExp(
  [
    '[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]',
    '[\u0080-\u009F]',
    '[\u200B-\u200F]',
    '[\u202A-\u202E]',
    '[\u2060-\u2064]',
    '[\u2066-\u2069]',
    '\uFEFF',
  ].join('|'),
  'u',
);

async function signedIn(env: TestEnv, email: string) {
  const key = await generateSigningKeyPair();
  const { sessionCookie } = await magicLogin(env, email);
  const res = await claimToken(env, sessionCookie, await exportJwk(key));
  const { token } = (await res.json()) as { token: string };
  return { key, token };
}

async function call(env: TestEnv, who: { key: CryptoKeyPair; token: string }, path: string, body?: unknown) {
  const req = await signedRequest(env, {
    key: who.key,
    token: who.token,
    path,
    method: body === undefined ? 'GET' : 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const res = await env.handler(req);
  return { status: res.status, json: (await res.json()) as Record<string, unknown>, headers: res.headers };
}

describe('origin policy', () => {
  it('refuses a request with NO origin on the cookie-authenticated endpoints', async () => {
    const env = makeTestEnv();
    for (const [method, path] of [
      ['POST', '/auth/magic-link'],
      ['POST', '/auth/magic-link/verify'],
      ['POST', '/auth/logout'],
      ['GET', '/auth/claim'],
      ['POST', '/auth/claim'],
    ] as const) {
      const res = await env.handler(
        new Request(`${env.webAppOrigin}${path}`, {
          method,
          headers: { 'content-type': 'application/json' },
          body: method === 'POST' ? '{}' : undefined,
        }),
      );
      expect({ path, status: res.status }).toEqual({ path, status: 403 });
      expect(((await res.json()) as { error: string }).error).toBe('origin_not_allowed');
    }
  });

  it('refuses a forged origin everywhere, and never echoes it back', async () => {
    const env = makeTestEnv();
    const res = await env.handler(
      new Request(`${env.webAppOrigin}/health`, { headers: { origin: 'https://attaquant.example' } }),
    );
    expect(res.status).toBe(403);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('lets the OAuth redirects through without an origin - they are navigations', () => {
    // A top-level navigation carries no Origin by design; requiring one there
    // would break sign-in. Their anti-forgery control is the OAuth `state`.
    expect(originRequired('GET', '/auth/google')).toBe(false);
    expect(originRequired('GET', '/auth/google/callback')).toBe(false);
    expect(originRequired('GET', '/health')).toBe(false);
  });

  it('lets a signed /v1 call through without an origin, and refuses a wrong one', async () => {
    const env = makeTestEnv();
    const who = await signedIn(env, 'marie@example.org');

    const noOrigin = await env.handler(
      await signedRequest(env, { key: who.key, token: who.token, path: '/v1/account' }),
    );
    expect(noOrigin.status).toBe(200);

    const fromExtension = await env.handler(
      await signedRequest(env, { key: who.key, token: who.token, path: '/v1/account', origin: CHROME_ORIGIN }),
    );
    expect(fromExtension.status).toBe(200);

    const forged = await env.handler(
      await signedRequest(env, {
        key: who.key,
        token: who.token,
        path: '/v1/account',
        origin: 'https://attaquant.example',
      }),
    );
    expect(forged.status).toBe(403);
  });
});

describe('report sanitization', () => {
  it('removes the invisible characters a schema cannot see', () => {
    // An ESC becomes an ANSI sequence in any terminal that later reads a log.
    expect(sanitizeString(`avant${ESC}[31mapres`)).toBe('avant[31mapres');
    // A right-to-left override reorders displayed text against its bytes.
    expect(sanitizeString(`gauche${RLO}droite`)).toBe('gauchedroite');
    // Zero-width space and byte-order mark, used to smuggle text past a reader.
    expect(sanitizeString(`a${ZWSP}b${BOM}c`)).toBe('abc');
    // U+2028 is a line terminator to a JS parser but not to JSON.
    expect(sanitizeString(`ligne${LS}suite`)).toBe('ligne\nsuite');
    // Legitimate layout survives: a report is prose.
    expect(sanitizeString('un\ndeux\tTROIS é€')).toBe('un\ndeux\tTROIS é€');
  });

  it('caps a string, an array and the depth of a crafted payload', () => {
    expect(sanitizeString('x'.repeat(MAX_FIELD_CHARS + 500)).length).toBe(MAX_FIELD_CHARS + 1);

    const deep = (n: number): unknown => (n === 0 ? 'fond' : { next: deep(n - 1) });
    expect(() => JSON.stringify(sanitizeReport(deep(200)))).not.toThrow();

    const wide = sanitizeReport({ findings: Array.from({ length: 5_000 }, () => 'x') }) as {
      findings: string[];
    };
    expect(wide.findings.length).toBeLessThanOrEqual(200);
  });

  it('a poisoned article cannot plant control characters in the shared cache', async () => {
    const llm = new StubLlm();
    llm.auditJson = JSON.stringify({
      summary: `Resume${ESC}[31m avec une sequence ANSI et ${RLO}de la bidi.`,
      scores: [{ domain: 'robustesse_factuelle', score: 20, strengths: [], weaknesses: [] }],
      findings: [
        {
          id: 'f1',
          blockId: 'b1',
          quote: `Un${ZWSP} texte${BOM} piege.`,
          category: 'cadrage',
          severity: 1,
          label: 'L',
          explanation: 'E',
          confidence: 0.9,
        },
      ],
      claims: [],
    });
    const env = makeTestEnv({ llm });
    const first = await signedIn(env, 'marie@example.org');

    const audit = await call(env, first, '/v1/analyze/audit', { url: ARTICLE_URL, title: 'T', blocks: BLOCKS });
    await call(env, first, '/v1/analyze/finalize', { runId: audit.json.runId as string });

    const second = await signedIn(env, 'paul@example.org');
    const hit = await call(env, second, `/v1/analyze/check?url=${encodeURIComponent(ARTICLE_URL)}`);
    expect(hit.json.hit).toBe(true);

    // What the second reader is served carries none of it, and still reads.
    const served = JSON.stringify(hit.json.report);
    expect(INVISIBLE_RE.test(served)).toBe(false);
    expect(served).toContain('avec une sequence ANSI');
  });

  it('refuses to cache a report that is over the size cap', async () => {
    const llm = new StubLlm();
    // Many findings, each near the field cap: past the cap once serialized.
    const findings = Array.from({ length: 120 }, (_, i) => ({
      id: `f${i}`,
      blockId: 'b1',
      quote: 'q'.repeat(2_000),
      category: 'cadrage',
      severity: 1,
      label: 'L'.repeat(2_000),
      explanation: 'E'.repeat(2_000),
      confidence: 0.9,
    }));
    llm.auditJson = JSON.stringify({
      summary: 'S',
      scores: [{ domain: 'robustesse_factuelle', score: 20, strengths: [], weaknesses: [] }],
      findings,
      claims: [],
    });
    const env = makeTestEnv({ llm });
    const who = await signedIn(env, 'marie@example.org');

    const audit = await call(env, who, '/v1/analyze/audit', { url: ARTICLE_URL, title: 'T', blocks: BLOCKS });
    const finalized = await call(env, who, '/v1/analyze/finalize', { runId: audit.json.runId as string });

    // The reader still gets their own report; the cache simply refuses it.
    expect(finalized.status).toBe(200);
    expect(finalized.json.cached).toBe(false);
    expect(new TextEncoder().encode(JSON.stringify(finalized.json.report)).length).toBeGreaterThan(
      REPORT_MAX_BYTES,
    );
  });
});

describe('a hostile article', () => {
  it('cannot make the server fetch an internal address through its own citations', async () => {
    // The article is the attacker here: it publishes links, and the server
    // fetches links the article published. Every one of these is a cited
    // source the audit legitimately recorded — the guard has to be in the
    // fetcher, not in a list of URLs we trust.
    const reached: string[] = [];
    const env = makeTestEnv({
      fetchImpl: (async (input: RequestInfo | URL) => {
        reached.push(String(input));
        return new Response('<html><body>interne</body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        });
      }) as unknown as typeof fetch,
    });
    const who = await signedIn(env, 'marie@example.org');

    const hostile = [
      'http://169.254.169.254/latest/meta-data/',
      'http://127.0.0.1:8080/admin',
      'http://[::1]/',
      'http://10.0.0.5/internal',
      'http://192.168.1.1/',
      'http://localhost/',
      // Non-canonical encodings of 127.0.0.1.
      'http://2130706433/',
      'http://0x7f000001/',
    ].map((href, i) => ({ href, domain: 'interne', text: `lien ${i}`, blockId: 'b1' }));

    const audit = await call(env, who, '/v1/analyze/audit', {
      url: ARTICLE_URL,
      title: 'T',
      blocks: BLOCKS,
      citedSources: hostile,
    });
    const runId = audit.json.runId as string;
    const research = await call(env, who, '/v1/analyze/research', { runId, findingId: 'f1' });
    const claimId = (research.json.claim as { id: string }).id;

    for (const source of hostile) {
      const res = await call(env, who, '/v1/analyze/source-check', {
        runId,
        claimId,
        sourceUrl: source.href,
      });
      // The page is reported unreadable, which is honest: nobody read it.
      expect(res.status).toBe(200);
      expect((res.json.check as { relation: string }).relation).toBe('inaccessible');
    }

    // And not one of them was ever requested.
    expect(reached).toEqual([]);
  });
});

describe('abuse ceilings', () => {
  it('allows one analysis in flight per account', async () => {
    const env = makeTestEnv();
    const who = await signedIn(env, 'marie@example.org');

    const first = await call(env, who, '/v1/analyze/audit', { url: ARTICLE_URL, title: 'T', blocks: BLOCKS });
    expect(first.status).toBe(200);

    const second = await call(env, who, '/v1/analyze/audit', { url: ARTICLE_URL, title: 'T', blocks: BLOCKS });
    expect(second.status).toBe(429);
    expect(second.json.error).toBe('rate_limited');

    // An abandoned run stops blocking once its activity window lapses, so a
    // reader who closed the tab is not locked out for the run's whole TTL.
    env.clock.advance(6 * 60 * 1000);
    const later = await call(env, who, '/v1/analyze/audit', { url: ARTICLE_URL, title: 'T', blocks: BLOCKS });
    expect(later.status).toBe(200);
  });

});

describe('logs and correlation', () => {
  it('carries a fresh opaque request id on every response', async () => {
    const env = makeTestEnv();
    const a = await env.handler(new Request(`${env.webAppOrigin}/health`));
    const b = await env.handler(new Request(`${env.webAppOrigin}/health`));
    const idA = a.headers.get('x-squiggle-request-id');
    const idB = b.headers.get('x-squiggle-request-id');
    expect(idA).toMatch(/^[0-9a-f-]{36}$/);
    expect(idA).not.toBe(idB);
  });

  it('never writes article text, a rejected payload, or a URL to a log line', async () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
      lines.push(String(line));
    });
    try {
      const env = makeTestEnv();
      const who = await signedIn(env, 'marie@example.org');
      const secret = 'PHRASE-QUI-NE-DOIT-PAS-APPARAITRE';

      // A payload that fails validation, carrying the sentence in a field.
      await call(env, who, '/v1/analyze/audit', {
        url: `${ARTICLE_URL}?q=${secret}`,
        title: secret,
        blocks: [{ id: 'b1', type: 'nope', text: secret, charStart: 0 }],
      });
      // And a valid call, whose query string is the article being read.
      await call(env, who, `/v1/analyze/check?url=${encodeURIComponent(`${ARTICLE_URL}?q=${secret}`)}`);

      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line).not.toContain(secret);
        // Not even the article's address: only its hash is ever logged.
        expect(line).not.toContain('presse.example');
      }
      // The rejected fields are named, so a bug is still debuggable.
      const events = lines.map((l) => JSON.parse(l) as { event: string; fields?: string[] });
      expect(events.some((e) => e.event === 'payload_rejected' && e.fields?.includes('blocks.0.type'))).toBe(
        true,
      );
    } finally {
      spy.mockRestore();
    }
  });
});
