/**
 * Google sign-in, as a full OAuth 2.0 authorization-code flow with PKCE.
 *
 * PKCE is used even though we hold a `client_secret`: the browser is an
 * untrusted presenter, so the code exchange must be bound to the original
 * request via the S256 challenge, and the `nonce` bound to the in-flight
 * handshake (stored as `oauth_pending`) makes the returned ID token
 * useless outside this exact login attempt.
 *
 * `startGoogleAuth` prepares the handshake and returns the redirect to
 * `accounts.google.com`; `completeGoogleAuth` handles the callback: it
 * verifies `state`, exchanges the code for an ID token, verifies the token
 * against Google's JWKS, and opens a web session.
 */
import { base64urlEncode, randomToken } from '@squiggle/shared';

import type { Clock } from '../lib/clock';
import type { FetchLike } from '../lib/brevo';
import { apiError, type Outcome } from '../lib/errors';
import { verifyGoogleIdToken } from '../lib/jwt';
import type { Db } from '../db/types';
import { createWebSession } from './session';

/** A handshake stops being valid 10 minutes after it started. */
export const OAUTH_PENDING_TTL_MS = 10 * 60 * 1000;

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

export interface GoogleDeps {
  db: Db;
  clock: Clock;
  /** Absolute origin of the web app — the registered redirect URI points here. */
  webAppOrigin: string;
  clientId: string;
  /** Required for web-based clients; native/mobile clients omit it. */
  clientSecret?: string;
  /** Injectable fetch (tests); defaults to the global. */
  fetchImpl?: FetchLike;
}

export interface StartedGoogleAuth {
  redirectUrl: string;
  state: string;
}

export async function startGoogleAuth(deps: GoogleDeps): Promise<StartedGoogleAuth> {
  const now = deps.clock.now();
  const codeVerifier = randomToken(32);
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(codeVerifier),
  );
  const codeChallenge = base64urlEncode(new Uint8Array(digest));
  const state = randomToken(16);
  const nonce = randomToken(16);
  const redirectUri = `${deps.webAppOrigin}/auth/google/callback`;

  await deps.db.createOAuthPending({
    state,
    codeVerifier,
    nonce,
    redirectUri,
    now,
    ttlMs: OAUTH_PENDING_TTL_MS,
  });

  const params = new URLSearchParams({
    client_id: deps.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    nonce,
    prompt: 'select_account',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  return { redirectUrl: `${GOOGLE_AUTH_URL}?${params.toString()}`, state };
}

export async function completeGoogleAuth(
  deps: GoogleDeps,
  input: { state?: string; code?: string },
): Promise<Outcome<{ userId: string; email: string | null; sessionToken: string }>> {
  const { state, code } = input;
  if (!state || !code) return apiError('invalid_state', 'Missing OAuth state or code.');

  const now = deps.clock.now();
  const pending = await deps.db.findOAuthPending(state);
  if (!pending) return apiError('invalid_state', 'Unknown or expired OAuth state.');
  if (pending.expiresAt <= now) return apiError('invalid_state', 'Expired OAuth state.');
  // Consume the handshake: a replayed callback has nothing left to match.
  await deps.db.deleteOAuthPending(state);

  const fetchImpl = deps.fetchImpl ?? fetch;

  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: pending.redirectUri,
    client_id: deps.clientId,
    code_verifier: pending.codeVerifier,
  });
  if (deps.clientSecret) form.set('client_secret', deps.clientSecret);

  let tokens: { id_token?: string };
  try {
    const res = await fetchImpl(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    if (!res.ok) return apiError('oauth_failed', 'Google rejected the authorization code.');
    tokens = (await res.json()) as { id_token?: string };
  } catch {
    return apiError('oauth_failed', 'Could not reach Google to exchange the code.');
  }
  if (!tokens.id_token) return apiError('oauth_failed', 'Google returned no ID token.');

  let jwks: { keys: unknown[] };
  try {
    const res = await fetchImpl(GOOGLE_JWKS_URL);
    if (!res.ok) return apiError('oauth_failed', 'Could not fetch Google signing keys.');
    jwks = (await res.json()) as { keys: unknown[] };
  } catch {
    return apiError('oauth_failed', 'Could not reach Google for signing keys.');
  }

  let claims;
  try {
    claims = await verifyGoogleIdToken({
      idToken: tokens.id_token,
      audience: deps.clientId,
      expectedNonce: pending.nonce,
      jwks,
      nowSec: Math.floor(now / 1000),
    });
  } catch {
    return apiError('oauth_failed', 'The Google ID token could not be verified.');
  }

  // Link to an existing account by email first, then by Google sub; only if
  // both are new do we create a user.
  let user = claims.email ? await deps.db.getUserByEmail(claims.email) : null;
  if (!user) user = await deps.db.getUserByGoogleSub(claims.sub);
  if (!user) {
    user = await deps.db.createUser(
      {
        email: claims.email ?? null,
        emailVerified: claims.email_verified ?? false,
        googleSub: claims.sub,
      },
      now,
    );
  } else {
    if (claims.sub && !user.googleSub) await deps.db.attachGoogleSub(user.id, claims.sub, now);
    if (claims.email_verified && !user.emailVerified) await deps.db.markEmailVerified(user.id, now);
  }

  const sessionToken = await createWebSession({ db: deps.db, clock: deps.clock }, user.id);
  return { ok: true, userId: user.id, email: claims.email ?? null, sessionToken };
}
