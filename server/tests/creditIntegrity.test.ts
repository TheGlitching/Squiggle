/**
 * What one credit buys.
 *
 * A credit is consumed once, at finalize. Everything here is a way that
 * accounting could have been wrong: a run that keeps buying provider calls
 * after it was paid for, two audits racing through a ceiling that had nothing
 * to look at yet, a run whose cost the client gets to choose, and a checkout
 * that grants access no subscription event ever bounded.
 *
 * Each of these was found by re-reading the stages rather than by a failing
 * test, so each one gets a test that would have failed.
 */
import { describe, expect, it } from 'vitest';

import { generateSigningKeyPair } from '@squiggle/shared';

import {
  claim as claimToken,
  exportJwk,
  magicLogin,
  makeTestEnv,
  postStripeEvent,
  signedRequest,
  StubLlm,
  type TestEnv,
} from './helpers';
import { MAX_RESEARCH_CALLS_PER_RUN, MAX_SOURCE_CHECKS_PER_RUN } from '../src/analyze/stages';
import { effectivePlan } from '../src/billing/quota';

const ARTICLE_URL = 'https://presse.example/politique/emploi-2026';
const BLOCKS = [
  { id: 'b1', type: 'paragraph' as const, text: 'Le chomage a baisse de 12 % en un an.', charStart: 0 },
  { id: 'b2', type: 'paragraph' as const, text: 'Tout le monde le sait.', charStart: 40 },
];
const CITED = [
  { href: 'https://insee.example/chomage', domain: 'insee.example', text: 'Insee', blockId: 'b1' },
];

