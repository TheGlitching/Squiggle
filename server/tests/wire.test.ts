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
