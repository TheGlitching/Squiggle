/**
 * The hosted audit, asked twice at once.
 *
 * How long the model reasons is a draw, so the server asks two audits of
 * Nebius at once and keeps the first readable one. These run the real hosted
 * client against a scripted OpenRouter: which racer wins, what happens when one
 * of them answers unreadable or both do, that the loser is aborted, and that
 * what the loser was billed is still counted.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { generateSigningKeyPair, HOSTED_ANALYSIS } from '@squiggle/shared';

import { claim as claimToken, exportJwk, magicLogin, makeTestEnv, signedRequest, StubLlm, type TestEnv } from './helpers';
import { TRIAL_ANALYSES } from '../src/billing/quota';
import { createHostedLlm } from '../src/index';

const ARTICLE_URL = 'https://presse.example/politique/emploi-2026';
const BLOCKS = [
  { id: 'b1', type: 'paragraph' as const, text: 'Le chômage a baissé de 12 % en un an.', charStart: 0 },
  { id: 'b2', type: 'paragraph' as const, text: 'Tout le monde le sait.', charStart: 40 },
];
const VALID = new StubLlm().auditJson;
const UNREADABLE = VALID.slice(0, Math.floor(VALID.length * 0.6));

/** One scripted audit stream: how long it reasons, what it answers, what it is billed. */
interface Script {
  ms: number;
  content: string;
  finishReason?: string;
  cost: number;
}

interface Sent {
  provider: unknown;
  stream: boolean;
  /** Whether the stream was cut off before its end. */
  aborted: boolean;
}

/**
 * OpenRouter, as the hosted client sees it: each streamed request takes the
 * next script, reasons for `ms` in four steps, writes its answer in two
 * chunks, then reports its cost in the last one. A stream whose request is
 * aborted errors at once and never reports it, like a real one. Any other
 * request would be the critique, which keeps every finding.
 */
function scriptedOpenRouter(scripts: Script[]) {
  const sent: Sent[] = [];
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { stream?: boolean; provider?: unknown };
    const signal = init.signal ?? undefined;
    const request: Sent = { provider: body.provider, stream: !!body.stream, aborted: false };
    sent.push(request);
    if (!body.stream) {
      return Response.json({
        choices: [{ message: { content: JSON.stringify({ decisions: [], ajouts: [] }) }, finish_reason: 'stop' }],
        usage: { cost: 0.002 },
      });
    }
    const script = scripts.shift();
    if (!script) throw new Error('no script left for this audit');
    const half = Math.floor(script.content.length / 2);
    const events: unknown[] = [
      ...Array.from({ length: 4 }, (_, i) => ({ choices: [{ delta: { reasoning: `étape ${i} du raisonnement `.repeat(60) } }] })),
      { choices: [{ delta: { content: script.content.slice(0, half) } }] },
      { choices: [{ delta: { content: script.content.slice(half) }, finish_reason: script.finishReason ?? 'stop' }] },
      { choices: [], usage: { prompt_tokens: 9764, completion_tokens: 12000, cost: script.cost } },
    ];
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const abort = () => {
          request.aborted = true;
          controller.error(new DOMException('The operation was aborted.', 'AbortError'));
        };
        if (signal?.aborted) return abort();
        signal?.addEventListener('abort', abort);
        for (const [i, event] of events.entries()) {
          if (i < 4) await new Promise((resolve) => setTimeout(resolve, script.ms / 4));
          if (signal?.aborted) return;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        signal?.removeEventListener('abort', abort);
        controller.close();
      },
    });
    return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { sent, fetchMock };
}

async function hostedEnv() {
  const env = makeTestEnv({ llm: createHostedLlm({ OPENROUTER_API_KEY: 'k' })! as unknown as StubLlm });
  const key = await generateSigningKeyPair();
  const { sessionCookie } = await magicLogin(env, 'marie@example.org');
  const res = await claimToken(env, sessionCookie, await exportJwk(key));
  const { token } = (await res.json()) as { token: string };
  return { env, who: { key, token } };
}

/** The audit, watched as it goes: the progress lines, then the response. */
async function audit(env: TestEnv, who: { key: CryptoKeyPair; token: string }) {
  const signed = await signedRequest(env, {
    key: who.key,
    token: who.token,
    path: '/v1/analyze/audit',
    method: 'POST',
    body: JSON.stringify({ url: ARTICLE_URL, title: 'T', blocks: BLOCKS }),
  });
  const headers = new Headers(signed.headers);
  headers.set('accept', 'application/x-ndjson');
  const res = await env.handler(new Request(signed, { headers }));
  const lines = (await res.text()).trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
  const progress = lines.filter((line) => line.progress).map((line) => line.progress as Record<string, unknown>);
  const last = lines.at(-1) as { status: number; body: Record<string, unknown> };
  return { status: last.status, body: last.body, progress };
}

