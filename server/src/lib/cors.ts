/**
 * Origin policy.
 *
 * Two different jobs get confused under the single word "CORS", and this
 * module keeps them apart.
 *
 * **Reading our responses.** A browser will only hand a response to a page
 * whose origin we echo in `access-control-allow-origin`. We echo exactly one
 * of a small pinned set — the web app and our two store listings — and never
 * a wildcard, so no other page can read anything we return.
 *
 * **Being called at all.** That is the CSRF question, and it is the one an
 * `Origin` header actually answers: a page cannot forge the header, so an
 * allowed `Origin` proves the caller is one of our own surfaces. Which
 * endpoints must prove it is a judgement call, not a blanket rule:
 *
 *  - The cookie-authenticated, state-changing endpoints must. Those are the
 *    real CSRF targets — `/auth/claim` mints an extension token from a
 *    session cookie, `/auth/magic-link` sends mail, `/auth/logout` destroys a
 *    session — and every one of them is reached from the web app by `fetch`,
 *    which always sets `Origin`. A request arriving at them WITHOUT an
 *    `Origin` is refused, not just one arriving with the wrong origin: some
 *    frameworks default the other way and that default is a hole.
 *
 *  - The OAuth redirects (`/auth/google`, `/auth/google/callback`) must not.
 *    They are top-level browser navigations, which carry no `Origin` by
 *    design; requiring one there would break sign-in for everyone. Their
 *    anti-forgery control is the OAuth `state` parameter, which is what it
 *    exists for.
 *
 *  - `/v1/*` does not require one either, and that is deliberate. Every call
 *    there carries an ECDSA signature over method, path, nonce, timestamp and
 *    a hash of the body, verified against the P-256 key bound to that install
 *    — strictly stronger evidence than a header, and evidence a web page
 *    cannot produce at all. Requiring `Origin` on top would add nothing
 *    against a browser attacker and would risk breaking extension-initiated
 *    requests, whose `Origin` handling differs between Chrome and Firefox.
 *    A *mismatched* origin is still refused everywhere.
 */

/** Endpoints where a request must prove it came from one of our own surfaces. */
const ORIGIN_REQUIRED: ReadonlyArray<{ method: string; path: string }> = [
  { method: 'POST', path: '/auth/magic-link' },
  { method: 'POST', path: '/auth/magic-link/verify' },
  { method: 'POST', path: '/auth/logout' },
  { method: 'GET', path: '/auth/claim' },
  { method: 'POST', path: '/auth/claim' },
  // The browser-session account namespace. These carry the reader's cookie
  // and change state (a subscription, a portal, a bridge code), so a request
  // without an Origin is refused rather than trusted.
  { method: 'GET', path: '/web/account' },
  { method: 'POST', path: '/web/account/checkout' },
  { method: 'POST', path: '/web/account/portal' },
  { method: 'POST', path: '/web/bridge/code' },
];

export function originRequired(method: string, path: string): boolean {
  return ORIGIN_REQUIRED.some((entry) => entry.method === method && entry.path === path);
}

export function corsHeaders(origin: string): Record<string, string> {
  return {
    'access-control-allow-origin': origin,
    // Safe only because the allowed set is an explicit allowlist and never a
    // wildcard: the session cookie has to travel for the web app to reach the
    // API at all when the two sit on different hosts.
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type, x-squiggle-sig, x-squiggle-nonce, x-squiggle-ts',
    'access-control-expose-headers': 'x-squiggle-request-id',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}
