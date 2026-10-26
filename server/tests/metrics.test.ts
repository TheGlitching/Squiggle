/**
 * The launch metrics: aggregate, counts only, behind the admin token.
 *
 * Driven through the worker like every other suite, so the counters are fed by
 * the real stage handlers and the answer is read the way the owner reads it.
 */
import { describe, expect, it } from 'vitest';

import { articleTextHash, generateSigningKeyPair } from '@squiggle/shared';

import { TRIAL_ANALYSES } from '../src/billing/quota';
import { WEEK_MS } from '../src/usage/limits';
import { claim, exportJwk, magicLogin, makeTestEnv, postStripeEvent, signedRequest, T0, type TestEnv } from './helpers';

const URL_ = 'https://presse.example/politique/emploi-2026';
const BLOCKS = [{ id: 'b1', type: 'paragraph' as const, text: 'Le chômage a baissé de 12 % en un an.', charStart: 0 }];
const ADMIN = { authorization: 'Bearer admin-secret' };

async function signedIn(env: TestEnv, email: string) {
  const key = await generateSigningKeyPair();
  const { sessionCookie } = await magicLogin(env, email);
  const res = await claim(env, sessionCookie, await exportJwk(key));
  return { key, token: ((await res.json()) as { token: string }).token };
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

const check = async (env: TestEnv, who: { key: CryptoKeyPair; token: string }) =>
  call(env, who, `/v1/analyze/check?url=${encodeURIComponent(URL_)}&text=${await articleTextHash(BLOCKS)}`);

const audit = (env: TestEnv, who: { key: CryptoKeyPair; token: string }) =>
  call(env, who, '/v1/analyze/audit', { url: URL_, title: 'T', blocks: BLOCKS, citedSources: [] });

async function metrics(env: TestEnv, query = '') {
  const res = await env.handler(new Request(`${env.webAppOrigin}/admin/metrics${query}`, { headers: ADMIN }));
  return { status: res.status, body: (await res.json()) as { metrics: Record<string, any> } };
}

describe('GET /admin/metrics', () => {
  it('is refused without the admin token', async () => {
    const env = makeTestEnv({ adminToken: 'admin-secret' });
    for (const headers of [{} as Record<string, string>, { authorization: 'Bearer wrong' }, { authorization: 'Bearer admin-secre' }]) {
      const res = await env.handler(new Request(`${env.webAppOrigin}/admin/metrics`, { headers }));
      expect(res.status).toBe(401);
    }
    // No admin token configured at all: nothing is ever accepted.
    const open = makeTestEnv();
    const res = await open.handler(new Request(`${open.webAppOrigin}/admin/metrics`, { headers: ADMIN }));
    expect(res.status).toBe(401);
  });

  it('refuses a malformed window or cost', async () => {
    const env = makeTestEnv({ adminToken: 'admin-secret' });
    for (const query of ['?weeks=0', '?weeks=53', '?weeks=1.5', '?weeks=abc', '?costUsd=-1', '?costUsd=abc']) {
      expect((await metrics(env, query)).status).toBe(400);
    }
  });

  it('is all zeros and null ratios on an empty server', async () => {
    const env = makeTestEnv({ adminToken: 'admin-secret' });
    const { status, body } = await metrics(env, '?weeks=2');
    expect(status).toBe(200);
    expect(body.metrics.accounts).toEqual({ total: 0, perWeek: [0, 0] });
    expect(body.metrics.cache).toEqual({ checks: 0, hits: 0, hitRate: null });
    expect(body.metrics.analyses).toEqual({ finalized: 0, costPerAnalysisUsd: null });
  });

  it('counts accounts, activation, cache hits, stage failures and cost from real traffic', async () => {
    const env = makeTestEnv({ adminToken: 'admin-secret' });
    const marie = await signedIn(env, 'marie@example.org');
    await signedIn(env, 'paul@example.org');

    expect((await check(env, marie)).json.hit).toBe(false);
    const { json } = await audit(env, marie);
    expect((await call(env, marie, '/v1/analyze/finalize', { runId: json.runId })).status).toBe(200);
    // Paul's page yields the same text: the cache answers.
    const paul = await signedIn(env, 'jean@example.org');
    expect((await check(env, paul)).json.hit).toBe(true);

    // A provider failure on the next audit, from a third reader.
    env.llm.failNextComplete = true;
    expect((await audit(env, paul)).status).toBeGreaterThanOrEqual(400);

    const { body } = await metrics(env, '?weeks=1&costUsd=0.5');
    const m = body.metrics;
    expect(m.accounts).toEqual({ total: 3, perWeek: [3] });
    expect(m.activation).toEqual({ withFinalize: 1, share: 0.333 });
    expect(m.cache).toEqual({ checks: 2, hits: 1, hitRate: 0.5 });
    expect(m.stages.audit).toEqual({ calls: 2, failed: 1, failureRate: 0.5 });
    expect(m.stages.research).toEqual({ calls: 0, failed: 0, failureRate: null });
    expect(m.analyses).toEqual({ finalized: 1, costPerAnalysisUsd: 0.5 });
  });

  it('answers with counts only: no account, address or article', async () => {
    const env = makeTestEnv({ adminToken: 'admin-secret' });
    const marie = await signedIn(env, 'marie@example.org');
    await check(env, marie);
    const res = await env.handler(new Request(`${env.webAppOrigin}/admin/metrics`, { headers: ADMIN }));
    const raw = await res.text();
    const user = await env.db.getUserByEmail('marie@example.org');
    for (const secret of ['marie', 'example.org', 'presse.example', user!.id]) expect(raw).not.toContain(secret);
  });

  it('follows trial completion through to payment and counts Stripe subscription events', async () => {
    const env = makeTestEnv({ adminToken: 'admin-secret' });
    const finish = async (email: string, analyses: number) => {
      const user = await env.db.createUser({ email }, env.clock.now());
      for (let i = 0; i < analyses; i++) await env.db.recordAnalysis({ userId: user.id, now: env.clock.now() });
      return user;
    };
    await finish('a@example.org', 0);
    await finish('b@example.org', TRIAL_ANALYSES - 1);
    await finish('c@example.org', TRIAL_ANALYSES);
    const payer = await finish('d@example.org', TRIAL_ANALYSES);
    await env.db.setStripeIds(payer.id, { customerId: 'cus_d', subId: 'sub_d' }, env.clock.now());
    await env.db.setPlan(payer.id, 'active', { start: env.clock.now(), end: env.clock.now() + WEEK_MS }, env.clock.now());

    const event = (id: string, type: string) => ({
      id,
      type,
      data: { object: { id: 'sub_d', customer: 'cus_d', metadata: { user_id: payer.id }, status: 'active' } },
    });
    await postStripeEvent(env, event('evt_1', 'checkout.session.completed'));
    await postStripeEvent(env, event('evt_2', 'customer.subscription.deleted'));
    // A redelivery is not a second cancellation.
    await postStripeEvent(env, event('evt_2', 'customer.subscription.deleted'));

    const { body } = await metrics(env);
    const m = body.metrics;
    expect(m.accounts.total).toBe(4);
    expect(m.activation.withFinalize).toBe(3);
    expect(m.trial).toEqual({ completed: 2, completionShare: 0.5, convertedToPaid: 1, conversion: 0.5 });
    expect(m.subscriptions.started).toBe(1);
    expect(m.subscriptions.cancelled).toBe(1);
    // The webhook has downgraded the payer, so nobody is active: 1 of 1 left.
    expect(m.subscriptions.active).toBe(0);
    expect(m.subscriptions.cancellationRate).toBe(1);
  });

  it('buckets accounts by week and forgets events older than the window', async () => {
    const env = makeTestEnv({ adminToken: 'admin-secret' });
    await env.db.createUser({ email: 'old@example.org' }, T0 - 5 * WEEK_MS);
    await env.db.createUser({ email: 'last-week@example.org' }, T0 - 1.5 * WEEK_MS);
    await env.db.createUser({ email: 'now@example.org' }, T0);
    await env.db.bumpMetric('check', T0 - 10 * WEEK_MS);
    await env.db.bumpMetric('check', T0);

    const { body } = await metrics(env, '?weeks=3');
    expect(body.metrics.accounts).toEqual({ total: 3, perWeek: [0, 1, 1] });
    expect(body.metrics.cache.checks).toBe(1);
  });
});