async function counters(env: TestEnv) {
  return (await env.db.collectMetrics({ now: env.clock.now(), weeks: 1, trialAnalyses: TRIAL_ANALYSES })).counters;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the hosted audit, asked twice at once', () => {
  it('pins both audits to Nebius alone, with the same privacy preferences as every other request', async () => {
    const { env, who } = await hostedEnv();
    const { sent } = scriptedOpenRouter([
      { ms: 20, content: VALID, cost: 0.02 },
      { ms: 200, content: VALID, cost: 0.02 },
    ]);

    expect((await audit(env, who)).status).toBe(200);

    const audits = sent.filter((request) => request.stream);
    expect(audits).toHaveLength(2);
    const nebius = HOSTED_ANALYSIS.inferenceHosts[0].slug;
    expect(nebius).toBe('nebius');
    for (const request of audits) {
      expect(request.provider).toEqual({
        order: [nebius],
        only: [nebius],
        allow_fallbacks: false,
        require_parameters: true,
        data_collection: 'deny',
        zdr: true,
      });
    }
    // An article this short is not worth a critique: the two audits are all it cost.
    expect(sent).toHaveLength(2);
  });

  it.each([
    ['the first', [20, 2000]],
    ['the second', [2000, 20]],
  ])('keeps the report of %s racer to finish, aborts the other and still counts what it was billed', async (_, [a, b]) => {
    const { env, who } = await hostedEnv();
    const { sent } = scriptedOpenRouter([
      { ms: a, content: VALID, cost: 0.02 },
      { ms: b, content: VALID, cost: 0.03 },
    ]);

    const result = await audit(env, who);
    expect(result.status).toBe(200);
    expect(result.body.runId).toBeTruthy();

    // Answered as soon as the faster one was read: the slower one was cut off mid-stream.
    const [first, second] = sent.filter((request) => request.stream);
    expect((a < b ? second : first).aborted).toBe(true);
    expect((a < b ? first : second).aborted).toBe(false);

    const c = await counters(env);
    expect(c.audit).toBe(2);
    expect(c.audit_failed).toBe(0);
    // The winner's bill, and the loser's, which never reported it, estimated at the same.
    const winner = a < b ? 20_000 : 30_000;
    expect(c.cost_audit).toBe(2 * winner);
  });

  it('waits for the other racer when the first to finish is cut short', async () => {
    const { env, who } = await hostedEnv();
    const { sent } = scriptedOpenRouter([
      { ms: 20, content: UNREADABLE, finishReason: 'length', cost: 0.025 },
      { ms: 80, content: VALID, cost: 0.02 },
    ]);

    const result = await audit(env, who);
    expect(result.status).toBe(200);
    // No replay: the second racer's report was enough.
    expect(sent.filter((request) => request.stream)).toHaveLength(2);
    expect(sent.some((request) => request.aborted)).toBe(false);

    const c = await counters(env);
    expect(c.audit).toBe(2);
    expect(c.audit_truncated).toBe(1);
    expect(c.audit_failed).toBe(1);
    expect(c.cost_audit).toBe(25_000 + 20_000);
  });

  it('asks once more, on the whole host list, when both racers are unreadable', async () => {
    const { env, who } = await hostedEnv();
    const { sent } = scriptedOpenRouter([
      { ms: 20, content: UNREADABLE, finishReason: 'length', cost: 0.025 },
      { ms: 40, content: '{"summary": pas du json', cost: 0.02 },
      { ms: 20, content: VALID, cost: 0.02 },
    ]);

    const result = await audit(env, who);
    expect(result.status).toBe(200);
    const audits = sent.filter((request) => request.stream);
    expect(audits).toHaveLength(3);
    const slugs = HOSTED_ANALYSIS.inferenceHosts.map((host) => host.slug);
    expect(audits[2].provider).toMatchObject({ order: slugs, only: slugs });
    expect(result.progress.map((p) => p.step)).toContain('retry');

    const c = await counters(env);
    expect(c.audit).toBe(3);
    expect(c.audit_failed).toBe(2);
  });

  it('tells the reader the answer was unreadable when the replay is too, and gives the start back', async () => {
    const { env, who } = await hostedEnv();
    scriptedOpenRouter([
      { ms: 20, content: UNREADABLE, finishReason: 'length', cost: 0.025 },
      { ms: 40, content: UNREADABLE, finishReason: 'length', cost: 0.025 },
      { ms: 20, content: UNREADABLE, finishReason: 'length', cost: 0.025 },
    ]);

    const result = await audit(env, who);
    expect(result.status).toBe(502);
    expect(result.body.error).toBe('provider_unreadable');
    const c = await counters(env);
    expect(c.audit_failed).toBe(3);
    expect(c.cost_audit).toBe(75_000);
  });

  it('shows the reader the racer furthest along, never a step back', async () => {
    const { env, who } = await hostedEnv();
    scriptedOpenRouter([
      { ms: 40, content: UNREADABLE, finishReason: 'length', cost: 0.025 },
      { ms: 120, content: VALID, cost: 0.02 },
    ]);

    const { status, progress } = await audit(env, who);
    expect(status).toBe(200);
    const steps = progress.map((p) => p.step);
    expect(steps[0]).toBe('sent');
    // Once a racer writes, the other's reasoning is no longer shown.
    const firstWriting = steps.indexOf('writing');
    expect(firstWriting).toBeGreaterThan(0);
    expect(steps.slice(firstWriting).filter((step) => step === 'thinking')).toHaveLength(0);
    for (const kind of ['thinking', 'writing'] as const) {
      const key = kind === 'thinking' ? 'words' : 'findings';
      const values = progress.filter((p) => p.step === kind).map((p) => p[key] as number);
      expect(values).toEqual([...values].sort((x, y) => x - y));
    }
  });
});
