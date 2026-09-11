/**
 * The browser-session account namespace (`/web/account*`).
 *
 * These are the endpoints the web app uses now that a page holds only the
 * `squiggle_session` cookie, never a P-256 key. The tests pin the two things
 * that make them safe — a session is required and an Origin is required — and
 * prove they drive the same billing helpers the signed `/v1/account*` route
 * does rather than a second copy of the logic.
 */
import { describe, expect, it } from 'vitest';

import { CHROME_ORIGIN, magicLogin, makeTestEnv, postStripeEvent, type TestEnv } from './helpers';

interface WebCall {
  method?: string;
  cookie?: string | null;
  /** `null` sends no Origin header at all. */
  origin?: string | null;
  body?: unknown;
}

function web(env: TestEnv, path: string, opts: WebCall = {}): Promise<Response> {
  const method = opts.method ?? 'GET';
  const headers: Record<string, string> = {};
  if (opts.origin !== null) headers.origin = opts.origin ?? env.webAppOrigin;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return env.handler(
    new Request(`${env.webAppOrigin}${path}`, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    }),
  );
}

describe('GET /web/account', () => {
  it('returns the entitlement for a valid session', async () => {
    const env = makeTestEnv();
    const { sessionCookie } = await magicLogin(env, 'marie@example.com');

    const res = await web(env, '/web/account', { cookie: sessionCookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      email: string;
      plan: string;
      usage: { limit: number; remaining: number };
    };
    expect(body.ok).toBe(true);
    expect(body.email).toBe('marie@example.com');
    expect(body.plan).toBe('trial');
    expect(body.usage.limit).toBe(3);
    expect(body.usage.remaining).toBe(3);
  });

  it('refuses a request with no session', async () => {
    const env = makeTestEnv();
    const res = await web(env, '/web/account');
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('invalid_session');
  });

  it('refuses a request with no Origin, even with a valid session', async () => {
    const env = makeTestEnv();
    const { sessionCookie } = await magicLogin(env, 'marie@example.com');
    const res = await web(env, '/web/account', { cookie: sessionCookie, origin: null });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('origin_not_allowed');
  });

  it('refuses a request from another origin', async () => {
    const env = makeTestEnv();
    const { sessionCookie } = await magicLogin(env, 'marie@example.com');
    const res = await web(env, '/web/account', { cookie: sessionCookie, origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('origin_not_allowed');
  });
});

describe('POST /web/account/checkout', () => {
  it('reuses the Checkout helper with web-app success and cancel URLs', async () => {
    const env = makeTestEnv();
    const { sessionCookie, user } = await magicLogin(env, 'marie@example.com');

    const res = await web(env, '/web/account/checkout', { method: 'POST', cookie: sessionCookie, body: {} });
    expect(res.status).toBe(200);
    expect((await res.json()).url).toBe('https://checkout.stripe.example/cs_test_1');

    const call = env.stripe.calls.find((c) => c.path === '/checkout/sessions');
    expect(call).toBeDefined();
    expect(call?.form.success_url).toBe(`${env.webAppOrigin}/compte?paiement=ok`);
    expect(call?.form.cancel_url).toBe(`${env.webAppOrigin}/tarifs?paiement=annule`);
    expect(call?.form['metadata[user_id]']).toBe(user.id);
  });

  it('refuses without a session', async () => {
    const env = makeTestEnv();
    const res = await web(env, '/web/account/checkout', { method: 'POST', body: {} });
    expect(res.status).toBe(401);
    expect(env.stripe.calls).toHaveLength(0);
  });
});

describe('POST /web/account/portal', () => {
  it('refuses when the account has no Stripe customer yet', async () => {
    const env = makeTestEnv();
    const { sessionCookie } = await magicLogin(env, 'marie@example.com');
    const res = await web(env, '/web/account/portal', { method: 'POST', cookie: sessionCookie, body: {} });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_found');
  });

  it('opens the customer portal once a customer exists', async () => {
    const env = makeTestEnv();
    const { sessionCookie, user } = await magicLogin(env, 'marie@example.com');
    // A customer id is written only by the Stripe webhook, never by a client.
    await postStripeEvent(env, {
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          customer: 'cus_test_1',
          subscription: 'sub_test_1',
          metadata: { user_id: user.id },
          // 30 days out, so the plan is in force.
          lines: { data: [{ period: { end: Math.floor((env.clock.now() + 30 * 24 * 3600_000) / 1000) } }] },
        },
      },
    });

    const res = await web(env, '/web/account/portal', { method: 'POST', cookie: sessionCookie, body: {} });
    expect(res.status).toBe(200);
    expect((await res.json()).url).toBe('https://billing.stripe.example/bps_test_1');
    const call = env.stripe.calls.find((c) => c.path === '/billing_portal/sessions');
    expect(call?.form.customer).toBe('cus_test_1');
    expect(call?.form.return_url).toBe(`${env.webAppOrigin}/compte`);
  });
});

describe('the signed /v1 path is unchanged', () => {
  it('still refuses an unsigned /v1/account while the web route needs a cookie', async () => {
    const env = makeTestEnv();
    // An extension origin with no signature: refused by the signed gate, not
    // by the CORS gate.
    const res = await env.handler(
      new Request(`${env.webAppOrigin}/v1/account`, { headers: { origin: CHROME_ORIGIN } }),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('invalid_token');
  });
});