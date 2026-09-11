/**
 * The manual bridge (Firefox fallback): issue an 8-character code to a
 * signed-in session, redeem it once from the extension for a token.
 *
 * The end-to-end assertion is at the bottom: a token obtained this way really
 * signs a `/v1/account` request, so the code path cannot be a dead end that
 * happens to return JSON.
 */
import { describe, expect, it } from 'vitest';

import { exportP256Jwk, generateSigningKeyPair } from '@squiggle/shared';

import {
  accountRequest,
  CHROME_ORIGIN,
  magicLogin,
  makeTestEnv,
  type TestEnv,
} from './helpers';
import { BRIDGE_CODE_LENGTH, BRIDGE_CODE_TTL_MS } from '../src/auth/bridge';

async function issue(
  env: TestEnv,
  cookie: string,
  publicKeyJwk: unknown,
  opts: { origin?: string | null; body?: boolean } = {},
): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.origin !== null) headers.origin = opts.origin ?? env.webAppOrigin;
  if (opts.body !== false) headers.cookie = cookie;
  return env.handler(
    new Request(`${env.webAppOrigin}/web/bridge/code`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ publicKeyJwk }),
    }),
  );
}

async function redeem(
  env: TestEnv,
  code: string,
  opts: { cookie?: string; origin?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.origin) headers.origin = opts.origin;
  return env.handler(
    new Request(`${env.webAppOrigin}/auth/bridge/redeem`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ code }),
    }),
  );
}

async function freshJwk() {
  return exportP256Jwk((await generateSigningKeyPair()).publicKey);
}

describe('POST /web/bridge/code', () => {
  it('issues an 8-character code for a signed-in session', async () => {
    const env = makeTestEnv();
    const { sessionCookie } = await magicLogin(env, 'marie@example.com');
    const res = await issue(env, sessionCookie, await freshJwk());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { code: string; expiresAt: number };
    expect(body.code).toHaveLength(BRIDGE_CODE_LENGTH);
    expect(body.code).toMatch(/^[A-Z2-9]+$/);
    expect(body.expiresAt).toBe(env.clock.now() + BRIDGE_CODE_TTL_MS);
  });

  it('refuses without a session', async () => {
    const env = makeTestEnv();
    const res = await issue(env, 'squiggle_session=not-a-session', await freshJwk());
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('invalid_session');
  });

  it('refuses without an Origin, even with a valid session', async () => {
    const env = makeTestEnv();
    const { sessionCookie } = await magicLogin(env, 'marie@example.com');
    const res = await issue(env, sessionCookie, await freshJwk(), { origin: null });
    expect(res.status).toBe(403);
  });

  it('refuses a key that is not a P-256 JWK', async () => {
    const env = makeTestEnv();
    const { sessionCookie } = await magicLogin(env, 'marie@example.com');
    const res = await issue(env, sessionCookie, { kty: 'RSA' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_key');
  });
});

describe('POST /auth/bridge/redeem', () => {
  it('redeems a code once and returns a usable token', async () => {
    const env = makeTestEnv();
    const key = await generateSigningKeyPair();
    const { sessionCookie } = await magicLogin(env, 'marie@example.com');
    const issued = (await (await issue(env, sessionCookie, await exportP256Jwk(key.publicKey))).json()) as {
      code: string;
    };

    const res = await redeem(env, issued.code);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; keyId: string; userId: string; publicKeyJwk: string };
    expect(body.token).toBeTruthy();
    expect(body.keyId).toBeTruthy();
    expect(JSON.parse(body.publicKeyJwk).kty).toBe('EC');

    // The minted token really signs a request against the install's key.
    const account = await env.handler(await accountRequest(env, key, body.token, { origin: CHROME_ORIGIN }));
    expect(account.status).toBe(200);
    expect(((await account.json()) as { email: string }).email).toBe('marie@example.com');
  });

  it('is single-use', async () => {
    const env = makeTestEnv();
    const { sessionCookie } = await magicLogin(env, 'marie@example.com');
    const issued = (await (await issue(env, sessionCookie, await freshJwk())).json()) as { code: string };

    expect((await redeem(env, issued.code)).status).toBe(200);
    const second = await redeem(env, issued.code);
    expect(second.status).toBe(400);
    expect((await second.json()).error).toBe('link_already_used');
  });

  it('refuses an expired code', async () => {
    const env = makeTestEnv();
    const { sessionCookie } = await magicLogin(env, 'marie@example.com');
    const issued = (await (await issue(env, sessionCookie, await freshJwk())).json()) as { code: string };

    env.clock.advance(BRIDGE_CODE_TTL_MS + 1000);
    const res = await redeem(env, issued.code);
    expect(res.status).toBe(410);
    expect((await res.json()).error).toBe('expired_link');
  });

  it('refuses an unknown code', async () => {
    const env = makeTestEnv();
    const res = await redeem(env, 'ABCDEFGH');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_code');
  });

  it('refuses a valid-looking code from a different case/whitespace only if unknown', async () => {
    const env = makeTestEnv();
    const { sessionCookie } = await magicLogin(env, 'marie@example.com');
    const issued = (await (await issue(env, sessionCookie, await freshJwk())).json()) as { code: string };

    // Typing tolerances: lowercase and a stray space still redeem.
    const res = await redeem(env, ` ${issued.code.toLowerCase()} `);
    expect(res.status).toBe(200);
  });

  it('refuses a redeem that carries a foreign session', async () => {
    const env = makeTestEnv();
    const { sessionCookie } = await magicLogin(env, 'marie@example.com');
    const { sessionCookie: otherCookie } = await magicLogin(env, 'paul@example.com');
    const issued = (await (await issue(env, sessionCookie, await freshJwk())).json()) as { code: string };

    const res = await redeem(env, issued.code, { cookie: otherCookie });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('invalid_session');
  });
});