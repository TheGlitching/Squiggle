import { describe, expect, it } from 'vitest';

import { GOOGLE_AUTH_URL } from '../src/auth/google';
import { base64urlEncode } from '@squiggle/shared';

import { CHROME_ORIGIN, makeFakeGoogle, makeTestEnv, T0, type TestEnv } from './helpers';

async function startOAuth(env: TestEnv): Promise<{ url: URL; state: string; nonce: string; challenge: string }> {
  const res = await env.handler(new Request(`${env.webAppOrigin}/auth/google`));
  expect(res.status).toBe(302);
  const url = new URL(res.headers.get('location') as string);
  return {
    url,
    state: url.searchParams.get('state')!,
    nonce: url.searchParams.get('nonce')!,
    challenge: url.searchParams.get('code_challenge')!,
  };
}

async function callback(env: TestEnv, params: string): Promise<Response> {
  return env.handler(new Request(`${env.webAppOrigin}/auth/google/callback${params}`));
}

describe('GET /auth/google', () => {
  it('redirects to Google with PKCE S256, a state, and a nonce bound to a pending record', async () => {
    const env = makeTestEnv();
    const { url, state, nonce, challenge } = await startOAuth(env);

    expect(url.origin + url.pathname).toBe(GOOGLE_AUTH_URL);
    expect(url.searchParams.get('client_id')).toBe('test-google-client-id');
    expect(url.searchParams.get('redirect_uri')).toBe(`${env.webAppOrigin}/auth/google/callback`);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(state).toBeTruthy();
    expect(nonce).toBeTruthy();
    expect(challenge).toBeTruthy();

    const pending = await env.db.findOAuthPending(state);
    expect(pending).not.toBeNull();
    expect(pending!.nonce).toBe(nonce);
    expect(pending!.redirectUri).toBe(`${env.webAppOrigin}/auth/google/callback`);
    expect(pending!.expiresAt).toBe(T0 + 10 * 60 * 1000);
    // The challenge must be S256 of the stored verifier (PKCE, verified again at exchange).
    const digest = new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pending!.codeVerifier)),
    );
    expect(base64urlEncode(digest)).toBe(challenge);
  });
});

describe('GET /auth/google/callback', () => {
  async function happyPath() {
    const fake = await makeFakeGoogle('test-google-client-id');
    const env2 = makeTestEnv({ fetchImpl: fake.fetchImpl });
    const started = await startOAuth(env2);
    fake.state.nonce = started.nonce;
    fake.state.expectChallenge = started.challenge;
    fake.state.nowMs = env2.clock.now();
    const res = await callback(env2, `?code=auth-code-123&state=${encodeURIComponent(started.state)}`);
    return { res, fake, env2 };
  }

  it('exchanges the code (PKCE-checked), verifies the JOSE ID token, creates the user, and opens a session', async () => {
    const { res, fake, env2 } = await happyPath();

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`${env2.webAppOrigin}/account`);
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toContain('squiggle_session=');

    const user = await env2.db.getUserByEmail('marie@gmail.com');
    expect(user).not.toBeNull();
    expect(user!.googleSub).toBe(fake.sub);
    expect(user!.emailVerified).toBe(true);

    // PKCE: the token endpoint saw a verifier whose S256 equals the challenge.
    expect(fake.state.seenVerifiers).toHaveLength(1);
    expect(fake.state.seenRedirectUris[0]).toBe(`${env2.webAppOrigin}/auth/google/callback`);
    // The session is stored only as a hash.
    const [cookieName, token] = (setCookie as string).split(';')[0].split('=');
    expect(cookieName).toBe('squiggle_session');
    const { sha256Hex } = await import('@squiggle/shared');
    expect(await env2.db.findSessionByHash(await sha256Hex(token))).not.toBeNull();
  });

  it('links a Google login to an existing account by email', async () => {
    const { magicLogin } = await import('./helpers');
    const fake = await makeFakeGoogle('test-google-client-id');
    const env = makeTestEnv({ fetchImpl: fake.fetchImpl });
    const { user: preExisting } = await magicLogin(env, 'marie@gmail.com');

    const started = await startOAuth(env);
    fake.state.nonce = started.nonce;
    fake.state.nowMs = env.clock.now();
    const res = await callback(env, `?code=ok&state=${encodeURIComponent(started.state)}`);
    expect(res.status).toBe(302);

    const user = await env.db.getUserByEmail('marie@gmail.com');
    expect(user!.id).toBe(preExisting.id);
    expect(user!.googleSub).toBe(fake.sub);
  });

  it('rejects an unknown or replayed state, and an expired one', async () => {
    const fake = await makeFakeGoogle('test-google-client-id');
    const env = makeTestEnv({ fetchImpl: fake.fetchImpl });

    const unknown = await callback(env, '?code=ok&state=nobody');
    expect(unknown.status).toBe(400);
    expect((await unknown.json()).error).toBe('invalid_state');

    const started = await startOAuth(env);
    fake.state.nonce = started.nonce;
    fake.state.nowMs = env.clock.now();
    const first = await callback(env, `?code=ok&state=${encodeURIComponent(started.state)}`);
    expect(first.status).toBe(302);
    const replay = await callback(env, `?code=ok&state=${encodeURIComponent(started.state)}`);
    expect(replay.status).toBe(400);
    expect((await replay.json()).error).toBe('invalid_state');

    const started2 = await startOAuth(env);
    fake.state.nonce = started2.nonce;
    env.clock.advance(11 * 60 * 1000);
    const expired = await callback(env, `?code=ok&state=${encodeURIComponent(started2.state)}`);
    expect(expired.status).toBe(400);
    expect((await expired.json()).error).toBe('invalid_state');
  });

  it('fails closed when the token endpoint rejects, JWKS is unreachable, or the nonce does not match', async () => {
    const fake = await makeFakeGoogle('test-google-client-id');
    const env = makeTestEnv({ fetchImpl: fake.fetchImpl });
    const started = await startOAuth(env);
    fake.state.nonce = started.nonce;
    fake.state.expectChallenge = started.challenge;
    fake.state.nowMs = env.clock.now();

    fake.state.failTokens = true;
    let res = await callback(env, `?code=ok&state=${encodeURIComponent(started.state)}`);
    fake.state.failTokens = false;

    const started2 = await startOAuth(env);
    fake.state.nonce = started2.nonce;
    fake.state.expectChallenge = started2.challenge;
    fake.state.failJwks = true;
    res = await callback(env, `?code=ok&state=${encodeURIComponent(started2.state)}`);
    fake.state.failJwks = false;
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('oauth_failed');

    const started3 = await startOAuth(env);
    fake.state.nonce = started3.nonce;
    fake.state.expectChallenge = started3.challenge;
    fake.state.wrongNonce = true;
    res = await callback(env, `?code=ok&state=${encodeURIComponent(started3.state)}`);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('oauth_failed');
  });

  it('sends CORS headers to a store origin', async () => {
    const env = makeTestEnv();
    const res = await env.handler(
      new Request(`${env.webAppOrigin}/auth/google`, { headers: { origin: CHROME_ORIGIN } }),
    );
    expect(res.headers.get('access-control-allow-origin')).toBe(CHROME_ORIGIN);
  });
});
