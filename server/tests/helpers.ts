/**
 * Shared fixtures for the auth test suite: an in-memory DB, a manual clock,
 * a recording email sender, a fake Google OAuth server (real ECDSA, JOSE-form
 * signatures, like the production one), and a signed-request builder that
 * uses the same shared module the extension uses — so the tests exercise the
 * actual wire protocol end to end.
 */
import {
  base64urlEncode,
  buildSigningInput,
  derToJose,
  exportP256Jwk,
  generateSigningKeyPair,
  randomToken,
  signRequest,
} from '@squiggle/shared';

import { GOOGLE_JWKS_URL, GOOGLE_TOKEN_URL } from '../src/auth/google';
import type { EmailMessage, EmailSender, FetchLike } from '../src/lib/brevo';
import { ManualClock } from '../src/lib/clock';
import { MemoryDb } from '../src/db/memory';
import { createWorker, type Services } from '../src/index';
import type { UserRow } from '../src/db/types';

export const WEB_APP_ORIGIN = 'https://squiggle.fr';
export const CHROME_ORIGIN = 'chrome-extension://test-chrome-id';
export const FIREFOX_ORIGIN = 'moz-extension://test-ff-id';

/** Fixed "now" for the suite: 2023-11-14T22:13:20Z. */
export const T0 = 1_700_000_000_000;

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

export class FakeEmail implements EmailSender {
  sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }

  /** The magic-link code from the most recent email, or null. */
  lastCode(): string | null {
    const last = this.sent.at(-1);
    if (!last) return null;
    const m = last.html.match(/code=([^&"\s]+)/);
    return m ? m[1] : null;
  }
}

// ---------------------------------------------------------------------------
// Fake Google OAuth server
// ---------------------------------------------------------------------------

export interface FakeGoogleState {
  /** Nonce to embed in the minted ID token (set from the auth redirect). */
  nonce: string;
  /** If set, the token endpoint verifies S256(code_verifier) against it. */
  expectChallenge: string | null;
  /** Current time for iat/exp in minted tokens. */
  nowMs: number;
  failTokens: boolean;
  failJwks: boolean;
  wrongNonce: boolean;
  seenVerifiers: string[];
  seenRedirectUris: string[];
}

export interface FakeGoogle {
  fetchImpl: FetchLike;
  state: FakeGoogleState;
  kid: string;
  keyPair: CryptoKeyPair;
  sub: string;
}

export async function makeFakeGoogle(clientId: string): Promise<FakeGoogle> {
  const keyPair = await generateSigningKeyPair();
  const jwk = await exportP256Jwk(keyPair.publicKey);
  const kid = 'test-kid';
  const sub = 'g-sub-123';

  const state: FakeGoogleState = {
    nonce: '',
    expectChallenge: null,
    nowMs: T0,
    failTokens: false,
    failJwks: false,
    wrongNonce: false,
    seenVerifiers: [],
    seenRedirectUris: [],
  };

  const encoder = new TextEncoder();

  async function mintIdToken(claims: Record<string, unknown>): Promise<string> {
    const header = base64urlEncode(encoder.encode(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid })));
    const payload = base64urlEncode(encoder.encode(JSON.stringify(claims)));
    const signingInput = `${header}.${payload}`;
    // Google always emits the JOSE raw r||s form regardless of what a local
    // WebCrypto `sign` happens to produce (DER on some runtimes), so normalize.
    const sig = new Uint8Array(
      await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keyPair.privateKey, encoder.encode(signingInput)),
    );
    const jose = sig.length === 64 ? sig : derToJose(sig);
    return `${signingInput}.${base64urlEncode(jose)}`;
  }

  const fetchImpl: FetchLike = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    if (url === GOOGLE_TOKEN_URL) {
      if (state.failTokens) return Response.json({ error: 'invalid_grant' }, { status: 400 });
      const form = new URLSearchParams(typeof init?.body === 'string' ? init.body : '');
      state.seenRedirectUris.push(form.get('redirect_uri') ?? '');
      const verifier = form.get('code_verifier') ?? '';
      state.seenVerifiers.push(verifier);
      if (state.expectChallenge !== null) {
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier)));
        if (base64urlEncode(digest) !== state.expectChallenge) {
          return Response.json({ error: 'invalid_grant' }, { status: 400 });
        }
      }
      const nowSec = Math.floor(state.nowMs / 1000);
      const idToken = await mintIdToken({
        iss: 'https://accounts.google.com',
        aud: clientId,
        sub,
        email: 'marie@gmail.com',
        email_verified: true,
        nonce: state.wrongNonce ? 'attacker-nonce' : state.nonce,
        iat: nowSec,
        exp: nowSec + 3600,
      });
      return Response.json({ access_token: 'fake-access-token', id_token: idToken, expires_in: 3600 });
    }

    if (url === GOOGLE_JWKS_URL) {
      if (state.failJwks) return new Response('boom', { status: 500 });
      return Response.json({ keys: [{ ...jwk, kid }] });
    }

    return new Response('not found', { status: 404 });
  };

  return { fetchImpl, state, kid, keyPair, sub };
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

export interface TestEnv {
  services: Services;
  handler: (req: Request) => Promise<Response>;
  db: MemoryDb;
  clock: ManualClock;
  email: FakeEmail;
  webAppOrigin: string;
}

