/**
 * Billing and quotas (Phase 2d), against a fake Stripe and real HMAC
 * signatures. No account, no key, no network.
 *
 * The journey the acceptance criteria describe is one test at the bottom:
 * trial → paywall → activation → the tenth analysis of the day → the
 * eleventh refused → cancellation → back to nothing.
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
  STRIPE_PRICE_ID,
  type TestEnv,
} from './helpers';
import { ACTIVE_ANALYSES_PER_DAY, TRIAL_ANALYSES } from '../src/billing/quota';
import { parseStripeSignature, WEBHOOK_TOLERANCE_SECONDS } from '../src/billing/stripe';
import { DAY_MS } from '../src/usage/limits';

const ARTICLE_URL = 'https://presse.example/politique/emploi-2026';
const BLOCKS = [
  { id: 'b1', type: 'paragraph' as const, text: 'Le chomage a baisse de 12 % en un an.', charStart: 0 },
  { id: 'b2', type: 'paragraph' as const, text: 'Tout le monde le sait.', charStart: 40 },
];

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

/** One complete analysis: audit then finalize. Consumes exactly one credit. */
async function analyse(env: TestEnv, who: { key: CryptoKeyPair; token: string }, url = ARTICLE_URL) {
  const audit = await call(env, who, '/v1/analyze/audit', { url, title: 'T', blocks: BLOCKS });
  if (audit.status !== 200) return audit;
  const finalized = await call(env, who, '/v1/analyze/finalize', { runId: audit.json.runId as string });
  // Clear the concurrency window so the next analysis is about quota alone.
  env.clock.advance(6 * 60 * 1000);
  return finalized;
}

function subscriptionEvent(
  type: string,
  userId: string,
  fields: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: `evt_${type}_${Math.random().toString(36).slice(2)}`,
    type,
    data: {
      object: {
        id: 'sub_test_1',
        customer: 'cus_test_1',
        status: 'active',
        metadata: { user_id: userId },
        ...fields,
      },
    },
  };
}

describe('webhook signature', () => {
  it('parses the header Stripe actually sends, including rotation', () => {
    expect(parseStripeSignature('t=1700000000,v1=aa,v0=zz,v1=bb')).toEqual({
      timestamp: 1700000000,
      signatures: ['aa', 'bb'],
    });
    expect(parseStripeSignature('v1=aa')).toBeNull();
    expect(parseStripeSignature('t=1700000000')).toBeNull();
  });

  it('refuses forged, stale and tampered events, and applies nothing', async () => {
    const env = makeTestEnv();
    const { userId } = await signedIn(env, 'marie@example.org');
    const event = subscriptionEvent('customer.subscription.updated', userId);

    const forged = await postStripeEvent(env, event, { secret: 'whsec_wrong_secret' });
    expect(forged.status).toBe(401);

    const stale = await postStripeEvent(env, event, {
      timestampSec: Math.floor(env.clock.now() / 1000) - WEBHOOK_TOLERANCE_SECONDS - 1,
    });
    expect(stale.status).toBe(401);

    // Correctly signed, then a byte appended: the MAC no longer matches.
    const tampered = await postStripeEvent(env, event, { tamperBody: true });
    expect(tampered.status).toBe(401);

    const unsigned = await env.handler(
      new Request(`${env.webAppOrigin}/webhooks/stripe`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(event),
      }),
    );
    expect(unsigned.status).toBe(401);

    // Through all of that, the plan never moved.
    expect((await env.db.getUserById(userId))!.plan).toBe('trial');
  });

  it('applies a redelivered event exactly once', async () => {
    const env = makeTestEnv();
    const { userId } = await signedIn(env, 'marie@example.org');
    const event = subscriptionEvent('customer.subscription.deleted', userId);

    const first = await postStripeEvent(env, event);
    expect(((await first.json()) as { applied: boolean }).applied).toBe(true);

    const second = await postStripeEvent(env, event);
    expect(second.status).toBe(200);
    expect(((await second.json()) as { applied: boolean }).applied).toBe(false);
  });

  it('acknowledges an event type it does not handle rather than failing', async () => {
    const env = makeTestEnv();
    const { userId } = await signedIn(env, 'marie@example.org');
    const res = await postStripeEvent(env, subscriptionEvent('customer.updated', userId));
    expect(res.status).toBe(200);
  });
});

