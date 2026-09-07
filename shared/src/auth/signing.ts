/**
 * Request signing for the hosted API (ES256 / ECDSA P-256 via WebCrypto).
 *
 * This module is the SINGLE source of truth for the signature protocol. It is
 * imported by both sides of the wire — the extension (holds the private key and
 * signs) and the hosted server (holds the public key and verifies) — so the
 * canonical string being signed and the key handling can never drift apart.
 * A mismatch there would silently break authentication for every install, or
 * worse, let a verifier accept a different string than the one signed.
 *
 * Canonical string (fields joined by a single line feed, in this order):
 *
 *   METHOD \n PATH \n NONCE \n TIMESTAMP \n SHA256HEX(BODY)
 *
 *   METHOD     uppercase HTTP method, e.g. "POST"
 *   PATH       request target path INCLUDING the query string, e.g.
 *              "/v1/analyze/audit?x=1" ("" for the site root)
 *   NONCE      a per-request random string chosen by the signer (replay guard)
 *   TIMESTAMP  unix seconds, integer, chosen by the signer (staleness guard)
 *   SHA256HEX  lowercase hex SHA-256 of the raw request body bytes
 *              (the empty string's hash for a bodyless GET)
 *
 * The signature is an ECDSA signature over the UTF-8 bytes of that string, made
 * with the P-256 private key and a SHA-256 digest, then base64url-encoded into
 * the `X-Squiggle-Sig` header.
 *
 * Encoding wrinkle: WebCrypto does NOT standardize the byte form of an ECDSA
 * signature. Chrome's `sign` returns a DER `SEQUENCE{r, s}`; Firefox's (and
 * Node's) returns the JOSE raw `r||s` concatenation (RFC 7515). Google's JWTs
 * always carry JOSE-form signatures. Because the signer runs in whichever
 * browser the user has and the verifier runs on Cloudflare Workers,
 * {@link verifyRequest} accepts BOTH encodings (converting as needed) so the
 * protocol works from every runtime without either side knowing the other's
 * preference.
 */

/**
 * The minimal JWK shape for a P-256 ECDSA public key (`x`/`y` are base64url).
 * Declared here instead of using the DOM's `JsonWebKey` so this module
 * typechecks identically under both the extension's DOM lib and the server's
 * WebWorker lib.
 */
export interface P256Jwk {
  kty: 'EC';
  crv: 'P-256';
  x: string;
  y: string;
}

const EC_ALG = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const SIGN_ALG = { name: 'ECDSA', hash: 'SHA-256' } as const;
const encoder = new TextEncoder();

/**
 * Normalize any supported body into bytes. Every branch yields a view backed by
 * a fresh, genuine `ArrayBuffer` (never a `SharedArrayBuffer`): `TextEncoder`
 * allocates one, and the two copy branches allocate one explicitly. That
 * invariant is what makes {@link asBufferSource} below a sound type-level
 * assertion rather than a runtime lie — it holds regardless of which lib
 * (DOM or WebWorker) is in effect, since the difference between them is only in
 * the *declared* generic of the returned `Uint8Array`, not in the buffer.
 */
function toBytes(body: string | ArrayBuffer | Uint8Array | null | undefined): Uint8Array {
  if (body === null || body === undefined) return new Uint8Array(0);
  if (typeof body === 'string') return encoder.encode(body);
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  return new Uint8Array(body);
}

/**
 * WebCrypto's `digest`/`sign`/`verify` accept a `BufferSource`. The strict DOM
 * lib types that as `ArrayBufferView<ArrayBuffer>`, which a plain (loosely
 * typed) `Uint8Array` is not assignable to; the WebWorker lib is looser. Every
 * byte value produced in this module is in fact `ArrayBuffer`-backed (see
 * {@link toBytes}), so this is a compile-time assertion with no runtime cost.
 */
function asBufferSource(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return bytes as Uint8Array<ArrayBuffer>;
}

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64URL_INDEX: ReadonlyMap<string, number> = new Map(
  [...B64URL].map((c, i) => [c, i] as const),
);

