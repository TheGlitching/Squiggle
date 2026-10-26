/**
 * The analysis stage endpoints (Phase 2c), driven exactly as the extension
 * will drive them: a signed check, an audit, one research call per factual
 * finding, one source-check per cited link, then finalize.
 *
 * Nothing here touches a network. The provider is `StubLlm`, and the only
 * page fetch (the cited-source read) is served by an injected `fetchImpl`,
 * so a test that somehow escaped both would fail rather than call Google.
 */
import { describe, expect, it } from 'vitest';

import { articleTextHash, generateSigningKeyPair } from '@squiggle/shared';

import {
  claim as claimToken,
  exportJwk,
  magicLogin,
  makeTestEnv,
  signedRequest,
  StubLlm,
  type TestEnv,
} from './helpers';
import { MemoryDb } from '../src/db/memory';
import { canonicalArticleUrl } from '../src/analyze/canonicalUrl';
import { MAX_ARTICLE_CHARS } from '@squiggle/shared';

const ARTICLE_URL = 'https://presse.example/politique/emploi-2026';

const BLOCKS = [
  { id: 'b1', type: 'paragraph' as const, text: 'Le chômage a baissé de 12 % en un an.', charStart: 0 },
  { id: 'b2', type: 'paragraph' as const, text: 'Tout le monde le sait.', charStart: 40 },
];

const CITED = [
  { href: 'https://insee.example/chomage', domain: 'insee.example', text: 'Insee', blockId: 'b1' },
];