describe('checkout and portal', () => {
  it('opens a Checkout session for the configured price, carrying our account id', async () => {
    const env = makeTestEnv();
    const who = await signedIn(env, 'marie@example.org');

    const res = await call(env, who, '/v1/account/checkout', {});
    expect(res.status).toBe(200);
    expect(res.json.url).toBe('https://checkout.stripe.example/cs_test_1');

    const sent = env.stripe.calls.at(-1)!;
    expect(sent.path).toBe('/checkout/sessions');
    expect(sent.form['line_items[0][price]']).toBe(STRIPE_PRICE_ID);
    expect(sent.form.mode).toBe('subscription');
    // Our id travels with the session, so the webhook never has to guess.
    expect(sent.form['metadata[user_id]']).toBe(who.userId);
    expect(sent.form['subscription_data[metadata][user_id]']).toBe(who.userId);
  });

  it('refuses a portal session for an account that never paid', async () => {
    const env = makeTestEnv();
    const who = await signedIn(env, 'marie@example.org');
    const res = await call(env, who, '/v1/account/portal', {});
    expect(res.status).toBe(404);
  });

  it('degrades honestly when Stripe is unavailable, without echoing its error', async () => {
    const env = makeTestEnv();
    const who = await signedIn(env, 'marie@example.org');
    env.stripe.failNext = true;

    const res = await call(env, who, '/v1/account/checkout', {});
    expect(res.status).toBe(502);
    expect(res.json.error).toBe('billing_unavailable');
    expect(JSON.stringify(res.json)).not.toContain('boom');
  });

  it('never lets a client declare itself subscribed', async () => {
    const env = makeTestEnv();
    const who = await signedIn(env, 'marie@example.org');
    // There is no endpoint for it; the closest thing a client can reach is
    // its own account, which is read-only.
    const res = await call(env, who, '/v1/account/plan', { plan: 'active' });
    expect(res.status).toBe(404);
    expect((await env.db.getUserById(who.userId))!.plan).toBe('trial');
  });
});

