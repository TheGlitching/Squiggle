import { describe, expect, it } from 'vitest';

import { sanitizeNext } from '../src/auth/next';
import { makeFakeGoogle, makeTestEnv, type TestEnv } from './helpers';

const PUB = JSON.stringify({ kty: 'EC', crv: 'P-256', x: 'abc_-123', y: 'def_-456' });
const BRIDGE = `/pont?${new URLSearchParams({ ext: 'abcdefghijklmnop', pub: PUB })}`;

/** Where a finished sign-in sends the reader, as the browser would see it. */
function bridgeOf(location: string): { ext: string | null; pub: string | null; pathname: string } {
  const url = new URL(location, 'https://squiggle.fr');
  return { pathname: url.pathname, ext: url.searchParams.get('ext'), pub: url.searchParams.get('pub') };
}

async function googleLogin(next: string | null): Promise<{ env: TestEnv; location: string }> {
  const fake = await makeFakeGoogle('test-google-client-id');
  const env = makeTestEnv({ fetchImpl: fake.fetchImpl });
  const query = next === null ? '' : `?${new URLSearchParams({ next })}`;
  const start = await env.handler(new Request(`${env.webAppOrigin}/auth/google${query}`));
  const url = new URL(start.headers.get('location')!);
  fake.state.nonce = url.searchParams.get('nonce')!;
  fake.state.expectChallenge = url.searchParams.get('code_challenge')!;
  fake.state.nowMs = env.clock.now();
  const state = encodeURIComponent(url.searchParams.get('state')!);
  const res = await env.handler(new Request(`${env.webAppOrigin}/auth/google/callback?code=ok&state=${state}`));
  expect(res.status).toBe(302);
  return { env, location: res.headers.get('location')! };
}

async function emailLogin(next: unknown): Promise<{ next: string | null }> {
  const env = makeTestEnv();
  const headers = { 'content-type': 'application/json', origin: env.webAppOrigin };
  await env.handler(
    new Request(`${env.webAppOrigin}/auth/magic-link`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email: 'marie@example.com', next }),
    }),
  );
  // The reader opens the emailed link in a new tab: that tab only has the code.
  const res = await env.handler(
    new Request(`${env.webAppOrigin}/auth/magic-link/verify`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ code: env.email.lastCode() }),
    }),
  );
  expect(res.status).toBe(200);
  return (await res.json()) as { next: string | null };
}

describe('sanitizeNext', () => {
  it('keeps the account page and a bridge URL with both of its parameters', () => {
    expect(sanitizeNext('/compte')).toBe('/compte');
    expect(sanitizeNext('/compte?x=1#y')).toBe('/compte');
    expect(bridgeOf(sanitizeNext(BRIDGE)!)).toEqual({ pathname: '/pont', ext: 'abcdefghijklmnop', pub: PUB });
  });

  it('drops every parameter of a bridge URL but ext and pub', () => {
    expect(sanitizeNext(`${BRIDGE}&evil=1`)).toBe(sanitizeNext(BRIDGE));
  });

  it.each([
    ['another origin', 'https://evil.example/compte'],
    ['a protocol-relative URL', '//evil.example/compte'],
    ['a backslash that browsers read as a slash', '/\\evil.example'],
    ['a tab that URL parsing strips', '/\t/evil.example'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a relative path', 'compte'],
    ['a path off the allowlist', '/admin'],
    ['a look-alike prefix', '/compte-evil'],
    ['a bridge without ext', `/pont?pub=${encodeURIComponent(PUB)}`],
    ['a bridge without pub', '/pont?ext=abc'],
    ['an empty string', ''],
    ['a non-string', { path: '/compte' }],
    ['a huge value', `/pont?ext=a&pub=${'x'.repeat(5000)}`],
  ])('rejects %s', (_label, raw) => {
    expect(sanitizeNext(raw)).toBeNull();
  });
});

describe('the bridge survives every way of signing in', () => {
  it('Google: the callback lands on /pont with the original ext and pub', async () => {
    const { location } = await googleLogin(BRIDGE);
    expect(bridgeOf(location)).toEqual({ pathname: '/pont', ext: 'abcdefghijklmnop', pub: PUB });
    expect(location.startsWith('https://squiggle.fr/pont?')).toBe(true);
  });

  it('emailed link: the code alone brings back /pont with the original ext and pub', async () => {
    const { next } = await emailLogin(BRIDGE);
    expect(bridgeOf(next!)).toEqual({ pathname: '/pont', ext: 'abcdefghijklmnop', pub: PUB });
  });

  it('code typed by hand: the same request, so the same destination', async () => {
    // The code is identical whether it is clicked or typed; there is no second path.
    const { next } = await emailLogin(BRIDGE);
    expect(next).toBe(sanitizeNext(BRIDGE));
  });

  it('without a destination, Google goes to /compte and the link reports none', async () => {
    expect((await googleLogin(null)).location).toBe('https://squiggle.fr/compte');
    expect((await emailLogin(undefined)).next).toBeNull();
  });
});

describe('an external or malformed destination falls back to the account page', () => {
  it.each(['https://evil.example/', '//evil.example', '/\\evil.example', '/pont?ext=only', '/admin'])(
    'Google: %s',
    async (next) => {
      expect((await googleLogin(next)).location).toBe('https://squiggle.fr/compte');
    },
  );

  it.each(['https://evil.example/', '//evil.example', '/pont?ext=only', 42, null])(
    'emailed link: %s is never stored',
    async (next) => {
      expect((await emailLogin(next)).next).toBeNull();
    },
  );
});