export function makeTestEnv(opts: { fetchImpl?: FetchLike; adminToken?: string } = {}): TestEnv {
  const db = new MemoryDb();
  const clock = new ManualClock(T0);
  const email = new FakeEmail();
  const webAppOrigin = WEB_APP_ORIGIN;
  const services: Services = {
    db,
    clock,
    email,
    webAppOrigin,
    extensionOrigins: [CHROME_ORIGIN, FIREFOX_ORIGIN],
    googleClientId: 'test-google-client-id',
    fetchImpl: opts.fetchImpl,
    adminToken: opts.adminToken,
  };
  const worker = createWorker(services);
  return { services, handler: (req) => worker.fetch(req), db, clock, email, webAppOrigin };
}

// ---------------------------------------------------------------------------
// Journeys
// ---------------------------------------------------------------------------

/** Request a magic link and parse its code out of the delivered email. */
export async function requestMagicLink(
  env: TestEnv,
  emailAddr: string,
  ip?: string,
): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (ip) headers['cf-connecting-ip'] = ip;
  return env.handler(
    new Request(`${env.webAppOrigin}/auth/magic-link`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email: emailAddr }),
    }),
  );
}

/** The full magic-link login: request, read the code, verify, return the session cookie. */
export async function magicLogin(
  env: TestEnv,
  emailAddr: string,
  ip?: string,
): Promise<{ sessionCookie: string; fullCookie: string; user: UserRow }> {
  const reqRes = await requestMagicLink(env, emailAddr, ip);
  if (reqRes.status !== 200) throw new Error(`magic-link request failed: ${await reqRes.text()}`);
  const code = env.email.lastCode();
  if (!code) throw new Error('no code in delivered email');
  const verifyRes = await env.handler(
    new Request(`${env.webAppOrigin}/auth/magic-link/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    }),
  );
  if (verifyRes.status !== 200) throw new Error(`verify failed: ${await verifyRes.text()}`);
  const body = (await verifyRes.json()) as { userId: string; email: string };
  const cookie = verifyRes.headers.get('set-cookie');
  if (!cookie) throw new Error('no session cookie set');
  return {
    sessionCookie: cookie.split(';')[0],
    fullCookie: cookie,
    user: await env.db.getUserById(body.userId) ?? {} as UserRow,
  };
}

/** Exchange a web session for an extension token (the claim step). */
export async function claim(
  env: TestEnv,
  sessionCookie: string,
  jwk: unknown,
): Promise<Response> {
  return env.handler(
    new Request(`${env.webAppOrigin}/auth/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: sessionCookie },
      body: JSON.stringify({ publicKeyJwk: jwk }),
    }),
  );
}

// ---------------------------------------------------------------------------
// Signed requests
// ---------------------------------------------------------------------------

export interface SignedRequestOpts {
  key: CryptoKeyPair;
  token: string;
  path: string;
  method?: string;
  body?: string;
  /** Override the nonce (replay tests). */
  nonce?: string;
  /** Seconds offset from the manual clock (staleness tests). */
  tsOffsetSec?: number;
  /** Sign a different path than the one requested (tampering tests). */
  signPathOverride?: string;
  origin?: string;
  /** Drop a specific header by name. */
  omitHeader?: string;
}

/** Build a request signed with the given key, exactly as the extension does. */
export async function signedRequest(env: TestEnv, opts: SignedRequestOpts): Promise<Request> {
  const method = opts.method ?? 'GET';
  const url = new URL(opts.path, env.webAppOrigin);
  const rawBody = opts.body;
  const nonce = opts.nonce ?? randomToken(16);
  const timestamp = Math.floor(env.clock.now() / 1000) + (opts.tsOffsetSec ?? 0);
  const signPath = opts.signPathOverride ?? url.pathname + url.search;
  const input = await buildSigningInput({
    method,
    path: signPath,
    nonce,
    timestamp,
    body: rawBody ?? null,
  });
  const sig = await signRequest(opts.key.privateKey, input);

  const headers: Record<string, string> = {
    authorization: `Bearer ${opts.token}`,
    'x-squiggle-sig': sig,
    'x-squiggle-nonce': nonce,
    'x-squiggle-ts': String(timestamp),
  };
  if (rawBody !== undefined) headers['content-type'] = 'application/json';
  if (opts.origin) headers['origin'] = opts.origin;
  if (opts.omitHeader) delete headers[opts.omitHeader];

  return new Request(url, {
    method,
    headers,
    body: method === 'GET' || rawBody === undefined ? undefined : rawBody,
  });
}

/** Export a generated keypair's public half as the minimal P-256 JWK. */
export async function exportJwk(key: CryptoKeyPair): Promise<{ kty: 'EC'; crv: 'P-256'; x: string; y: string }> {
  return exportP256Jwk(key.publicKey);
}

/** Convenience: a signed GET /v1/account against the current clock. */
export async function accountRequest(
  env: TestEnv,
  key: CryptoKeyPair,
  token: string,
  extra: Partial<SignedRequestOpts> = {},
): Promise<Request> {
  return signedRequest(env, { key, token, path: '/v1/account', ...extra });
}
