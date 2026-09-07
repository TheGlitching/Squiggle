/**
 * The gateway for every `/v1/*` request: it is what makes "the extension
 * proved it is an install that this user authorized" mechanically true.
 *
 * Order of checks, each cheap-to-expensive on purpose:
 *   1. bearer token present, known, not revoked, not expired;
 *   2. signature headers present;
 *   3. timestamp inside the shared ±5-minute window (staleness);
 *   4. the ECDSA signature over the canonical string verifies against the
 *      P-256 key bound to the token (the shared module computes the string,
 *      so the extension and the server can never disagree about it);
 *   5. the nonce is new (replay) — an atomic check-and-set in the DB, so a
 *      race of two identical requests cannot both pass.
 *
 * A failure at any step yields a distinct machine-readable code, so a
 * misbehaving client (or an attacker) cannot probe which layer it broke.
 */
import {
  buildSigningInput,
  importP256Jwk,
  sha256Hex,
  SigningHeaders,
  SIGNATURE_WINDOW_SECONDS,
  verifyRequest,
  type P256Jwk,
} from '@squiggle/shared';

import type { Clock } from '../lib/clock';
import { apiError, type Outcome } from '../lib/errors';
import type { Db, UserRow } from '../db/types';

/** A nonce stays meaningful (and is replay-checked) for 10 minutes. */
export const NONCE_TTL_MS = 10 * 60 * 1000;

export interface SigningDeps {
  db: Db;
  clock: Clock;
}

export interface AuthenticatedRequest {
  user: UserRow;
  /** The extension key the request was signed with (revocation target). */
  keyId: string;
}

export async function verifySignedRequest(
  deps: SigningDeps,
  req: Request,
  rawBody: string,
): Promise<Outcome<AuthenticatedRequest>> {
  const now = deps.clock.now();

  const authHeader = req.headers.get(SigningHeaders.authorization);
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;
  if (!token) return apiError('invalid_token', 'Missing bearer token.');

  const tokenRow = await deps.db.findTokenByHash(await sha256Hex(token));
  if (!tokenRow || tokenRow.revokedAt !== null) {
    return apiError('invalid_token', 'This token is not valid.');
  }
  if (tokenRow.expiresAt <= now) return apiError('invalid_token', 'This token has expired.');

  const key = await deps.db.getExtensionKey(tokenRow.keyId);
  if (!key) return apiError('invalid_token', 'The signing key for this token is missing.');

  const nonce = req.headers.get(SigningHeaders.nonce);
  const timestampHeader = req.headers.get(SigningHeaders.timestamp);
  const signature = req.headers.get(SigningHeaders.signature);
  if (!nonce || !timestampHeader || !signature) {
    return apiError('bad_signature', 'Missing signature headers.');
  }

  const timestamp = Number(timestampHeader);
  if (!Number.isInteger(timestamp)) return apiError('bad_timestamp', 'Bad timestamp.');
  if (Math.abs(now / 1000 - timestamp) > SIGNATURE_WINDOW_SECONDS) {
    return apiError('bad_timestamp', 'The request timestamp is outside the accepted window.');
  }

  const url = new URL(req.url);
  const input = await buildSigningInput({
    method: req.method,
    path: url.pathname + url.search,
    nonce,
    timestamp,
    body: rawBody,
  });

  let publicKey: CryptoKey;
  try {
    publicKey = await importP256Jwk(JSON.parse(key.publicKeyJwk) as P256Jwk);
  } catch {
    return apiError('internal', 'Stored signing key is unreadable.');
  }

  if (!(await verifyRequest(publicKey, input, signature))) {
    return apiError('bad_signature', 'Signature verification failed.');
  }

  if (!(await deps.db.addNonce({ keyId: tokenRow.keyId, nonce, now, ttlMs: NONCE_TTL_MS }))) {
    return apiError('nonce_reused', 'This request has already been processed.');
  }

  const user = await deps.db.getUserById(tokenRow.userId);
  if (!user) return apiError('invalid_token', 'The user for this token no longer exists.');
  return { ok: true, user, keyId: tokenRow.keyId };
}
