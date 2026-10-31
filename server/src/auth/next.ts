/**
 * Where a reader lands once a sign-in finishes.
 *
 * The destination travels through a hop the server does not control (Google,
 * a mailbox), so it is stored server-side with the handshake and only ever
 * taken from this allowlist: the account page, the analysis page (or one
 * report on it, by its fingerprint), or the extension bridge with both of its
 * parameters. Anything else - another
 * origin, a protocol-relative URL, an unknown path - is dropped and the caller
 * falls back to `/compte`.
 */

export const DEFAULT_NEXT = '/compte';

/**
 * The analysis page, reached from the sign-in a visitor's report offers. It
 * marks nothing but where the reader lands; the server counts an account
 * created on it as one opened after an analysis without an account.
 */
export const AFTER_ANON_NEXT = '/analyser?apres=essai';

/**
 * The same, from a report whose findings past the first were kept back: an
 * account created on it is counted as one opened from such a report too.
 */
export const AFTER_WITHHELD_NEXT = '/analyser?apres=flou';

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
  // Nothing of the pasted text travels: it waits in the reader's own browser.
  // A forwarded e-mail's report is named by its text's fingerprint alone.
  if (url.pathname === '/analyser') {
    const report = url.searchParams.get('rapport');
    if (report && /^[0-9a-f]{64}$/.test(report)) return `/analyser?rapport=${report}`;
    const after = url.searchParams.get('apres');
    return after === 'essai' ? AFTER_ANON_NEXT : after === 'flou' ? AFTER_WITHHELD_NEXT : '/analyser';
  }
  if (url.pathname === '/pont') {
    const ext = url.searchParams.get('ext')?.trim();
    const pub = url.searchParams.get('pub')?.trim();
    if (!ext || !pub) return null;
    // Rebuilt rather than echoed, so nothing but the two bridge parameters survives.
    return `/pont?${new URLSearchParams({ ext, pub }).toString()}`;
  }
  return null;
}
