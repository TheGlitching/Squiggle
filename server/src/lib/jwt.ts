/**
 * Verification of Google ID tokens (JWTs with RS256 signatures).
 *
 * Google publishes its signing keys as a JWKS (`GOOGLE_JWKS_URL`) of RSA
 * keys and signs ID tokens RS256 (RSASSA-PKCS1-v1_5 with SHA-256). We select
 * the key by the token header's `kid`, import it as an RSA verify key, and
 * validate the signature plus the security-relevant claims: issuer, audience
 * (our client id), the `nonce` we put in the auth request (this is what makes
 * the token unusable against a different session or a replayed handshake),
 * and expiry.
 *
 * RS256 is the only accepted `alg`: the header is never trusted to pick the
 * algorithm, so `none`, HS256 or anything else is refused before any key is
 * looked at.
 */
import { base64urlDecode } from '@squiggle/shared';

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
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') {
    throw new Error('unsupported token header');
  }

  const jwk = findRsaJwk(args.jwks, header.kid);
  if (!jwk) throw new Error('unknown key id');
  const key = await crypto.subtle.importKey('jwk', jwk, RS256, false, ['verify']);

  const signingInput = new TextEncoder().encode(`${header64}.${payload64}`);
  if (!(await crypto.subtle.verify(RS256, key, base64urlDecode(sig64), signingInput))) {
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

const RS256 = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } as const;

/** Only the fields the key needs: a stray `alg`/`use`/`key_ops` cannot widen it. */
function findRsaJwk(jwks: { keys: unknown[] }, kid: string): JsonWebKey | null {
  for (const k of jwks.keys) {
    if (typeof k !== 'object' || k === null) continue;
    const o = k as Record<string, unknown>;
    if (o.kty === 'RSA' && o.kid === kid && typeof o.n === 'string' && typeof o.e === 'string') {
      return { kty: 'RSA', n: o.n, e: o.e };
    }
  }
  return null;
}

const decoder = new TextDecoder();

function decoderText(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}