/** base64url without padding, implemented by hand so it needs no `btoa`/`atob`. */
export function base64urlEncode(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  const len = bytes.length;
  while (i + 2 < len) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64URL[(n >> 18) & 63] + B64URL[(n >> 12) & 63] + B64URL[(n >> 6) & 63] + B64URL[n & 63];
    i += 3;
  }
  const rem = len - i;
  if (rem === 1) {
    const n = bytes[i] << 16;
    out += B64URL[(n >> 18) & 63] + B64URL[(n >> 12) & 63];
  } else if (rem === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += B64URL[(n >> 18) & 63] + B64URL[(n >> 12) & 63] + B64URL[(n >> 6) & 63];
  }
  return out;
}

export function base64urlDecode(s: string): Uint8Array {
  let b64 = s;
  while (b64.length % 4 !== 0) b64 += '=';
  const out: number[] = [];
  for (let i = 0; i < b64.length; i += 4) {
    const c0 = B64URL_INDEX.get(b64[i]) ?? 0;
    const c1 = B64URL_INDEX.get(b64[i + 1]) ?? 0;
    const pad2 = b64[i + 2] === '=';
    const pad3 = b64[i + 3] === '=';
    const c2 = pad2 ? 0 : (B64URL_INDEX.get(b64[i + 2]) ?? 0);
    const c3 = pad3 ? 0 : (B64URL_INDEX.get(b64[i + 3]) ?? 0);
    const n = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    out.push((n >> 16) & 0xff);
    if (!pad2) out.push((n >> 8) & 0xff);
    if (!pad3) out.push(n & 0xff);
  }
  return Uint8Array.from(out);
}

/** Cryptographically random bytes (WebCrypto, present in every target runtime). */
export function randomBytes(length: number): Uint8Array {
  const b = new Uint8Array(length);
  crypto.getRandomValues(b);
  return b;
}

/**
 * An opaque random token as base64url. Used for extension tokens, web-app
 * sessions, magic-link codes, and the OAuth state / nonce / code-verifier.
 * Default 32 bytes = 256 bits of entropy.
 */
export function randomToken(byteLength = 32): string {
  return base64urlEncode(randomBytes(byteLength));
}

/** Lowercase hex SHA-256 of the given data (a string is UTF-8 encoded first). */
export async function sha256Hex(data: string | ArrayBuffer | Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', asBufferSource(toBytes(data)));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Generate a P-256 ECDSA keypair (extractable, usable for both sign and verify). */
export async function generateSigningKeyPair(): Promise<CryptoKeyPair> {
  // The WebWorker lib types generateKey's result as the loose
  // `CryptoKeyPair | CryptoKey` union (the DOM lib narrows it to CryptoKeyPair
  // for ECDSA); P-256 ECDSA always yields a pair, so the cast is safe in both.
  return (await crypto.subtle.generateKey(EC_ALG, true, ['sign', 'verify'])) as CryptoKeyPair;
}

/** Export a public (or private) ECDSA key as the minimal P-256 JWK shape. */
export async function exportP256Jwk(key: CryptoKey): Promise<P256Jwk> {
  return (await crypto.subtle.exportKey('jwk', key)) as unknown as P256Jwk;
}

/** Import a P-256 JWK as a verify-only key. */
export async function importP256Jwk(jwk: P256Jwk): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk as unknown as JsonWebKey, EC_ALG, true, ['verify']);
}

/**
 * The header names carrying the signature protocol, and the accepted clock
 * skew for the timestamp field. Named here so the extension (sender) and the
 * server (reader) can never disagree on the wire format.
 */
export const SigningHeaders = {
  authorization: 'authorization',
  signature: 'x-squiggle-sig',
  nonce: 'x-squiggle-nonce',
  timestamp: 'x-squiggle-ts',
} as const;

/** Requests whose timestamp differs from the server clock by more than this are rejected. */
export const SIGNATURE_WINDOW_SECONDS = 300;

export interface SigningRequestParts {
  /** HTTP method, any case (normalized to uppercase when building the string). */
  method: string;
  /** Request target path including the query string. */
  path: string;
  /** Per-request random string (replay guard). */
  nonce: string;
  /** Unix seconds (staleness guard). */
  timestamp: number;
  /** Raw request body (string, or binary). Omit / null for a bodyless request. */
  body?: string | ArrayBuffer | Uint8Array | null;
}

