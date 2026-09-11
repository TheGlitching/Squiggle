import { describe, expect, it } from 'vitest';

import { generateSigningKeyPair } from '@squiggle/shared';

import {
  accountRequest,
  claim,
  CHROME_ORIGIN,
  exportJwk,
  makeTestEnv,
  magicLogin,
  signedRequest,
  T0,
  type TestEnv,
} from './helpers';

async function issuedInstall(env: TestEnv) {
  const key = await generateSigningKeyPair();
  const { sessionCookie } = await magicLogin(env, 'marie@example.com');
  const jwk = await exportJwk(key);
  const res = await claim(env, sessionCookie, jwk);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { token: string };
  return { key, token: body.token };
}

describe('signed /v1 requests', () => {
  it('accepts a correctly signed request from the bound install', async () => {
    const env = makeTestEnv();
    const { key, token } = await issuedInstall(env);
    const res = await env.handler(await accountRequest(env, key, token, { origin: CHROME_ORIGIN }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; id: string; email: string; plan: string };
    expect(body.ok).toBe(true);
    expect(body.email).toBe('marie@example.com');
    // A fresh account is on the trial (3 analyses); see billing/quota.ts.
    expect(body.plan).toBe('trial');
    // CORS is pinned, not wildcarded.
    expect(res.headers.get('access-control-allow-origin')).toBe(CHROME_ORIGIN);
  });

  it('rejects requests signed by a different key (stolen token, wrong install)', async () => {
    const env = makeTestEnv();
    const { token } = await issuedInstall(env);
    const impostor = await generateSigningKeyPair();
    const res = await env.handler(await accountRequest(env, impostor, token));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('bad_signature');
  });

  it('rejects a request that differs from what was signed (tampered path)', async () => {
    const env = makeTestEnv();
    const { key, token } = await issuedInstall(env);
    // Sign /v1/account, then request /v1/account?x=1: the canonical string
    // (path including the query) no longer matches the signature.
    const res = await env.handler(
      await signedRequest(env, { key, token, path: '/v1/account?x=1', signPathOverride: '/v1/account' }),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('bad_signature');
  });

  it('rejects stale and future-dated timestamps outside the ±300s window', async () => {
    const env = makeTestEnv();
    const { key, token } = await issuedInstall(env);

    const stale = await env.handler(await accountRequest(env, key, token, { tsOffsetSec: -301 }));
    expect(stale.status).toBe(401);
    expect((await stale.json()).error).toBe('bad_timestamp');

    const future = await env.handler(await accountRequest(env, key, token, { tsOffsetSec: 301 }));
    expect(future.status).toBe(401);
    expect((await future.json()).error).toBe('bad_timestamp');

    // Just inside the window is fine.
    const inside = await env.handler(await accountRequest(env, key, token, { tsOffsetSec: -299 }));
    expect(inside.status).toBe(200);
  });

  it('rejects a replayed request (same nonce + timestamp) even though it is perfectly signed', async () => {
    const env = makeTestEnv();
    const { key, token } = await issuedInstall(env);

    // The nonce that will be replayed: use it for the original request too.
    const nonce = 'replay-nonce-1';
    const first = await env.handler(await accountRequest(env, key, token, { nonce }));
    expect(first.status).toBe(200);

    // Rebuild an identical request (same nonce and timestamp) and replay it.
    const ts = Math.floor(env.clock.now() / 1000);
    const { buildSigningInput, signRequest: sign } = await import('@squiggle/shared');
    const forged = await sign(
      key.privateKey,
      await buildSigningInput({ method: 'GET', path: '/v1/account', nonce, timestamp: ts, body: null }),
    );
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const req = new Request(`${env.webAppOrigin}/v1/account`, {
        headers: {
          authorization: `Bearer ${token}`,
          'x-squiggle-sig': forged,
          'x-squiggle-nonce': nonce,
          'x-squiggle-ts': String(ts),
        },
      });
      const res = await env.handler(req);
      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe('nonce_reused');
    }
  });

  it('rejects requests with missing or malformed signature headers', async () => {
    const env = makeTestEnv();
    const { key, token } = await issuedInstall(env);

    for (const omitted of ['x-squiggle-sig', 'x-squiggle-nonce', 'x-squiggle-ts']) {
      const res = await env.handler(await accountRequest(env, key, token, { omitHeader: omitted }));
      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe('bad_signature');
    }

    const req = await accountRequest(env, key, token);
    req.headers.set('x-squiggle-ts', 'not-a-number');
    const badTs = await env.handler(req);
    expect(badTs.status).toBe(401);
    expect((await badTs.json()).error).toBe('bad_timestamp');
  });

  it('rejects unknown, revoked, and expired tokens', async () => {
    const env = makeTestEnv();
    const { key, token } = await issuedInstall(env);
    const { sha256Hex } = await import('@squiggle/shared');

    const unknown = await env.handler(await accountRequest(env, key, 'totally-unknown-token'));
    expect(unknown.status).toBe(401);
    expect((await unknown.json()).error).toBe('invalid_token');

    // No bearer token at all.
    const noAuth = new Request(`${env.webAppOrigin}/v1/account`);
    const resNoAuth = await env.handler(noAuth);
    expect(resNoAuth.status).toBe(401);
    expect((await resNoAuth.json()).error).toBe('invalid_token');

    const row = await env.db.findTokenByHash(await sha256Hex(token));
    await env.db.revokeToken(row!.tokenHash, env.clock.now());
    const revoked = await env.handler(await accountRequest(env, key, token));
    expect(revoked.status).toBe(401);
    expect((await revoked.json()).error).toBe('invalid_token');

    // Expired: move the clock past the 90-day TTL.
    await env.db.revokeToken(row!.tokenHash, T0);
    env.clock.advance(91 * 24 * 60 * 60 * 1000);
    const expired = await env.handler(await accountRequest(env, key, token));
    expect(expired.status).toBe(401);
    expect((await expired.json()).error).toBe('invalid_token');
  });

  it('never allows a non-pinned origin to read responses', async () => {
    const env = makeTestEnv();
    const res = await env.handler(
      new Request(`${env.webAppOrigin}/health`, { headers: { origin: 'https://evil.example' } }),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('origin_not_allowed');
    expect(res.headers.get('access-control-allow-origin')).toBeNull();

    // Preflight from the same origin is rejected the same way (fail closed,
    // no CORS headers to latch onto).
    const pre = await env.handler(
      new Request(`${env.webAppOrigin}/v1/account`, { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }),
    );
    expect(pre.status).toBe(403);
    expect((await pre.json()).error).toBe('origin_not_allowed');
    expect(pre.headers.get('access-control-allow-origin')).toBeNull();

    // A pinned origin gets a full preflight.
    const okPre = await env.handler(
      new Request(`${env.webAppOrigin}/v1/account`, { method: 'OPTIONS', headers: { origin: CHROME_ORIGIN } }),
    );
    expect(okPre.status).toBe(204);
    expect(okPre.headers.get('access-control-allow-origin')).toBe(CHROME_ORIGIN);
  });

  it('returns 404 for unknown /v1 endpoints and unknown paths', async () => {
    const env = makeTestEnv();
    const nf = await env.handler(new Request(`${env.webAppOrigin}/v1/does-not-exist`));
    expect(nf.status).toBe(404);
    expect((await nf.json()).error).toBe('not_found');
    const nf2 = await env.handler(new Request(`${env.webAppOrigin}/nope`));
    expect(nf2.status).toBe(404);
  });

  it('protects the admin migrate endpoint behind the admin token', async () => {
    const env = makeTestEnv({ adminToken: 'admin-secret' });
    const noAuth = await env.handler(
      new Request(`${env.webAppOrigin}/admin/migrate`, { method: 'POST' }),
    );
    expect(noAuth.status).toBe(401);

    const wrong = await env.handler(
      new Request(`${env.webAppOrigin}/admin/migrate`, {
        method: 'POST',
        headers: { authorization: 'Bearer wrong' },
      }),
    );
    expect(wrong.status).toBe(401);

    // A near-miss — the right token minus its last character, and with one
    // extra — must be refused exactly like an unrelated one.
    for (const nearMiss of ['Bearer admin-secre', 'Bearer admin-secretx']) {
      const rejected = await env.handler(
        new Request(`${env.webAppOrigin}/admin/migrate`, {
          method: 'POST',
          headers: { authorization: nearMiss },
        }),
      );
      expect(rejected.status).toBe(401);
    }

    const ok = await env.handler(
      new Request(`${env.webAppOrigin}/admin/migrate`, {
        method: 'POST',
        headers: { authorization: 'Bearer admin-secret' },
      }),
    );
    expect(ok.status).toBe(500); // runMigrations absent in this env
    expect((await ok.json()).error).toBe('internal');
  });
});
