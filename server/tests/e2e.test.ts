import { describe, expect, it } from 'vitest';

import { generateSigningKeyPair } from '@squiggle/shared';

import { extensionOriginsOf } from '../src/index';
import {
  accountRequest,
  claim,
  CHROME_ORIGIN,
  EDGE_ORIGIN,
  exportJwk,
  FIREFOX_ORIGIN,
  magicLogin,
  makeFakeGoogle,
  makeTestEnv,
  requestMagicLink,
} from './helpers';

/**
 * The whole product journey, end to end, over the real wire protocol:
 * a non-technical user receives a magic link, signs the web app in, the
 * extension claims a token bound to its own P-256 key, and then signs API
 * requests. Plus the Google path, and the abuse scenarios the design must
 * hold up against.
 */
describe('end to end', () => {
  it('magic link, web session, extension token, then a signed /v1/account', async () => {
    const env = makeTestEnv();

    // 1. The user asks for a login link.
    const reqRes = await requestMagicLink(env, 'marie@example.com', '203.0.113.7');
    expect(reqRes.status).toBe(200);

    // 2. She clicks the link (the web app verifies the code).
    const code = env.email.lastCode()!;
    const verify = await env.handler(
      new Request(`${env.webAppOrigin}/auth/magic-link/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: env.webAppOrigin },
        body: JSON.stringify({ code }),
      }),
    );
    const sessionCookie = verify.headers.get('set-cookie')!.split(';')[0];

    // 3. The extension generates its per-install keypair and claims a token.
    const key = await generateSigningKeyPair();
    const jwk = await exportJwk(key);
    const claimRes = await claim(env, sessionCookie, jwk);
    expect(claimRes.status).toBe(200);
    const { token } = (await claimRes.json()) as { token: string };

    // 4. Every analysis request from that install is signed by that key.
    const ok = await env.handler(await accountRequest(env, key, token, { origin: CHROME_ORIGIN }));
    expect(ok.status).toBe(200);

    // 5. A second install for the same user gets its own key + token.
    const key2 = await generateSigningKeyPair();
    const claim2 = await claim(env, sessionCookie, await exportJwk(key2));
    expect(claim2.status).toBe(200);
    const { token: token2 } = (await claim2.json()) as { token: string };
    const ok2 = await env.handler(await accountRequest(env, key2, token2));
    expect(ok2.status).toBe(200);

    // Cross-install use is impossible: token2 cannot be signed by install 1.
    const crossed = await env.handler(await accountRequest(env, key, token2));
    expect(crossed.status).toBe(401);
    expect((await crossed.json()).error).toBe('bad_signature');
  });

  it('Google login, claim, signed request (second path)', async () => {
    const fake = await makeFakeGoogle('test-google-client-id');
    const env = makeTestEnv({ fetchImpl: fake.fetchImpl });

    const start = await env.handler(new Request(`${env.webAppOrigin}/auth/google`));
    const startUrl = new URL(start.headers.get('location')!);
    const startedState = startUrl.searchParams.get('state')!;
    const startedNonce = startUrl.searchParams.get('nonce')!;
    const startedChallenge = startUrl.searchParams.get('code_challenge')!;
    fake.state.nonce = startedNonce;
    fake.state.expectChallenge = startedChallenge;
    fake.state.nowMs = env.clock.now();

    const cb = await env.handler(
      new Request(
        `${env.webAppOrigin}/auth/google/callback?code=auth-code-999&state=${encodeURIComponent(startedState)}`,
      ),
    );
    expect(cb.status).toBe(302);
    const sessionCookie = cb.headers.get('set-cookie')!.split(';')[0];

    const key = await generateSigningKeyPair();
    const claimRes = await claim(env, sessionCookie, await exportJwk(key));
    expect(claimRes.status).toBe(200);
    const { token } = (await claimRes.json()) as { token: string };

    const ok = await env.handler(await accountRequest(env, key, token, { origin: FIREFOX_ORIGIN }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).email).toBe('marie@gmail.com');
  });

  it('web sign-out revokes the session; extension tokens outlive it on purpose', async () => {
    const env = makeTestEnv();
    const { sessionCookie } = await magicLogin(env, 'marie@example.com');
    const key = await generateSigningKeyPair();
    const claimRes = await claim(env, sessionCookie, await exportJwk(key));
    const { token } = (await claimRes.json()) as { token: string };

    const before = await env.handler(await accountRequest(env, key, token));
    expect(before.status).toBe(200);

    const logout = await env.handler(
      new Request(`${env.webAppOrigin}/auth/logout`, {
        method: 'POST',
        headers: { cookie: sessionCookie, origin: env.webAppOrigin },
      }),
    );
    expect(logout.status).toBe(200);
    expect(logout.headers.get('set-cookie')).toContain('Max-Age=0');

    // The signed extension still works after the web sign-out (tokens are
    // independent of sessions); claiming with the dead session no longer works.
    const still = await env.handler(await accountRequest(env, key, token));
    expect(still.status).toBe(200);
    const noClaim = await claim(env, sessionCookie, await exportJwk(await generateSigningKeyPair()));
    expect(noClaim.status).toBe(401);
  });

  it('a stolen web session cannot sign API requests (sessions never sign)', async () => {
    const env = makeTestEnv();
    const { sessionCookie } = await magicLogin(env, 'marie@example.com');
    const req = new Request(`${env.webAppOrigin}/v1/account`, {
      headers: { cookie: sessionCookie },
    });
    const res = await env.handler(req);
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('invalid_token');
  });

  it('pins the Edge listing only once its origin is set', () => {
    const chrome = 'chrome-extension://chrome-id';
    expect(extensionOriginsOf({ EXTENSION_CHROME_ORIGIN: chrome })).toEqual([chrome]);
    expect(extensionOriginsOf({ EXTENSION_CHROME_ORIGIN: chrome, EXTENSION_EDGE_ORIGIN: '' })).toEqual([chrome]);
    expect(
      extensionOriginsOf({ EXTENSION_CHROME_ORIGIN: chrome, EXTENSION_EDGE_ORIGIN: 'chrome-extension://edge-id' }),
    ).toEqual([chrome, 'chrome-extension://edge-id']);
  });

  it('CORS is pinned to the web app and the Chrome and Edge listings, with no wildcard', async () => {
    const env = makeTestEnv();

    const fromWeb = await env.handler(
      new Request(`${env.webAppOrigin}/health`, { headers: { origin: env.webAppOrigin } }),
    );
    expect(fromWeb.headers.get('access-control-allow-origin')).toBe(env.webAppOrigin);

    const fromChrome = await env.handler(
      new Request(`${env.webAppOrigin}/health`, { headers: { origin: CHROME_ORIGIN } }),
    );
    expect(fromChrome.headers.get('access-control-allow-origin')).toBe(CHROME_ORIGIN);

    const fromEdge = await env.handler(
      new Request(`${env.webAppOrigin}/health`, { headers: { origin: EDGE_ORIGIN } }),
    );
    expect(fromEdge.headers.get('access-control-allow-origin')).toBe(EDGE_ORIGIN);

    // Another Chromium extension is not a listing of ours.
    const otherExtension = await env.handler(
      new Request(`${env.webAppOrigin}/health`, { headers: { origin: 'chrome-extension://another-id' } }),
    );
    expect(otherExtension.status).toBe(403);

    const fromElsewhere = await env.handler(
      new Request(`${env.webAppOrigin}/health`, { headers: { origin: 'https://evil.example' } }),
    );
    expect(fromElsewhere.status).toBe(403);
    expect(fromElsewhere.headers.get('access-control-allow-origin')).toBeNull();

    // Non-browser callers (no Origin) get no CORS headers and full access.
    const noOrigin = await env.handler(new Request(`${env.webAppOrigin}/health`));
    expect(noOrigin.status).toBe(200);
    expect(noOrigin.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('a Firefox install reaches the extension endpoints, and nothing that rides a cookie', async () => {
    const env = makeTestEnv();
    const { sessionCookie } = await magicLogin(env, 'marie@example.com');
    const key = await generateSigningKeyPair();
    const { token } = (await (await claim(env, sessionCookie, await exportJwk(key))).json()) as { token: string };
    const firefox = { origin: FIREFOX_ORIGIN, 'sec-fetch-site': 'cross-site' };

    // What Firefox 159 sends from an MV3 background or sidebar page: a preflight
    // for the signing headers, then the call, both from moz-extension://<uuid>.
    const preflight = await env.handler(
      new Request(`${env.webAppOrigin}/v1/account`, { method: 'OPTIONS', headers: firefox }),
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe(FIREFOX_ORIGIN);
    // Answered without credentials: the signature authenticates, never a cookie.
    expect(preflight.headers.get('access-control-allow-credentials')).toBeNull();

    const account = await env.handler(await accountRequest(env, key, token, { origin: FIREFOX_ORIGIN }));
    expect(account.status).toBe(200);
    expect(account.headers.get('access-control-allow-origin')).toBe(FIREFOX_ORIGIN);

    const redeem = await env.handler(
      new Request(`${env.webAppOrigin}/auth/bridge/redeem`, {
        method: 'POST',
        headers: { ...firefox, 'content-type': 'application/json' },
        body: JSON.stringify({ code: 'ABCDEFGH' }),
      }),
    );
    expect((await redeem.json()).error).toBe('invalid_code');
    expect(redeem.headers.get('access-control-allow-origin')).toBe(FIREFOX_ORIGIN);

    // The cookie-authenticated surface stays closed to it: any other installed
    // Firefox extension has an origin of exactly this shape.
    for (const [method, path] of [
      ['POST', '/auth/claim'],
      ['GET', '/web/account'],
      ['POST', '/auth/logout'],
      ['GET', '/health'],
    ]) {
      const res = await env.handler(
        new Request(`${env.webAppOrigin}${path}`, { method, headers: { ...firefox, cookie: sessionCookie } }),
      );
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(res.headers.get('access-control-allow-origin'), `${method} ${path}`).toBeNull();
    }

    // Only the exact shape Firefox produces; a web page cannot have it at all.
    for (const lookalike of [
      'moz-extension://evil.example',
      `${FIREFOX_ORIGIN}.evil.example`,
      FIREFOX_ORIGIN.toUpperCase(),
      'https://0b1e5c3a-7d2f-4e8a-9c61-5f3a2d4b8e17.example',
    ]) {
      const res = await env.handler(await accountRequest(env, key, token, { origin: lookalike }));
      expect(res.status, lookalike).toBe(403);
    }
  });
});
