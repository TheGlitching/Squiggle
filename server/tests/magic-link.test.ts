import { describe, expect, it } from 'vitest';

import { makeTestEnv, magicLogin, requestMagicLink, T0 } from './helpers';

describe('POST /auth/magic-link', () => {
  it('sends a 10-minute, single-use code by email and normalizes the address', async () => {
    const env = makeTestEnv();
    const res = await requestMagicLink(env, '  Marie@Example.COM ', '203.0.113.7');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; sent: boolean };
    expect(body).toEqual({ ok: true, sent: true });
    expect(env.email.sent).toHaveLength(1);
    expect(env.email.sent[0].to).toBe('marie@example.com');

    const link = await env.db.findMagicLinkByCodeHash(
      await import('@squiggle/shared').then((m) => m.sha256Hex(env.email.lastCode()!)),
    );
    expect(link).not.toBeNull();
    expect(link!.email).toBe('marie@example.com');
    expect(link!.ip).toBe('203.0.113.7');
    expect(link!.expiresAt).toBe(T0 + 10 * 60 * 1000);
  });

  it('rejects addresses that are not emails', async () => {
    const env = makeTestEnv();
    for (const bad of ['not-an-email', 'a@b', 'a b@c.d', '']) {
      const res = await requestMagicLink(env, bad);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('invalid_email');
    }
    expect(env.email.sent).toHaveLength(0);
  });

  it('caps requests per email (3/hour) and per IP (5/hour), and resets after the window', async () => {
    const env = makeTestEnv();

    // Three different addresses from one IP: allowed 1..5 would be per-IP; here
    // the per-email limit (3) binds first for the same address.
    expect((await requestMagicLink(env, 'marie@example.com', '203.0.113.7')).status).toBe(200);
    expect((await requestMagicLink(env, 'marie@example.com', '198.51.100.1')).status).toBe(200);
    expect((await requestMagicLink(env, 'marie@example.com', '198.51.100.2')).status).toBe(200);
    const blocked = await requestMagicLink(env, 'marie@example.com', '198.51.100.3');
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error).toBe('rate_limited');

    // A different address from the same first IP is still fine (per-IP count 1).
    expect((await requestMagicLink(env, 'jean@example.com', '203.0.113.7')).status).toBe(200);

    // Per-IP limit: five distinct addresses from one IP, then blocked.
    for (let i = 1; i <= 4; i += 1) {
      expect((await requestMagicLink(env, `ip-${i}@example.com`, '203.0.113.99')).status).toBe(200);
    }
    // ip-5 would be the 6th request from that IP (the 4 above + ... recount:
    // 203.0.113.99 has 4 so far) — the 5th is allowed, the 6th blocked.
    expect((await requestMagicLink(env, 'ip-5@example.com', '203.0.113.99')).status).toBe(200);
    const ipBlocked = await requestMagicLink(env, 'ip-6@example.com', '203.0.113.99');
    expect(ipBlocked.status).toBe(429);
    expect((await ipBlocked.json()).error).toBe('rate_limited');

    // After one hour the windows roll and both identities are unblocked.
    env.clock.advance(60 * 60 * 1000 + 1);
    expect((await requestMagicLink(env, 'marie@example.com', '198.51.100.9')).status).toBe(200);
  });
});

describe('POST /auth/magic-link/verify', () => {
  it('creates the user with a verified email, opens a session, and sets an HttpOnly cookie', async () => {
    const env = makeTestEnv();
    const { sessionCookie, fullCookie, user } = await magicLogin(env, 'marie@example.com');
    expect(user.email).toBe('marie@example.com');
    expect(user.emailVerified).toBe(true);
    expect(sessionCookie.startsWith('squiggle_session=')).toBe(true);
    expect(fullCookie).toContain('HttpOnly');
    expect(fullCookie).toContain('Secure');
    expect(fullCookie).toContain('SameSite=Lax');
    expect(fullCookie).toContain('Max-Age=2592000');

    const session = await env.db.findSessionByHash(
      await import('@squiggle/shared').then((m) => m.sha256Hex(sessionCookie.split('=')[1])),
    );
    expect(session).not.toBeNull();
    expect(session!.expiresAt).toBe(T0 + 30 * 24 * 60 * 60 * 1000);
  });

  it('links a second magic login to the existing account', async () => {
    const env = makeTestEnv();
    const { user: first } = await magicLogin(env, 'marie@example.com');
    const { user: second } = await magicLogin(env, 'marie@example.com');
    expect(second.id).toBe(first.id);
    expect((await env.db.getUserByEmail('marie@example.com'))!.id).toBe(first.id);
  });

  it('rejects an unknown code, a reused code, and an expired code with distinct codes', async () => {
    const env = makeTestEnv();
    await magicLogin(env, 'marie@example.com');

    const unknown = await env.handler(
      new Request(`${env.webAppOrigin}/auth/magic-link/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: env.webAppOrigin },
        body: JSON.stringify({ code: 'forged-code' }),
      }),
    );
    expect(unknown.status).toBe(400);
    expect((await unknown.json()).error).toBe('invalid_code');

    // Reuse of a freshly consumed code.
    await requestMagicLink(env, 'marie@example.com');
    const code = env.email.lastCode()!;
    const firstUse = await env.handler(
      new Request(`${env.webAppOrigin}/auth/magic-link/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: env.webAppOrigin },
        body: JSON.stringify({ code }),
      }),
    );
    expect(firstUse.status).toBe(200);
    const reuse = await env.handler(
      new Request(`${env.webAppOrigin}/auth/magic-link/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: env.webAppOrigin },
        body: JSON.stringify({ code }),
      }),
    );
    expect(reuse.status).toBe(400);
    expect((await reuse.json()).error).toBe('link_already_used');

    // Expiry: request a link, advance past its TTL, verify.
    await requestMagicLink(env, 'old@example.com');
    env.clock.advance(11 * 60 * 1000);
    const expired = await env.handler(
      new Request(`${env.webAppOrigin}/auth/magic-link/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: env.webAppOrigin },
        body: JSON.stringify({ code: env.email.lastCode()! }),
      }),
    );
    expect(expired.status).toBe(410);
    expect((await expired.json()).error).toBe('expired_link');
  });
});
