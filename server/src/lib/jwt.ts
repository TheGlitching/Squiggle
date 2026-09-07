/**
 * Verification of Google ID tokens (JWTs with ES256 / P-256 signatures).
 *
 * Google publishes its signing keys as a JWKS (`GOOGLE_JWKS_URL`); we select
 * the key by the token header's `kid`, import it as a P-256 verify key, and
 * validate the signature plus the security-relevant claims: issuer, audience
 * (our client id), the `nonce` we put in the auth request (this is what makes
 * the token unusable against a different session or a replayed handshake),
 * and expiry.
 *
 * One encoding wrinkle: Google signs in the JOSE form — a bare 64-byte
 * `r||s` concatenation — while some WebCrypto runtimes expect (and only
 * accept) a DER-encoded `r`/`s` pair. The shared `verifyRequest` handles
 * both encodings, so the actual cryptographic check reuses it and there is
 * a single signature-verification code path in the whole product.
 */
import { base64urlDecode, importP256Jwk, verifyRequest, type P256Jwk } from '@squiggle/shared';

export interface GoogleIdTokenClaims {
  iss: string;
  aud: string;
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  nonce?: string;
  iat: number;
  exp: number;
}

export interface VerifyIdTokenArgs {
  idToken: string;
  /** The Google client id — the token's `aud` must equal it. */
  audience: string;
  /** The `nonce` placed in the original auth request. */
  expectedNonce: string;
  /** The JWKS document fetched from Google. */
  jwks: { keys: unknown[] };
  /** Current time, unix seconds. */
  nowSec: number;
}

const GOOGLE_ISSUERS: readonly string[] = ['https://accounts.google.com', 'accounts.google.com'];
/** Tolerated skew between the token's `iat` and the server clock. */
const MAX_IAT_SKEW_SEC = 300;

export async function verifyGoogleIdToken(args: VerifyIdTokenArgs): Promise<GoogleIdTokenClaims> {
  const parts = args.idToken.split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const [header64, payload64, sig64] = parts;

  const header = JSON.parse(decoderText(base64urlDecode(header64))) as { alg?: unknown; kid?: unknown };
  if (header.alg !== 'ES256' || typeof header.kid !== 'string') {
    throw new Error('unsupported token header');
  }

  const jwk = findP256Jwk(args.jwks, header.kid);
  if (!jwk) throw new Error('unknown key id');
  const key = await importP256Jwk(jwk);

  if (!(await verifyRequest(key, `${header64}.${payload64}`, sig64))) {
    throw new Error('bad signature');
  }

  const claims = JSON.parse(decoderText(base64urlDecode(payload64))) as GoogleIdTokenClaims;
  if (!GOOGLE_ISSUERS.includes(claims.iss)) throw new Error('bad issuer');
  if (claims.aud !== args.audience) throw new Error('bad audience');
  if (claims.nonce !== args.expectedNonce) throw new Error('nonce mismatch');
  if (typeof claims.sub !== 'string' || claims.sub.length === 0) throw new Error('no subject');
  if (!Number.isFinite(claims.exp) || claims.exp <= args.nowSec) throw new Error('expired token');
  if (Number.isFinite(claims.iat) && args.nowSec - claims.iat > MAX_IAT_SKEW_SEC) {
    throw new Error('token too old');
  }
  return claims;
}

function findP256Jwk(jwks: { keys: unknown[] }, kid: string): P256Jwk | null {
  for (const k of jwks.keys) {
    if (typeof k !== 'object' || k === null) continue;
    const o = k as Record<string, unknown>;
    if (o.kty === 'EC' && o.crv === 'P-256' && o.kid === kid && typeof o.x === 'string' && typeof o.y === 'string') {
      return { kty: 'EC', crv: 'P-256', x: o.x, y: o.y };
    }
  }
  return null;
}

const decoder = new TextDecoder();

function decoderText(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}
