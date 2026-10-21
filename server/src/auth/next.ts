/**
 * Where a reader lands once a sign-in finishes.
 *
 * The destination travels through a hop the server does not control (Google,
 * a mailbox), so it is stored server-side with the handshake and only ever
 * taken from this allowlist: the account page, or the extension bridge with
 * both of its parameters. Anything else - another origin, a protocol-relative
 * URL, an unknown path - is dropped and the caller falls back to `/compte`.
 */

export const DEFAULT_NEXT = '/compte';

/** A bridge URL carries a JWK, so it is long; this is a bound, not a target. */
const MAX_NEXT_LENGTH = 2048;
/** Never resolved against, only compared with: a parsed internal path keeps this origin. */
const PROBE_ORIGIN = 'https://squiggle.invalid';

/** The normalised internal destination, or null when `raw` is not on the allowlist. */
export function sanitizeNext(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_NEXT_LENGTH) return null;
  // URL parsing quietly turns `\` into `/` and strips tabs and newlines, which
  // would let `/\evil.example` or `/\t/evil.example` read as `//evil.example`.
  // eslint-disable-next-line no-control-regex
  if (!raw.startsWith('/') || raw.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(raw)) return null;

  let url: URL;
  try {
    url = new URL(raw, PROBE_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== PROBE_ORIGIN) return null;

  if (url.pathname === '/compte') return DEFAULT_NEXT;
  if (url.pathname === '/pont') {
    const ext = url.searchParams.get('ext')?.trim();
    const pub = url.searchParams.get('pub')?.trim();
    if (!ext || !pub) return null;
    // Rebuilt rather than echoed, so nothing but the two bridge parameters survives.
    return `/pont?${new URLSearchParams({ ext, pub }).toString()}`;
  }
  return null;
}
