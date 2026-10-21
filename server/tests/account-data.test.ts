/**
 * The account-data rights: revoke an install, change the address, erase the
 * account (`/web/account/*`).
 *
 * Each action is driven the way the web app drives it - `fetch` with the
 * session cookie and an Origin - and what it is supposed to do to the
 * extension is checked with a real signed request from a real install key, so
 * "the extension's next call gets invalid_token" is observed, not assumed.
 */
import { describe, expect, it } from 'vitest';

import { generateSigningKeyPair, HostedAnalysisClient, HostedApiError } from '@squiggle/shared';

import {
  accountRequest,
  CHROME_ORIGIN,
  claim,
  exportJwk,
  magicLogin,
  makeTestEnv,
  postStripeEvent,
  requestMagicLink,
  signedRequest,
  T0,
  type TestEnv,
} from './helpers';

interface WebCall {
  method?: string;
  cookie?: string | null;
  /** `null` sends no Origin header at all. */
  origin?: string | null;
  body?: unknown;
  ip?: string;
}

function web(env: TestEnv, path: string, opts: WebCall = {}): Promise<Response> {
  const method = opts.method ?? 'GET';
  const headers: Record<string, string> = {};
  if (opts.origin !== null) headers.origin = opts.origin ?? env.webAppOrigin;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.ip) headers['cf-connecting-ip'] = opts.ip;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return env.handler(
    new Request(`${env.webAppOrigin}${path}`, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    }),
  );
}

/** Log in and connect one install, exactly as the bridge does. */
async function signedInWithInstall(env: TestEnv, email: string) {
  const login = await magicLogin(env, email);
  const key = await generateSigningKeyPair();
  const res = await claim(env, login.sessionCookie, await exportJwk(key));
  expect(res.status).toBe(200);
  const { token, keyId } = (await res.json()) as { token: string; keyId: string };
  return { ...login, key, token, keyId };
}

async function signedAccountStatus(env: TestEnv, install: { key: CryptoKeyPair; token: string }): Promise<number> {
  const res = await env.handler(await accountRequest(env, install.key, install.token, { origin: CHROME_ORIGIN }));
  return res.status;
}

const change = (env: TestEnv, cookie: string, email: unknown, ip?: string) =>
  web(env, '/web/account/email', { method: 'POST', cookie, body: { email }, ip });
const confirm = (env: TestEnv, cookie: string, code: unknown) =>
  web(env, '/web/account/email/confirm', { method: 'POST', cookie, body: { code } });

const ACTIONS: Array<{ method: string; path: string; body?: unknown }> = [
  { method: 'GET', path: '/web/account/installs' },
  { method: 'POST', path: '/web/account/installs/revoke', body: { id: 'x' } },
  { method: 'POST', path: '/web/account/email', body: { email: 'new@example.com' } },
  { method: 'POST', path: '/web/account/email/confirm', body: { code: 'ABCD2345' } },
  { method: 'POST', path: '/web/account/delete', body: { confirm: true } },
];

describe('the gate on every account-data action', () => {
  for (const action of ACTIONS) {
    it(`${action.method} ${action.path} needs a session and an Origin`, async () => {
      const env = makeTestEnv();
      const { sessionCookie } = await magicLogin(env, 'marie@example.com');

      const noSession = await web(env, action.path, action);
      expect(noSession.status).toBe(401);
      expect((await noSession.json()).error).toBe('invalid_session');

      const noOrigin = await web(env, action.path, { ...action, cookie: sessionCookie, origin: null });
      expect(noOrigin.status).toBe(403);
      expect((await noOrigin.json()).error).toBe('origin_not_allowed');

      const foreign = await web(env, action.path, { ...action, cookie: sessionCookie, origin: 'https://evil.example' });
      expect(foreign.status).toBe(403);
    });
  }

  it('an install signature cannot reach them: they live under /web, not /v1', async () => {
    const env = makeTestEnv();
    const install = await signedInWithInstall(env, 'marie@example.com');
    const res = await env.handler(
      await signedRequest(env, {
        key: install.key,
        token: install.token,
        path: '/v1/account/delete',
        method: 'POST',
        body: JSON.stringify({ confirm: true }),
        origin: CHROME_ORIGIN,
      }),
    );
    expect(res.status).toBe(404);
    expect(await env.db.getUserById(install.user.id)).not.toBeNull();
  });
});