/** Build the canonical string that is signed, from the request's parts. */
export async function buildSigningInput(parts: SigningRequestParts): Promise<string> {
  const bodyHash = await sha256Hex(toBytes(parts.body ?? null));
  return [
    parts.method.toUpperCase(),
    parts.path,
    parts.nonce,
    String(Math.trunc(parts.timestamp)),
    bodyHash,
  ].join('\n');
}

/** Sign a canonical string with a private ECDSA key; returns base64url (DER). */
export async function signRequest(key: CryptoKey, input: string): Promise<string> {
  const sig = await crypto.subtle.sign(SIGN_ALG, key, asBufferSource(encoder.encode(input)));
  return base64urlEncode(new Uint8Array(sig));
}

/**
 * Encode a JOSE-form P-256 ECDSA signature (raw `r||s`, 64 bytes, RFC 7515)
 * into the DER `SEQUENCE { INTEGER r, INTEGER s }` form. Each integer is
 * re-encoded in minimal form: leading zero bytes are dropped, and a `0x00`
 * is prepended when the high bit is set (the DER sign-byte rule).
 */
export function joseSignatureToDer(sig: Uint8Array): Uint8Array {
  if (sig.length !== 64) throw new Error('bad JOSE signature length');
  const r = encodeDerInteger(sig.subarray(0, 32));
  const s = encodeDerInteger(sig.subarray(32, 64));
  const total = r.length + s.length;
  const lenBytes = total < 0x80 ? [total] : [0x81, total];
  return new Uint8Array([0x30, ...lenBytes, ...r, ...s]);
}

function encodeDerInteger(field: Uint8Array): number[] {
  let start = 0;
  while (start < field.length - 1 && field[start] === 0) start += 1;
  const body = field.subarray(start, field.length);
  const withSignByte = body[0] & 0x80 ? [0x00, ...body] : [...body];
  return [0x02, withSignByte.length, ...withSignByte];
}

/**
 * Decode a DER P-256 ECDSA signature into the JOSE raw `r||s` form: the DER
 * length/sign-byte framing is stripped and each field is zero-padded to 32
 * bytes. (The inverse of {@link joseSignatureToDer}.)
 */
export function derToJose(der: Uint8Array): Uint8Array {
  const readLen = (p: number): { len: number; next: number } => {
    const first = der[p];
    if (first < 0x80) return { len: first, next: p + 1 };
    const n = first & 0x7f;
    let len = 0;
    for (let i = 0; i < n; i += 1) len = (len << 8) | der[p + 1 + i];
    return { len, next: p + 1 + n };
  };

  let pos = 0;
  if (der[pos++] !== 0x30) throw new Error('not a DER sequence');
  pos = readLen(pos).next;

  const out: number[] = [];
  for (let k = 0; k < 2; k += 1) {
    if (der[pos++] !== 0x02) throw new Error('expected DER INTEGER');
    const { len, next } = readLen(pos);
    pos = next;
    let start = pos;
    if (len > 1 && der[start] === 0x00) start += 1;
    const field = der.subarray(start, pos + len);
    const padded = new Uint8Array(32);
    padded.set(field, 32 - field.length);
    out.push(...padded);
    pos += len;
  }
  return new Uint8Array(out);
}

/**
 * Every byte form a local `crypto.subtle.verify` might require, in order of
 * preference. For P-256 the two forms are length-distinguishable (64 vs
 * 70–72 bytes), so this is exact, not a heuristic.
 */
function p256SignatureCandidates(sig: Uint8Array): Uint8Array[] {
  if (sig.length === 64) return [sig, joseSignatureToDer(sig)];
  if (sig.length > 0 && sig[0] === 0x30) return [sig, derToJose(sig)];
  return [sig];
}

/**
 * Verify a base64url-encoded P-256 ECDSA signature over a canonical string.
 * Accepts either the DER or the JOSE raw encoding of the signature (see the
 * module header) so signatures made in any WebCrypto runtime verify here.
 * Never throws: any malformed signature or key returns `false`.
 */
export async function verifyRequest(key: CryptoKey, input: string, signature: string): Promise<boolean> {
  const bytes = base64urlDecode(signature);
  const message = asBufferSource(encoder.encode(input));
  for (const candidate of p256SignatureCandidates(bytes)) {
    try {
      if (await crypto.subtle.verify(SIGN_ALG, key, asBufferSource(candidate), message)) return true;
    } catch {
      // a candidate that is not parseable by this runtime: try the next
    }
  }
  return false;
}