describe('quotas', () => {
  it('allows ten analyses a day on an active plan', () => {
    expect(ACTIVE_ANALYSES_PER_DAY).toBe(10);
  });

  it('reports the entitlement on the account endpoint', async () => {
    const env = makeTestEnv();
    const who = await signedIn(env, 'marie@example.org');

    const before = await call(env, who, '/v1/account');
    expect(before.json.plan).toBe('trial');
    expect(before.json.usage).toEqual({ used: 0, limit: TRIAL_ANALYSES, remaining: TRIAL_ANALYSES, resetsAt: null });

    await analyse(env, who);
    const after = await call(env, who, '/v1/account');
    expect((after.json.usage as { used: number }).used).toBe(1);
  });

  it('reports an expired subscription as none, whatever the row says', async () => {
    const env = makeTestEnv();
    const who = await signedIn(env, 'marie@example.org');
    // A period end in the past: a cancellation we somehow never heard about
    // must still lapse rather than granting an unbounded subscription.
    await env.db.setPlan(who.userId, 'active', env.clock.now() - 1, env.clock.now());

    const res = await call(env, who, '/v1/account');
    expect(res.json.plan).toBe('none');
    const analysis = await analyse(env, who);
    expect(analysis.status).toBe(402);
    expect(analysis.json.error).toBe('subscription_required');
  });

  it('does not consume a credit when an analysis fails', async () => {
    const env = makeTestEnv();
    const who = await signedIn(env, 'marie@example.org');

    env.llm.failNextComplete = true;
    const failed = await call(env, who, '/v1/analyze/audit', { url: ARTICLE_URL, title: 'T', blocks: BLOCKS });
    expect(failed.status).toBe(502);

    const account = await call(env, who, '/v1/account');
    expect((account.json.usage as { used: number }).used).toBe(0);
  });

  it('walks the whole journey: trial, paywall, activation, daily cap, cancellation', async () => {
    const env = makeTestEnv();
    const who = await signedIn(env, 'marie@example.org');

    // 1. The trial is a total, not a daily allowance.
    for (let i = 0; i < TRIAL_ANALYSES; i += 1) {
      expect((await analyse(env, who, `${ARTICLE_URL}/${i}`)).status).toBe(200);
    }

    // 2. Fourth attempt: the paywall, with its own code.
    const paywalled = await analyse(env, who, `${ARTICLE_URL}/x`);
    expect(paywalled.status).toBe(402);
    expect(paywalled.json.error).toBe('trial_exhausted');

    // Even tomorrow: the trial does not reset.
    env.clock.advance(DAY_MS);
    expect((await analyse(env, who, `${ARTICLE_URL}/y`)).json.error).toBe('trial_exhausted');

    // 3. They subscribe. Only the webhook can say so.
    const checkoutDone = await postStripeEvent(env, {
      id: 'evt_checkout_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_1',
          customer: 'cus_test_1',
          subscription: 'sub_test_1',
          metadata: { user_id: who.userId },
        },
      },
    });
    expect(checkoutDone.status).toBe(200);
    await postStripeEvent(
      env,
      subscriptionEvent('customer.subscription.updated', who.userId, {
        current_period_end: Math.floor((env.clock.now() + 30 * DAY_MS) / 1000),
      }),
    );

    const account = await call(env, who, '/v1/account');
    expect(account.json.plan).toBe('active');
    expect((account.json.usage as { limit: number }).limit).toBe(ACTIVE_ANALYSES_PER_DAY);

    // 4. Ten a day pass; the eleventh does not.
    for (let i = 0; i < ACTIVE_ANALYSES_PER_DAY; i += 1) {
      expect((await analyse(env, who, `${ARTICLE_URL}/day1-${i}`)).status).toBe(200);
    }
    const eleventh = await analyse(env, who, `${ARTICLE_URL}/day1-10`);
    expect(eleventh.status).toBe(429);
    expect(eleventh.json.error).toBe('quota_exhausted');

    // 5. Tomorrow the daily count resets - unlike the trial.
    env.clock.advance(DAY_MS);
    expect((await analyse(env, who, `${ARTICLE_URL}/day2-0`)).status).toBe(200);

    // 6. A failed payment suspends immediately: Stripe retries for days and
    //    every retry would otherwise be free analyses.
    await postStripeEvent(env, {
      id: 'evt_failed_1',
      type: 'invoice.payment_failed',
      data: { object: { id: 'in_test_1', customer: 'cus_test_1', metadata: { user_id: who.userId } } },
    });
    expect((await analyse(env, who, `${ARTICLE_URL}/after-fail`)).json.error).toBe('subscription_required');

    // 7. The retry succeeds: the subscription event reinstates them.
    await postStripeEvent(
      env,
      subscriptionEvent('customer.subscription.updated', who.userId, {
        current_period_end: Math.floor((env.clock.now() + 30 * DAY_MS) / 1000),
      }),
    );
    expect((await analyse(env, who, `${ARTICLE_URL}/after-recovery`)).status).toBe(200);

    // 8. They cancel for good.
    await postStripeEvent(env, subscriptionEvent('customer.subscription.deleted', who.userId, { status: 'canceled' }));
    const afterCancel = await analyse(env, who, `${ARTICLE_URL}/after-cancel`);
    expect(afterCancel.status).toBe(402);
    expect(afterCancel.json.error).toBe('subscription_required');
    expect((await env.db.getUserById(who.userId))!.stripeSubId).toBeNull();
  });

  it('suspends on a non-entitling subscription status, and only on those', async () => {
    for (const [status, expected] of [
      ['active', 'active'],
      ['trialing', 'active'],
      ['past_due', 'none'],
      ['unpaid', 'none'],
      ['incomplete_expired', 'none'],
      ['paused', 'none'],
      ['canceled', 'none'],
    ] as const) {
      const env = makeTestEnv();
      const who = await signedIn(env, 'marie@example.org');
      await postStripeEvent(
        env,
        subscriptionEvent('customer.subscription.updated', who.userId, {
          status,
          current_period_end: Math.floor((env.clock.now() + 30 * DAY_MS) / 1000),
        }),
      );
      expect({ status, plan: (await env.db.getUserById(who.userId))!.plan }).toEqual({ status, plan: expected });
    }
  });
});