function pageFetch(): typeof fetch {
  return (async () =>
    new Response('<html><body><p>La statistique confirme.</p></body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })) as unknown as typeof fetch;
}

async function signedIn(env: TestEnv, email: string) {
  const key = await generateSigningKeyPair();
  const { sessionCookie } = await magicLogin(env, email);
  const res = await claimToken(env, sessionCookie, await exportJwk(key));
  const { token } = (await res.json()) as { token: string };
  const user = await env.db.getUserByEmail(email);
  return { key, token, userId: user!.id };
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
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

/** An audit whose model answers with `count` researchable findings. */
function llmWithFindings(count: number): StubLlm {
  const llm = new StubLlm();
  llm.auditJson = JSON.stringify({
    summary: 'Beaucoup de constats.',
    scores: [{ domain: 'robustesse_factuelle', score: 20, strengths: [], weaknesses: [] }],
    findings: Array.from({ length: count }, (_, i) => ({
      id: `f${i}`,
      blockId: 'b1',
      quote: 'Le chomage a baisse de 12 % en un an.',
      category: 'affirmation-non-etayee',
      severity: 2,
      label: `L${i}`,
      explanation: 'x',
      confidence: 0.9,
    })),
    claims: [],
  });
  return llm;
}

describe('a paid-for run is closed', () => {
  it('refuses research and source-check once the credit has been consumed', async () => {
    const env = makeTestEnv({ fetchImpl: pageFetch() });
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
    await call(env, who, '/v1/analyze/finalize', { runId });

    const callsAfterFinalize = { ...env.llm.calls };

    // The run is paid for. Left open, these would keep buying provider calls
    // against a credit that has already been spent.
    const late = await call(env, who, '/v1/analyze/research', { runId, findingId: 'f1' });
    expect(late.status).toBe(409);
    expect(late.json.error).toBe('run_already_finalized');

    const lateSource = await call(env, who, '/v1/analyze/source-check', {
      runId,
      claimId,
      sourceUrl: CITED[0].href,
    });
    expect(lateSource.status).toBe(409);

    expect(env.llm.calls).toEqual(callsAfterFinalize);
  });
});

describe('the run is reserved before the provider is called', () => {
  it('lets only one of two simultaneous audits through', async () => {
    const env = makeTestEnv({ fetchImpl: pageFetch() });
    const who = await signedIn(env, 'marie@example.org');

    // Both requests are in flight before either has an audit answer, which is
    // exactly the window a row written after the provider call would leave open.
    const [a, b] = await Promise.all([
      call(env, who, '/v1/analyze/audit', { url: ARTICLE_URL, title: 'T', blocks: BLOCKS }),
      call(env, who, '/v1/analyze/audit', { url: ARTICLE_URL, title: 'T', blocks: BLOCKS }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 429]);
  });

  it('releases the reservation when the audit itself fails', async () => {
    const env = makeTestEnv({ fetchImpl: pageFetch() });
    const who = await signedIn(env, 'marie@example.org');

    env.llm.failNextComplete = true;
    const failed = await call(env, who, '/v1/analyze/audit', { url: ARTICLE_URL, title: 'T', blocks: BLOCKS });
    expect(failed.status).toBe(502);

    // A failed audit must not hold the account's single slot for five minutes.
    const retry = await call(env, who, '/v1/analyze/audit', { url: ARTICLE_URL, title: 'T', blocks: BLOCKS });
    expect(retry.status).toBe(200);
  });
});

describe('the client does not choose what a credit costs', () => {
  it('caps the research calls a single run can buy', async () => {
    const env = makeTestEnv({ fetchImpl: pageFetch(), llm: llmWithFindings(60) });
    const who = await signedIn(env, 'marie@example.org');

    const audit = await call(env, who, '/v1/analyze/audit', { url: ARTICLE_URL, title: 'T', blocks: BLOCKS });
    const runId = audit.json.runId as string;

    // The list handed to the client is already capped, so a well-behaved
    // client never asks for more.
    expect((audit.json.researchable as string[]).length).toBe(MAX_RESEARCH_CALLS_PER_RUN);

    // And a client that ignores it is refused rather than served.
    for (let i = 0; i < MAX_RESEARCH_CALLS_PER_RUN; i += 1) {
      expect((await call(env, who, '/v1/analyze/research', { runId, findingId: `f${i}` })).status).toBe(200);
    }
    const over = await call(env, who, '/v1/analyze/research', { runId, findingId: 'f30' });
    expect(over.status).toBe(429);
  });

  it('caps the pages a single run can read', async () => {
    const env = makeTestEnv({ fetchImpl: pageFetch(), llm: llmWithFindings(12) });
    const who = await signedIn(env, 'marie@example.org');

    // Twelve distinct citations on the same block, so every claim has one.
    const cited = Array.from({ length: 12 }, (_, i) => ({
      href: `https://source-${i}.example/page`,
      domain: `source-${i}.example`,
      text: `source ${i}`,
      blockId: 'b1',
    }));
    const audit = await call(env, who, '/v1/analyze/audit', {
      url: ARTICLE_URL,
      title: 'T',
      blocks: BLOCKS,
      citedSources: cited,
    });
    const runId = audit.json.runId as string;

    const claimIds: string[] = [];
    for (const findingId of audit.json.researchable as string[]) {
      const res = await call(env, who, '/v1/analyze/research', { runId, findingId });
      if (res.json.claim) claimIds.push((res.json.claim as { id: string }).id);
    }

    let accepted = 0;
    let refused = 0;
    for (let i = 0; i < claimIds.length; i += 1) {
      const res = await call(env, who, '/v1/analyze/source-check', {
        runId,
        claimId: claimIds[i],
        sourceUrl: cited[i].href,
      });
      if (res.status === 200) accepted += 1;
      else refused += 1;
    }
    expect(accepted).toBe(MAX_SOURCE_CHECKS_PER_RUN);
    expect(refused).toBeGreaterThan(0);
  });
});

describe('the usage ledger', () => {
  it('records that an analysis happened, not which article it was', async () => {
    const env = makeTestEnv({ fetchImpl: pageFetch() });
    const who = await signedIn(env, 'marie@example.org');

    const audit = await call(env, who, '/v1/analyze/audit', { url: ARTICLE_URL, title: 'T', blocks: BLOCKS });
    await call(env, who, '/v1/analyze/finalize', { runId: audit.json.runId as string });

    const row = await env.db.recordAnalysis({ userId: who.userId, now: env.clock.now() });
    // The row's whole vocabulary: an id, an account, a time. A 12-month ledger
    // naming the article would be a 12-month browsing history.
    expect(Object.keys(row).sort()).toEqual(['createdAt', 'id', 'userId']);
    expect(JSON.stringify(row)).not.toContain('presse.example');
  });
});

describe('a checkout that is never confirmed', () => {
  it('grants provisional access rather than permanent access', async () => {
    const env = makeTestEnv();
    const who = await signedIn(env, 'marie@example.org');

    // Only the checkout event arrives; the subscription event that carries the
    // real period end never does.
    await postStripeEvent(env, {
      id: 'evt_checkout_only',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_1',
          customer: 'cus_1',
          subscription: 'sub_1',
          metadata: { user_id: who.userId },
        },
      },
    });

    const user = await env.db.getUserById(who.userId);
    expect(user!.plan).toBe('active');
    expect(user!.planExpiresAt).not.toBeNull();
    // It lapses on its own instead of lasting for ever unnoticed.
    expect(effectivePlan(user!, env.clock.now() + 8 * 24 * 60 * 60 * 1000)).toBe('none');
  });

  it('does not let a late checkout overwrite a real subscription expiry', async () => {
    const env = makeTestEnv();
    const who = await signedIn(env, 'marie@example.org');

    // Stripe does not promise ordered delivery. The subscription event arrives
    // first here and carries the real period end.
    const periodEndSec = Math.floor(env.clock.now() / 1000) + 30 * 24 * 60 * 60;
    await postStripeEvent(env, {
      id: 'evt_sub_first',
      type: 'customer.subscription.created',
      data: {
        object: {
          id: 'sub_1',
          customer: 'cus_1',
          status: 'active',
          current_period_end: periodEndSec,
          metadata: { user_id: who.userId },
        },
      },
    });
    expect((await env.db.getUserById(who.userId))!.planExpiresAt).toBe(periodEndSec * 1000);

    // The checkout session is delivered afterwards. Its provisional 7-day
    // expiry must not shorten the month the subscription actually bought.
    await postStripeEvent(env, {
      id: 'evt_checkout_late',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_1',
          customer: 'cus_1',
          subscription: 'sub_1',
          metadata: { user_id: who.userId },
        },
      },
    });

    const after = await env.db.getUserById(who.userId);
    expect(after!.plan).toBe('active');
    expect(after!.planExpiresAt).toBe(periodEndSec * 1000);
  });
});
