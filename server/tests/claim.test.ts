import { describe, expect, it } from 'vitest';

import { exportP256Jwk, generateSigningKeyPair } from '@squiggle/shared';

import { claim, makeTestEnv, magicLogin } from './helpers';

describe('/auth/claim', () => {
  it('requires a valid web session', async () => {
    const env = makeTestEnv();
    const key = await generateSigningKeyPair();
    const jwk = await exportP256Jwk(key.publicKey);

    const anon = await claim(env, '', jwk);
    expect(anon.status).toBe(401);
    expect((await anon.json()).error).toBe('invalid_session');

    const forged = await claim(env, 'squiggle_session=not-a-real-session', jwk);
    expect(forged.status).toBe(401);
    expect((await forged.json()).error).toBe('invalid_session');
  });

  it('binds the session user to the install key and returns the token exactly once', async () => {
    const env = makeTestEnv();
    const { sessionCookie, user } = await magicLogin(env, 'marie@example.com');
    const key = await generateSigningKeyPair();
    const jwk = await exportP256Jwk(key.publicKey);

    const res = await claim(env, sessionCookie, jwk);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; token: string; keyId: string; userId: string };
    expect(body.ok).toBe(true);
    expect(body.userId).toBe(user.id);

    // The DB only ever holds the hash, and the key is the install's public JWK.
    const { sha256Hex } = await import('@squiggle/shared');
    const stored = await env.db.findTokenByHash(await sha256Hex(body.token));
    expect(stored).not.toBeNull();
    expect(stored!.userId).toBe(user.id);
    const storedKey = await env.db.getExtensionKey(body.keyId);
    expect(storedKey).not.toBeNull();
    // Stored as the minimal P-256 JWK, no matter which extra fields the
    // client's WebCrypto happened to include.
    expect(JSON.parse(storedKey!.publicKeyJwk)).toEqual({ kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y });
    // The raw token does not appear anywhere in the stored rows.
    expect(JSON.stringify(stored)).not.toContain(body.token);
  });

  it('accepts the key in a GET query string as well as a POST body', async () => {
    const env = makeTestEnv();
    const { sessionCookie } = await magicLogin(env, 'marie@example.com');
    const key = await generateSigningKeyPair();
    const jwk = await exportP256Jwk(key.publicKey);

    const res = await env.handler(
      new Request(`${env.webAppOrigin}/auth/claim?key=${encodeURIComponent(JSON.stringify(jwk))}`, {
        headers: { cookie: sessionCookie },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string };
    expect(body.token).toBeTruthy();
  });

  it('rejects keys that are not usable P-256 public JWKs', async () => {
    const env = makeTestEnv();
    const { sessionCookie } = await magicLogin(env, 'marie@example.com');

    for (const bad of [null, {}, { kty: 'EC', crv: 'P-521', x: 'x', y: 'y' }, { kty: 'EC', crv: 'P-256' }, 'a-string']) {
      const res = await claim(env, sessionCookie, bad);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('invalid_key');
    }
  });
});