/** A page server for the one cited source the run reads. */
function pageFetch(): typeof fetch {
  return (async () =>
    new Response('<html><body><p>La statistique confirme la baisse.</p></body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })) as unknown as typeof fetch;
}

/** Sign in, register a signing key, and return everything a signed call needs. */
async function signedIn(env: TestEnv, email: string) {
  const key = await generateSigningKeyPair();
  const { sessionCookie } = await magicLogin(env, email);
  const res = await claimToken(env, sessionCookie, await exportJwk(key));
  const body = (await res.json()) as { token: string };
  return { key, token: body.token };
}

async function call(
  env: TestEnv,
  who: { key: CryptoKeyPair; token: string },
  path: string,
  body?: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const req = await signedRequest(env, {
    key: who.key,
    token: who.token,
    path,
    method: body === undefined ? 'GET' : 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const res = await env.handler(req);
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

/** The cache preflight, asked the way the extension asks it. */
async function check(
  env: TestEnv,
  who: { key: CryptoKeyPair; token: string },
  url = ARTICLE_URL,
  blocks: ReadonlyArray<{ text: string }> = BLOCKS,
) {
  const text = await articleTextHash(blocks);
  return call(env, who, `/v1/analyze/check?url=${encodeURIComponent(url)}&text=${text}`);
}

/** The whole run, the way the extension walks it. */
async function runAnalysis(env: TestEnv, who: { key: CryptoKeyPair; token: string }, url = ARTICLE_URL) {
  const audit = await call(env, who, '/v1/analyze/audit', {
    url,
    title: 'Emploi : la baisse',
    blocks: BLOCKS,
    citedSources: CITED,
    partialAccess: false,
  });
  const runId = audit.json.runId as string;
  const researchable = audit.json.researchable as string[];

  const claims: Array<Record<string, unknown>> = [];
  for (const findingId of researchable) {
    const res = await call(env, who, '/v1/analyze/research', { runId, findingId });
    if (res.json.claim) claims.push(res.json.claim as Record<string, unknown>);
  }
  for (const c of claims) {
    await call(env, who, '/v1/analyze/source-check', {
      runId,
      claimId: c.id as string,
      sourceUrl: CITED[0].href,
    });
  }
  const finalized = await call(env, who, '/v1/analyze/finalize', { runId });
  return { audit, runId, researchable, claims, finalized };
}

describe('canonical article URL', () => {
  it('collapses the forms of one article that readers actually arrive with', () => {
    const canonical = canonicalArticleUrl(ARTICLE_URL);
    expect(canonicalArticleUrl(`${ARTICLE_URL}?utm_source=newsletter&utm_medium=email`)).toBe(canonical);
    expect(canonicalArticleUrl(`${ARTICLE_URL}#lire-la-suite`)).toBe(canonical);
    expect(canonicalArticleUrl(`http://www.presse.example/politique/emploi-2026/`)).toBe(canonical);
  });

  it('keeps a query parameter that may be the article itself', () => {
    expect(canonicalArticleUrl('https://presse.example/?p=1234')).not.toBe(
      canonicalArticleUrl('https://presse.example/?p=9999'),
    );
  });

  it('refuses anything that is not an http(s) page', () => {
    expect(canonicalArticleUrl('chrome://settings')).toBeNull();
    expect(canonicalArticleUrl('not a url')).toBeNull();
  });
});

describe('analysis stages', () => {
  it('runs check → audit → research → source-check → finalize and caches the report', async () => {
    const env = makeTestEnv({ fetchImpl: pageFetch() });
    const who = await signedIn(env, 'marie@example.org');

    const miss = await check(env, who);
    expect(miss.json.hit).toBe(false);

    const { finalized, researchable, claims } = await runAnalysis(env, who);
    expect(researchable).toEqual(['f1']);
    expect(claims).toHaveLength(1);

    expect(finalized.status).toBe(200);
    const report = finalized.json.report as Record<string, unknown>;
    expect(report.schemaVersion).toBe(1);
    expect(typeof report.score).toBe('number');
    expect(finalized.json.cached).toBe(true);

    // Research confirmed the article's figure, so the audit's objection is
    // withdrawn rather than published — the engine's own semantics, preserved.
    const research = report.research as { withdrawn: unknown[]; sourceChecks: unknown[] };
    expect(research.withdrawn).toHaveLength(1);
    expect(research.sourceChecks).toHaveLength(1);

    // One analysis, one ledger row, one credit.
    const users = await env.db.getUserByEmail('marie@example.org');
    expect(await env.db.countUsageLog(users!.id)).toBe(1);
  });

  it('serves a second reader from the cache with zero provider calls and zero credits', async () => {
    const env = makeTestEnv({ fetchImpl: pageFetch() });
    const first = await signedIn(env, 'marie@example.org');
    await runAnalysis(env, first);

    const before = { ...env.llm.calls };
    const second = await signedIn(env, 'paul@example.org');
    // A different reader, arriving with campaign parameters on the same article.
    const hit = await check(env, second, `${ARTICLE_URL}?utm_source=twitter`);

    expect(hit.json.hit).toBe(true);
    expect((hit.json.report as { score: number }).score).toBeTypeOf('number');
    expect(env.llm.calls).toEqual(before);

    const paul = await env.db.getUserByEmail('paul@example.org');
    expect(await env.db.countUsageLog(paul!.id)).toBe(0);
  });

  it('serves the cache only to a reader whose page yields the same text', async () => {
    const env = makeTestEnv({ fetchImpl: pageFetch() });
    const first = await signedIn(env, 'marie@example.org');
    await runAnalysis(env, first);

    const second = await signedIn(env, 'paul@example.org');
    const before = { ...env.llm.calls };

    // The same address, but a page that says something else.
    const other = [{ ...BLOCKS[0], text: 'Le chômage a baissé de 2 % en un an.' }, BLOCKS[1]];
    const miss = await check(env, second, ARTICLE_URL, other);
    expect(miss.json.hit).toBe(false);
    expect(miss.json.report).toBeUndefined();

    // A hit still costs nothing, and a miss does not call the provider either:
    // only the audit does.
    expect(env.llm.calls).toEqual(before);
  });

  it('files a report under the text the server was given, not a hash the client declares', async () => {
    const env = makeTestEnv({ fetchImpl: pageFetch() });
    const forger = await signedIn(env, 'forger@example.org');
    const forged = [{ ...BLOCKS[0], text: 'Un texte inventé pour cette adresse.' }];

    // The audit payload has no field for a hash: the schema strips anything
    // extra, so there is nothing for a client to declare.
    const audit = await call(env, forger, '/v1/analyze/audit', {
      url: ARTICLE_URL,
      title: 'T',
      blocks: forged,
      textHash: await articleTextHash(BLOCKS),
    });
    await call(env, forger, '/v1/analyze/finalize', { runId: audit.json.runId as string });

    const reader = await signedIn(env, 'reader@example.org');
    // The honest page misses; the forged one is the only text the report answers.
    expect((await check(env, reader, ARTICLE_URL, BLOCKS)).json.hit).toBe(false);
    expect((await check(env, reader, ARTICLE_URL, forged)).json.hit).toBe(true);
  });

  it('keeps the same hit across what a reload changes without the article changing', async () => {
    const env = makeTestEnv({ fetchImpl: pageFetch() });
    const first = await signedIn(env, 'marie@example.org');
    await runAnalysis(env, first);

    const second = await signedIn(env, 'paul@example.org');
    const reloaded = [
      // Other block ids and offsets, curly typography, a non-breaking space,
      // a zero-width space and different casing.
      { id: 'x9', type: 'heading' as const, text: 'LE  CHÔMAGE a baissé de 12\u00a0%\u200b en un an !', charStart: 3 },
      { id: 'x10', type: 'quote' as const, text: ' Tout le monde le sait. ', charStart: 90 },
    ];
    expect((await check(env, second, ARTICLE_URL, reloaded)).json.hit).toBe(true);
  });

  it('refuses a preflight without a well-formed text hash', async () => {
    const env = makeTestEnv({ fetchImpl: pageFetch() });
    const who = await signedIn(env, 'marie@example.org');
    const url = encodeURIComponent(ARTICLE_URL);

    for (const query of ['', '&text=', '&text=abc', `&text=${'G'.repeat(64)}`, `&text=${'a'.repeat(65)}`]) {
      const res = await call(env, who, `/v1/analyze/check?url=${url}${query}`);
      expect(res.status).toBe(400);
      expect(res.json.error).toBe('invalid_payload');
    }
  });

  it('degrades a single failing finding instead of the whole run', async () => {
    const llm = new StubLlm();
    llm.auditJson = JSON.stringify({
      summary: 'Deux affirmations non étayées.',
      scores: [{ domain: 'robustesse_factuelle', score: 20, strengths: [], weaknesses: [] }],
      findings: [
        {
          id: 'f1',
          blockId: 'b1',
          quote: 'Le chômage a baissé de 12 % en un an.',
          category: 'affirmation-non-etayee',
          severity: 2,
          label: 'A',
          explanation: 'x',
          confidence: 0.9,
        },
        {
          id: 'f2',
          blockId: 'b2',
          quote: 'Tout le monde le sait.',
          category: 'affirmation-non-etayee',
          severity: 2,
          label: 'B',
          explanation: 'y',
          confidence: 0.9,
        },
      ],
      claims: [],
    });
    const env = makeTestEnv({ fetchImpl: pageFetch(), llm });
    const who = await signedIn(env, 'marie@example.org');

    const audit = await call(env, who, '/v1/analyze/audit', {
      url: ARTICLE_URL,
      title: 'T',
      blocks: BLOCKS,
      citedSources: CITED,
    });
    const runId = audit.json.runId as string;

    llm.failNextGrounded = true;
    const failed = await call(env, who, '/v1/analyze/research', { runId, findingId: 'f1' });
    // The engine turns a failed judgement into an unverified claim rather than
    // an error, so the run continues.
    expect(failed.status).toBe(200);
    expect((failed.json.claim as { verification: string }).verification).toBe('non-verifiable');

    const ok = await call(env, who, '/v1/analyze/research', { runId, findingId: 'f2' });
    expect((ok.json.claim as { verification: string }).verification).toBe('verifiee');

    const finalized = await call(env, who, '/v1/analyze/finalize', { runId });
    expect(finalized.status).toBe(200);
    const report = finalized.json.report as { findings: Array<{ id: string }> };
    // f2 was confirmed and withdrawn; f1 could not be checked and still stands.
    expect(report.findings.map((f) => f.id)).toEqual(['f1']);
  });

  it('reads only links the article itself cited', async () => {
    let fetched = 0;
    const env = makeTestEnv({
      fetchImpl: (async () => {
        fetched += 1;
        return new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } });
      }) as unknown as typeof fetch,
    });
    const who = await signedIn(env, 'marie@example.org');

    const audit = await call(env, who, '/v1/analyze/audit', {
      url: ARTICLE_URL,
      title: 'T',
      blocks: BLOCKS,
      citedSources: CITED,
    });
    const runId = audit.json.runId as string;
    const research = await call(env, who, '/v1/analyze/research', { runId, findingId: 'f1' });
    const claimId = (research.json.claim as { id: string }).id;

    const forged = await call(env, who, '/v1/analyze/source-check', {
      runId,
      claimId,
      sourceUrl: 'http://169.254.169.254/latest/meta-data/',
    });
    expect(forged.status).toBe(404);
    expect(forged.json.error).toBe('not_found');
    expect(fetched).toBe(0);
  });

  it('consumes exactly one credit however many times finalize is replayed', async () => {
    const env = makeTestEnv({ fetchImpl: pageFetch() });
    const who = await signedIn(env, 'marie@example.org');
    const { runId } = await runAnalysis(env, who);

    const replay = await call(env, who, '/v1/analyze/finalize', { runId });
    expect(replay.status).toBe(409);
    expect(replay.json.error).toBe('run_already_finalized');

    const user = await env.db.getUserByEmail('marie@example.org');
    expect(await env.db.countUsageLog(user!.id)).toBe(1);
  });

  it('refuses another account’s run without saying it exists', async () => {
    const env = makeTestEnv({ fetchImpl: pageFetch() });
    const mine = await signedIn(env, 'marie@example.org');
    const audit = await call(env, mine, '/v1/analyze/audit', {
      url: ARTICLE_URL,
      title: 'T',
      blocks: BLOCKS,
      citedSources: CITED,
    });
    const runId = audit.json.runId as string;

    const other = await signedIn(env, 'paul@example.org');
    const stolen = await call(env, other, '/v1/analyze/finalize', { runId });
    expect(stolen.status).toBe(404);
    expect(stolen.json.error).toBe('run_not_found');
  });

  it('refuses a page of fifty articles with a sentence the reader can act on, before calling the provider', async () => {
    const env = makeTestEnv();
    const who = await signedIn(env, 'marie@example.org');
    const before = { ...env.llm.calls };

    // Fifty articles of about 4 000 characters each, read as one page, with
    // offsets as the extension computes them.
    const article = 'Le chômage a baissé de 12 % en un an, selon le ministère. '.repeat(70);
    const page = Array.from({ length: 50 }, (_, i) => ({
      id: `b${i}`,
      type: 'paragraph' as const,
      text: article,
      charStart: i * (article.length + 2),
    }));
    const res = await call(env, who, '/v1/analyze/audit', { url: ARTICLE_URL, title: 'T', blocks: page });

    expect(res.status).toBe(413);
    expect(res.json.error).toBe('article_too_long');
    expect(res.json.message).toMatch(/plusieurs articles/);
    expect(res.json.message).toContain((50 * article.length).toLocaleString('fr-FR'));
    expect(env.llm.calls).toEqual(before);

    // A refused page opens no run, so it costs the reader none of their starts.
    const user = await env.db.getUserByEmail('marie@example.org');
    expect((await env.db.recordRunStart(user!.id, env.clock.now())).total).toBe(1);
  });

  it('still analyses an article right at the cap', async () => {
    const env = makeTestEnv();
    const who = await signedIn(env, 'marie@example.org');
    const blocks = Array.from({ length: 10 }, (_, i) => ({
      id: `b${i}`,
      type: 'paragraph' as const,
      text: 'x'.repeat(MAX_ARTICLE_CHARS / 10),
      charStart: i * (MAX_ARTICLE_CHARS / 10 + 2),
    }));
    const res = await call(env, who, '/v1/analyze/audit', { url: ARTICLE_URL, title: 'T', blocks });
    expect(res.status).toBe(200);
  });

  it('never accepts an unsigned analysis request', async () => {
    const env = makeTestEnv();
    const res = await env.handler(
      new Request(`${env.webAppOrigin}/v1/analyze/audit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: ARTICLE_URL, title: 'T', blocks: BLOCKS }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('drops runs whose TTL has lapsed', async () => {
    const db = new MemoryDb();
    const env = makeTestEnv({ fetchImpl: pageFetch(), db });
    const who = await signedIn(env, 'marie@example.org');
    const audit = await call(env, who, '/v1/analyze/audit', {
      url: ARTICLE_URL,
      title: 'T',
      blocks: BLOCKS,
      citedSources: CITED,
    });
    const runId = audit.json.runId as string;

    env.clock.advance(2 * 60 * 60 * 1000);
    const late = await call(env, who, '/v1/analyze/finalize', { runId });
    expect(late.status).toBe(404);
  });
});
