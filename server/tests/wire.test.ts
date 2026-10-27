/**
 * The two halves of the hosted protocol, driven into each other.
 *
 * `HostedAnalysisClient` is what the extension will run; `createWorker` is the
 * server. Both live in this repository, so this test wires the client's
 * `fetch` straight into the server's request handler and walks a complete
 * analysis. Nothing is mocked between them: the signatures are real ECDSA, the
 * nonces are real, the bodies are the bytes that were signed.
 *
 * It exists because every other test in this suite constructs requests the way
 * the server expects them. This one constructs them the way the extension
 * actually will, which is the only way to catch a route, a payload shape or an
 * order of calls that the two sides disagree about.
 */
import { describe, expect, it } from 'vitest';

import {
  generateSigningKeyPair,
  HostedAnalysisClient,
  HostedApiError,
  type PipelineProgressEvent,
} from '@squiggle/shared';

import { claim as claimToken, exportJwk, magicLogin, makeTestEnv, StubLlm, type TestEnv } from './helpers';

const ARTICLE_URL = 'https://presse.example/politique/emploi-2026';

const BLOCKS = [
  { id: 'b1', type: 'paragraph' as const, text: 'Le chomage a baisse de 12 % en un an.', charStart: 0 },
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

/** Sign in and hand back a client configured exactly as the extension will. */
async function hostedClient(env: TestEnv, email: string): Promise<HostedAnalysisClient> {
  const keyPair = await generateSigningKeyPair();
  const { sessionCookie } = await magicLogin(env, email);
  const res = await claimToken(env, sessionCookie, await exportJwk(keyPair));
  const { token } = (await res.json()) as { token: string };

  return new HostedAnalysisClient({
    baseUrl: env.webAppOrigin,
    token,
    privateKey: keyPair.privateKey,
    // The client's own fetch, pointed at the server's handler. No network.
    fetchImpl: ((url: RequestInfo | URL, init?: RequestInit) =>
      env.handler(new Request(url as string, init))) as typeof fetch,
  });
}

describe('extension client against the real server', () => {
  it('walks a whole analysis and gets a report back', async () => {
    // The client stamps its own timestamps from the wall clock, so the server's
    // clock has to be the same one for the ±5 minute window to hold.
    const env = makeTestEnv({ fetchImpl: pageFetch(), now: Date.now() });
    const client = await hostedClient(env, 'marie@example.org');

    const events: PipelineProgressEvent[] = [];
    const report = await client.analyze(
      { url: ARTICLE_URL, title: 'Emploi : la baisse', blocks: BLOCKS, citedSources: CITED },
      { onProgress: (e) => events.push(e) },
    );

    expect(report.schemaVersion).toBe(1);
    expect(typeof report.score).toBe('number');
    // Research confirmed the article's figure, so the audit's objection was
    // withdrawn rather than published - the engine's semantics, over the wire.
    expect(report.research.withdrawn).toHaveLength(1);
    expect(report.research.sourceChecks).toHaveLength(1);

    // The progress stream is the one the panel already renders.
    expect(events.at(-1)).toMatchObject({ status: 'completed', progress: 100 });
    expect(events.map((e) => e.progress)).toEqual([...events.map((e) => e.progress)].sort((a, b) => a - b));

    const user = await env.db.getUserByEmail('marie@example.org');
    expect(await env.db.countUsageLog(user!.id)).toBe(1);
  });

  it('stops a page of fifty articles before sending anything, with the sentence the server would give', async () => {
    const env = makeTestEnv({ fetchImpl: pageFetch(), now: Date.now() });
    const client = await hostedClient(env, 'marie@example.org');
    const sent: string[] = [];
    const inner = (client as unknown as { config: { fetchImpl: typeof fetch } }).config.fetchImpl;
    (client as unknown as { config: { fetchImpl: typeof fetch } }).config.fetchImpl = ((url: RequestInfo | URL, init?: RequestInit) => {
      sent.push(String(url));
      return inner(url, init);
    }) as typeof fetch;

    const article = 'Le chômage a baissé de 12 % en un an, selon le ministère. '.repeat(70);
    const page = Array.from({ length: 50 }, (_, i) => ({
      id: `b${i}`,
      type: 'paragraph' as const,
      text: article,
      charStart: i * (article.length + 2),
    }));

    const err = await client.analyze({ url: ARTICLE_URL, title: 'Accueil', blocks: page }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HostedApiError);
    expect((err as HostedApiError).code).toBe('article_too_long');
    expect(sent).toEqual([]);

    // A client that skipped its own check meets the same refusal, word for word.
    const server = await hostedClient(env, 'paul@example.org');
    const res = await (server as unknown as { call: (m: string, p: string, b: unknown) => Promise<unknown> })
      .call('POST', '/v1/analyze/audit', { url: ARTICLE_URL, title: 'Accueil', blocks: page })
      .catch((e: unknown) => e);
    expect((res as HostedApiError).code).toBe('article_too_long');
    expect((res as HostedApiError).message).toBe((err as HostedApiError).message);
    expect(env.llm.calls).toEqual({ complete: 0, grounded: 0 });
  });

  it('takes the cache hit without sending the article or spending a credit', async () => {
    const env = makeTestEnv({ fetchImpl: pageFetch(), now: Date.now() });
    const first = await hostedClient(env, 'marie@example.org');
    await first.analyze({ url: ARTICLE_URL, title: 'T', blocks: BLOCKS, citedSources: CITED });

    const callsBefore = { ...env.llm.calls };
    const second = await hostedClient(env, 'paul@example.org');

    let sentBodies = 0;
    const events: PipelineProgressEvent[] = [];
    const report = await second.analyze(
      // A different reader, arriving with campaign parameters on the same page.
      { url: `${ARTICLE_URL}?utm_source=newsletter`, title: 'T', blocks: BLOCKS, citedSources: CITED },
      {
        onProgress: (e) => {
          events.push(e);
          if (e.stage === 'calling_provider') sentBodies += 1;
        },
      },
    );

    expect(report.score).toBeTypeOf('number');
    expect(env.llm.calls).toEqual(callsBefore);
    expect(sentBodies).toBe(0);

    const paul = await env.db.getUserByEmail('paul@example.org');
    expect(await env.db.countUsageLog(paul!.id)).toBe(0);
  });

  it('never serves one account\'s forged text to a reader whose page says something else', async () => {
    const env = makeTestEnv({ fetchImpl: pageFetch(), now: Date.now() });
    const forger = await hostedClient(env, 'forger@example.org');

    // Account A files an invented article under the address of a real one.
    const llm = env.llm;
    const honest = llm.auditJson;
    llm.auditJson = JSON.stringify({ ...JSON.parse(honest), summary: 'RAPPORT FABRIQUE A PARTIR D UN FAUX TEXTE' });
    const forgedBlocks = [
      { id: 'b1', type: 'paragraph' as const, text: 'Le chomage a bondi de 80 % en un an.', charStart: 0 },
      { id: 'b2', type: 'paragraph' as const, text: 'Le gouvernement a menti.', charStart: 40 },
    ];
    const forged = await forger.analyze({ url: ARTICLE_URL, title: 'T', blocks: forgedBlocks, citedSources: CITED });
    expect(forged.summary).toContain('FABRIQUE');

    // Account B reads the real article, whose extraction differs. It gets a
    // miss and its own analysis: the provider is called, and the forged
    // report never comes back.
    llm.auditJson = honest;
    const callsBefore = llm.calls.complete;
    const reader = await hostedClient(env, 'reader@example.org');
    const own = await reader.analyze({ url: ARTICLE_URL, title: 'T', blocks: BLOCKS, citedSources: CITED });
    expect(llm.calls.complete).toBeGreaterThan(callsBefore);
    expect(own.summary).not.toContain('FABRIQUE');
    const readerRow = await env.db.getUserByEmail('reader@example.org');
    expect(await env.db.countUsageLog(readerRow!.id)).toBe(1);

    // A third reader of the real article is now served B's report, and the
    // forger's text keeps answering only to the page that carries it.
    const third = await hostedClient(env, 'third@example.org');
    const served = await third.analyze({ url: ARTICLE_URL, title: 'T', blocks: BLOCKS, citedSources: CITED });
    expect(served.summary).toBe(own.summary);
    expect(served.summary).not.toContain('FABRIQUE');
  });

  it('surfaces a billing refusal as a code the panel can branch on', async () => {
    const env = makeTestEnv({ fetchImpl: pageFetch(), now: Date.now() });
    const client = await hostedClient(env, 'marie@example.org');

    // Three trial analyses, on three different articles so the cache does not
    // answer for the second and third.
    for (let i = 0; i < 3; i += 1) {
      await client.analyze({ url: `${ARTICLE_URL}/${i}`, title: 'T', blocks: BLOCKS, citedSources: CITED });
    }

    await expect(
      client.analyze({ url: `${ARTICLE_URL}/x`, title: 'T', blocks: BLOCKS, citedSources: CITED }),
    ).rejects.toMatchObject({ name: 'HostedApiError', code: 'trial_exhausted' });

    const err = await client
      .analyze({ url: `${ARTICLE_URL}/y`, title: 'T', blocks: BLOCKS, citedSources: CITED })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HostedApiError);
    expect((err as HostedApiError).isBilling).toBe(true);
  });

  it('loses one finding, not the run, when a research call fails', async () => {
    const llm = new StubLlm();
    llm.auditJson = JSON.stringify({
      summary: 'Deux affirmations non etayees.',
      scores: [{ domain: 'robustesse_factuelle', score: 20, strengths: [], weaknesses: [] }],
      findings: [
        // First, so it is the one the failure lands on: it sits on a block the
        // article cites nothing for, so no later source-check can re-rate it.
        {
          id: 'f1',
          blockId: 'b2',
          quote: 'Tout le monde le sait.',
          category: 'affirmation-non-etayee',
          checkableClaim: 'Tout le monde le sait.',
          severity: 2,
          label: 'A',
          explanation: 'x',
          confidence: 0.9,
        },
        {
          id: 'f2',
          blockId: 'b1',
          quote: 'Le chomage a baisse de 12 % en un an.',
          category: 'affirmation-non-etayee',
          checkableClaim: 'Le chomage a baisse de 12 % en un an.',
          severity: 2,
          label: 'B',
          explanation: 'y',
          confidence: 0.9,
        },
      ],
      claims: [],
    });
    const env = makeTestEnv({ fetchImpl: pageFetch(), llm, now: Date.now() });
    const client = await hostedClient(env, 'marie@example.org');

    llm.failNextGrounded = true;
    const report = await client.analyze({
      url: ARTICLE_URL,
      title: 'T',
      blocks: BLOCKS,
      citedSources: CITED,
    });

    // f1 could not be checked and still stands; f2 was confirmed and withdrawn.
    expect(report.findings.map((f) => f.id)).toEqual(['f1']);
    expect(report.research.withdrawn).toHaveLength(1);
  });

  it('stops on abort without finalizing', async () => {
    const env = makeTestEnv({ fetchImpl: pageFetch(), now: Date.now() });
    const client = await hostedClient(env, 'marie@example.org');

    const running = client.analyze(
      { url: ARTICLE_URL, title: 'T', blocks: BLOCKS, citedSources: CITED },
      { onProgress: (e) => { if (e.stage === 'calling_provider') client.abort(); } },
    );

    await expect(running).rejects.toThrow();
    const user = await env.db.getUserByEmail('marie@example.org');
    expect(await env.db.countUsageLog(user!.id)).toBe(0);
  });

  it('refuses to work with a key the account never registered', async () => {
    const env = makeTestEnv({ fetchImpl: pageFetch(), now: Date.now() });
    const legitimate = await hostedClient(env, 'marie@example.org');
    await legitimate.analyze({ url: ARTICLE_URL, title: 'T', blocks: BLOCKS, citedSources: CITED });

    // A stolen token, signed with a key of the attacker's own making.
    const { sessionCookie } = await magicLogin(env, 'paul@example.org');
    const stolen = (await (
      await claimToken(env, sessionCookie, await exportJwk(await generateSigningKeyPair()))
    ).json()) as { token: string };

    const impostor = new HostedAnalysisClient({
      baseUrl: env.webAppOrigin,
      token: stolen.token,
      privateKey: (await generateSigningKeyPair()).privateKey,
      fetchImpl: ((url: RequestInfo | URL, init?: RequestInit) =>
        env.handler(new Request(url as string, init))) as typeof fetch,
    });

    await expect(
      impostor.analyze({ url: `${ARTICLE_URL}/z`, title: 'T', blocks: BLOCKS, citedSources: CITED }),
    ).rejects.toMatchObject({ code: 'bad_signature' });
  });
});