describe('installs: list and revoke', () => {
  it('lists the live installs, newest first', async () => {
    const env = makeTestEnv();
    const first = await signedInWithInstall(env, 'marie@example.com');
    env.clock.advance(60_000);
    const key2 = await generateSigningKeyPair();
    const second = (await (await claim(env, first.sessionCookie, await exportJwk(key2))).json()) as { keyId: string };

    const res = await web(env, '/web/account/installs', { cookie: first.sessionCookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { installs: Array<{ id: string; createdAt: number }> };
    expect(body.installs.map((i) => i.id)).toEqual([second.keyId, first.keyId]);
    expect(body.installs[1].createdAt).toBe(T0);
  });

  it('revoking an install makes its next signed call fail with invalid_token', async () => {
    const env = makeTestEnv();
    const install = await signedInWithInstall(env, 'marie@example.com');
    expect(await signedAccountStatus(env, install)).toBe(200);

    const res = await web(env, '/web/account/installs/revoke', {
      method: 'POST',
      cookie: install.sessionCookie,
      body: { id: install.keyId },
    });
    expect(res.status).toBe(200);

    const after = await env.handler(await accountRequest(env, install.key, install.token, { origin: CHROME_ORIGIN }));
    expect(after.status).toBe(401);
    expect((await after.json()).error).toBe('invalid_token');

    const list = await web(env, '/web/account/installs', { cookie: install.sessionCookie });
    expect(((await list.json()) as { installs: unknown[] }).installs).toEqual([]);
  });

  it('leaves the other installs and the web session alone', async () => {
    const env = makeTestEnv();
    const a = await signedInWithInstall(env, 'marie@example.com');
    const keyB = await generateSigningKeyPair();
    const b = (await (await claim(env, a.sessionCookie, await exportJwk(keyB))).json()) as { token: string };

    await web(env, '/web/account/installs/revoke', { method: 'POST', cookie: a.sessionCookie, body: { id: a.keyId } });

    expect(await signedAccountStatus(env, { key: keyB, token: b.token })).toBe(200);
    expect((await web(env, '/web/account', { cookie: a.sessionCookie })).status).toBe(200);
  });

  it('answers not_found for an unknown id, an already revoked one, and another account\'s', async () => {
    const env = makeTestEnv();
    const marie = await signedInWithInstall(env, 'marie@example.com');
    const paul = await signedInWithInstall(env, 'paul@example.com');
    const revoke = (cookie: string, id: unknown) =>
      web(env, '/web/account/installs/revoke', { method: 'POST', cookie, body: { id } });

    expect((await revoke(marie.sessionCookie, 'nope')).status).toBe(404);
    // Paul cannot revoke Marie's install, and is told nothing about it.
    const foreign = await revoke(paul.sessionCookie, marie.keyId);
    expect(foreign.status).toBe(404);
    expect(await signedAccountStatus(env, marie)).toBe(200);

    expect((await revoke(marie.sessionCookie, marie.keyId)).status).toBe(200);
    expect((await revoke(marie.sessionCookie, marie.keyId)).status).toBe(404);
    expect((await revoke(marie.sessionCookie, 42)).status).toBe(400);
  });

  it('does not list an install whose token has expired', async () => {
    const env = makeTestEnv();
    const install = await signedInWithInstall(env, 'marie@example.com');
    env.clock.advance(91 * 24 * 3600_000);
    const res = await web(env, '/web/account/installs', { cookie: (await magicLogin(env, 'marie@example.com')).sessionCookie });
    expect(((await res.json()) as { installs: unknown[] }).installs).toEqual([]);
    expect(install.keyId).toBeTruthy();
  });
});

describe('email change', () => {
  it('sends the code to the NEW address and switches only once it is typed back', async () => {
    const env = makeTestEnv();
    const { sessionCookie, user } = await magicLogin(env, 'marie@example.com');

    const res = await change(env, sessionCookie, ' New@Example.com ');
    expect(res.status).toBe(200);
    expect(env.email.sent.at(-1)?.to).toBe('new@example.com');
    // Nothing has moved yet.
    expect((await env.db.getUserById(user.id))?.email).toBe('marie@example.com');

    const code = env.email.lastCode() as string;
    const done = await confirm(env, sessionCookie, code);
    expect(done.status).toBe(200);
    expect(((await done.json()) as { email: string }).email).toBe('new@example.com');

    const account = (await (await web(env, '/web/account', { cookie: sessionCookie })).json()) as { email: string };
    expect(account.email).toBe('new@example.com');
    const row = await env.db.getUserById(user.id);
    expect(row?.emailVerified).toBe(true);
    // Same account: the id, and therefore the plan and usage, did not change.
    expect((await env.db.getUserByEmail('new@example.com'))?.id).toBe(user.id);
    expect(await env.db.getUserByEmail('marie@example.com')).toBeNull();
  });

  it('refuses an invalid address and sends nothing', async () => {
    const env = makeTestEnv();
    const { sessionCookie } = await magicLogin(env, 'marie@example.com');
    const before = env.email.sent.length;
    for (const bad of ['', 'not-an-address', 42, null]) {
      const res = await change(env, sessionCookie, bad);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('invalid_email');
    }
    expect(env.email.sent).toHaveLength(before);
  });

  it('answers the same for an address another account holds, and sends nothing', async () => {
    const env = makeTestEnv();
    await magicLogin(env, 'paul@example.com');
    const { sessionCookie } = await magicLogin(env, 'marie@example.com');
    const before = env.email.sent.length;

    const res = await change(env, sessionCookie, 'paul@example.com');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, sent: true });
    expect(env.email.sent).toHaveLength(before);
  });

  it('refuses a change code as a login code, and keeps it usable for the change', async () => {
    const env = makeTestEnv();
    const { sessionCookie, user } = await magicLogin(env, 'marie@example.com');
    await change(env, sessionCookie, 'new@example.com');
    const code = env.email.lastCode() as string;

    const asLogin = await env.handler(
      new Request(`${env.webAppOrigin}/auth/magic-link/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: env.webAppOrigin },
        body: JSON.stringify({ code }),
      }),
    );
    expect(asLogin.status).toBe(400);
    expect((await asLogin.json()).error).toBe('invalid_code');
    // Nobody was created for the new address by that attempt.
    expect(await env.db.getUserByEmail('new@example.com')).toBeNull();

    expect((await confirm(env, sessionCookie, code)).status).toBe(200);
    expect((await env.db.getUserById(user.id))?.email).toBe('new@example.com');
  });

  it('refuses a login code, an unknown code, another account\'s code, an expired one and a reused one', async () => {
    const env = makeTestEnv();
    const marie = await magicLogin(env, 'marie@example.com');
    const paul = await magicLogin(env, 'paul@example.com');

    // A plain login code.
    await requestMagicLink(env, 'marie@example.com');
    const loginCode = env.email.lastCode() as string;
    expect((await confirm(env, marie.sessionCookie, loginCode)).status).toBe(400);
    expect((await confirm(env, marie.sessionCookie, 'ZZZZ2222')).status).toBe(400);
    expect((await confirm(env, marie.sessionCookie, undefined)).status).toBe(400);

    // Paul's pending change, confirmed from Marie's session.
    await change(env, paul.sessionCookie, 'paul-new@example.com');
    const paulCode = env.email.lastCode() as string;
    const stolen = await confirm(env, marie.sessionCookie, paulCode);
    expect(stolen.status).toBe(400);
    expect((await stolen.json()).error).toBe('invalid_code');
    expect((await env.db.getUserById(marie.user.id))?.email).toBe('marie@example.com');

    // Reuse.
    expect((await confirm(env, paul.sessionCookie, paulCode)).status).toBe(200);
    const again = await confirm(env, paul.sessionCookie, paulCode);
    expect(again.status).toBe(400);
    expect((await again.json()).error).toBe('link_already_used');

    // Expiry.
    await change(env, marie.sessionCookie, 'marie-new@example.com');
    const expiring = env.email.lastCode() as string;
    env.clock.advance(11 * 60_000);
    const late = await confirm(env, marie.sessionCookie, expiring);
    expect(late.status).toBe(410);
    expect((await late.json()).error).toBe('expired_link');
  });

  it('refuses to take an address that was registered between the request and the confirmation', async () => {
    const env = makeTestEnv();
    const { sessionCookie, user } = await magicLogin(env, 'marie@example.com');
    await change(env, sessionCookie, 'new@example.com');
    const code = env.email.lastCode() as string;

    await magicLogin(env, 'new@example.com'); // someone signs up with it first

    const res = await confirm(env, sessionCookie, code);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('email_taken');
    expect((await env.db.getUserById(user.id))?.email).toBe('marie@example.com');
  });

  it('limits an account to three change requests an hour', async () => {
    const env = makeTestEnv();
    const { sessionCookie } = await magicLogin(env, 'marie@example.com');
    for (const n of [1, 2, 3]) {
      expect((await change(env, sessionCookie, `new${n}@example.com`)).status).toBe(200);
    }
    const res = await change(env, sessionCookie, 'new4@example.com');
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe('rate_limited');
  });

  it('keeps the address on the Stripe receipts in step', async () => {
    const env = makeTestEnv();
    const { sessionCookie, user } = await magicLogin(env, 'marie@example.com');
    await postStripeEvent(env, {
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: { object: { customer: 'cus_test_1', subscription: 'sub_test_1', metadata: { user_id: user.id } } },
    });

    await change(env, sessionCookie, 'new@example.com');
    expect((await confirm(env, sessionCookie, env.email.lastCode())).status).toBe(200);

    const call = env.stripe.calls.find((c) => c.path === '/customers/cus_test_1');
    expect(call?.method).toBe('POST');
    expect(call?.form.email).toBe('new@example.com');
  });

  it('still changes the address when Stripe is unreachable', async () => {
    const env = makeTestEnv();
    const { sessionCookie, user } = await magicLogin(env, 'marie@example.com');
    await postStripeEvent(env, {
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: { object: { customer: 'cus_test_1', subscription: 'sub_test_1', metadata: { user_id: user.id } } },
    });
    await change(env, sessionCookie, 'new@example.com');
    env.stripe.failNext = true;
    expect((await confirm(env, sessionCookie, env.email.lastCode())).status).toBe(200);
    expect((await env.db.getUserById(user.id))?.email).toBe('new@example.com');
  });
});

describe('account deletion', () => {
  const remove = (env: TestEnv, cookie: string, body: unknown = { confirm: true }) =>
    web(env, '/web/account/delete', { method: 'POST', cookie, body });

  it('does nothing without the explicit confirmation', async () => {
    const env = makeTestEnv();
    const { sessionCookie, user } = await magicLogin(env, 'marie@example.com');
    for (const body of [{}, { confirm: 'true' }, { confirm: false }]) {
      const res = await remove(env, sessionCookie, body);
      expect(res.status).toBe(400);
    }
    expect(await env.db.getUserById(user.id)).not.toBeNull();
  });

  it('leaves no row that references the user, and ends the session', async () => {
    const env = makeTestEnv();
    const install = await signedInWithInstall(env, 'marie@example.com');
    const { user } = install;

    // One of everything the account owns.
    await env.db.recordAnalysis({ userId: user.id, now: env.clock.now() });
    await env.db.createAnalysisRun({ userId: user.id, urlHash: 'h', state: '{}', now: env.clock.now(), ttlMs: 3600_000 });
    await env.db.createBridgeCode({
      codeHash: 'bridge',
      userId: user.id,
      sessionHash: 'session',
      publicKeyJwk: '{}',
      now: env.clock.now(),
      ttlMs: 600_000,
    });
    await signedAccountStatus(env, install); // leaves a replay nonce on the install's key
    await change(env, install.sessionCookie, 'pending@example.com'); // a pending change code
    expect(env.db.countRowsFor(user.id, 'marie@example.com')).toBeGreaterThan(8);

    const res = await remove(env, install.sessionCookie);
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toMatch(/squiggle_session=;.*Max-Age=0/);

    expect(env.db.countRowsFor(user.id, 'marie@example.com')).toBe(0);
    expect(await env.db.getUserById(user.id)).toBeNull();
    expect(await env.db.getUserByEmail('marie@example.com')).toBeNull();
    expect(await env.db.countUsageLog(user.id)).toBe(0);
    expect(await env.db.sumUsage(user.id)).toBe(0);
  });

  it('gives the extension invalid_token on its next signed call, and the browser invalid_session', async () => {
    const env = makeTestEnv();
    const install = await signedInWithInstall(env, 'marie@example.com');
    expect((await remove(env, install.sessionCookie)).status).toBe(200);

    const signed = await env.handler(await accountRequest(env, install.key, install.token, { origin: CHROME_ORIGIN }));
    expect(signed.status).toBe(401);
    expect((await signed.json()).error).toBe('invalid_token');

    const browser = await web(env, '/web/account', { cookie: install.sessionCookie });
    expect(browser.status).toBe(401);
    expect((await browser.json()).error).toBe('invalid_session');
  });

  it('is what the extension\'s own client sees: HostedApiError invalid_token', async () => {
    const env = makeTestEnv({ now: Date.now() });
    const install = await signedInWithInstall(env, 'marie@example.com');
    const client = new HostedAnalysisClient({
      baseUrl: env.webAppOrigin,
      token: install.token,
      privateKey: install.key.privateKey,
      fetchImpl: ((url: RequestInfo | URL, init?: RequestInit) =>
        env.handler(new Request(url as string, init))) as typeof fetch,
    });
    const article = {
      url: 'https://presse.example/a',
      blocks: [{ id: 'b1', type: 'paragraph' as const, text: 'Le chomage a baisse.', charStart: 0 }],
    };

    await web(env, '/web/account/installs/revoke', { method: 'POST', cookie: install.sessionCookie, body: { id: install.keyId } });
    await expect(client.analyze(article)).rejects.toMatchObject({ code: 'invalid_token' });
    await expect(client.analyze(article)).rejects.toBeInstanceOf(HostedApiError);
  });

  it('lets the same address start over as a new, empty account', async () => {
    const env = makeTestEnv();
    const first = await magicLogin(env, 'marie@example.com');
    await env.db.recordAnalysis({ userId: first.user.id, now: env.clock.now() });
    await remove(env, first.sessionCookie);

    const second = await magicLogin(env, 'marie@example.com');
    expect(second.user.id).not.toBe(first.user.id);
    expect(await env.db.sumUsage(second.user.id)).toBe(0);
  });

  it('cancels a live subscription at Stripe before it erases anything', async () => {
    const env = makeTestEnv();
    const { sessionCookie, user } = await magicLogin(env, 'marie@example.com');
    await postStripeEvent(env, {
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: { object: { customer: 'cus_test_1', subscription: 'sub_test_1', metadata: { user_id: user.id } } },
    });
    expect((await env.db.getUserById(user.id))?.stripeSubId).toBe('sub_test_1');

    expect((await remove(env, sessionCookie)).status).toBe(200);

    const call = env.stripe.calls.find((c) => c.path === '/subscriptions/sub_test_1');
    expect(call?.method).toBe('DELETE');
    expect(await env.db.getUserById(user.id)).toBeNull();

    // The cancellation Stripe now reports concerns an account that is gone:
    // acknowledged, applied to nothing, and it does not resurrect anything.
    const hook = await postStripeEvent(env, {
      id: 'evt_2',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_test_1', customer: 'cus_test_1', metadata: { user_id: user.id } } },
    });
    expect(hook.status).toBe(200);
    expect(await hook.json()).toMatchObject({ applied: false });
    expect(await env.db.getUserById(user.id)).toBeNull();
  });

  it('keeps the account when Stripe refuses, so the reader can try again', async () => {
    const env = makeTestEnv();
    const { sessionCookie, user } = await magicLogin(env, 'marie@example.com');
    await postStripeEvent(env, {
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: { object: { customer: 'cus_test_1', subscription: 'sub_test_1', metadata: { user_id: user.id } } },
    });

    env.stripe.failNext = true;
    const res = await remove(env, sessionCookie);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('billing_unavailable');
    expect(await env.db.getUserById(user.id)).not.toBeNull();
    expect((await web(env, '/web/account', { cookie: sessionCookie })).status).toBe(200);

    expect((await remove(env, sessionCookie)).status).toBe(200);
    expect(await env.db.getUserById(user.id)).toBeNull();
  });

  it('refuses rather than orphan a subscription when billing is not configured', async () => {
    const env = makeTestEnv();
    const { sessionCookie, user } = await magicLogin(env, 'marie@example.com');
    await postStripeEvent(env, {
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: { object: { customer: 'cus_test_1', subscription: 'sub_test_1', metadata: { user_id: user.id } } },
    });
    env.services.stripe = undefined;

    const res = await remove(env, sessionCookie);
    expect(res.status).toBe(502);
    expect(await env.db.getUserById(user.id)).not.toBeNull();
  });

  it('treats a subscription Stripe no longer knows as already ended', async () => {
    const env = makeTestEnv();
    const { sessionCookie, user } = await magicLogin(env, 'marie@example.com');
    await postStripeEvent(env, {
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: { object: { customer: 'cus_test_1', subscription: 'sub_gone', metadata: { user_id: user.id } } },
    });
    (env.services.stripe as { fetchImpl: typeof fetch }).fetchImpl = (async () =>
      Response.json({ error: { code: 'resource_missing' } }, { status: 404 })) as unknown as typeof fetch;

    expect((await remove(env, sessionCookie)).status).toBe(200);
    expect(await env.db.getUserById(user.id)).toBeNull();
  });
});
