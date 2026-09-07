/**
 * Shared fetch primitives for reading a page an article cites, used by both
 * the research stage (when the agent decides to read a cited source) and the
 * source-verification stage (the systematic read of every cited source).
 * Keeping them in one module means the two consumers cannot drift apart in
 * the size cap, the timeout, or what counts as a fetchable page.
 */

/** Cap on a single fetched page, so one pathological site cannot blow the memory budget. */
export const MAX_PAGE_BYTES = 1_000_000;

/** Only http(s) URLs can be fetched by the service worker; anything else is a non-source. */
export function fetchableUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
  } catch {
    return null;
  }
}

/**
 * Lightweight HTML-to-text for pages fetched in the service worker, where no
 * DOM exists. The output is raw reading material for the judge, never
 * presented to the reader as structured content, so a deliberately simple
 * pass - drop script/style/svg blocks, turn tags into line breaks, decode
 * entities, collapse whitespace, cap the length - is honest enough as long as
 * everything handed to the judge is labelled as raw extracted text.
 */
export function extractPageText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|template|svg|iframe|canvas)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Fetches one page and reduces it to readable text, bounded by a per-fetch
 * timeout and a byte cap. Rejects with a plain Error so the caller can decide
 * how a single failed page weighs on the run.
 */
export async function fetchPageText(
  url: string,
  fetchTimeoutMs: number,
  fetchImpl: typeof fetch
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), fetchTimeoutMs);

  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { accept: 'text/html,application/xhtml+xml' }
    });

    const contentType = response.headers.get('content-type') ?? '';
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`);
    }
    if (!contentType.includes('text/html') && !contentType.includes('xhtml')) {
      throw new Error(`type de contenu non exploitable : ${contentType || 'inconnu'}`);
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_PAGE_BYTES) {
      throw new Error(`page trop volumineuse (${buffer.byteLength} octets)`);
    }
    return extractPageText(new TextDecoder().decode(buffer));
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* Server-side safe fetch (SSRF guard)                                 */
/* ------------------------------------------------------------------ */

/**
 * `fetchPageText` above is safe where it runs today — the extension's service
 * worker — because a browser will not route an extension's fetch to a private
 * address, and its network layer already refuses most of it. The same call,
 * executed on OUR server, is a different animal: a hostile (or merely
 * broken) article can list as "cited source" a URL pointing at 127.0.0.1,
 * the 169.254.169.254 cloud metadata endpoint, or any RFC1918 host, and a
 * naive server fetch would read it and feed it to the model.
 *
 * `safeFetchPageText` is the server-side replacement. It is deliberately
 * stricter than the browser path, because the threat model is different:
 *
 *  1. only http(s) URLs, on the initial target AND after every redirect —
 *  2. a hostname policy: private/loopback/link-local (incl. the metadata
 *     address)/CGNAT/ULA ranges, localhost-style names, and non-canonical
 *     numeric encodings (decimal, octal, hex IPs) are rejected outright, on
 *     the initial target AND after every redirect;
 *  3. redirects are never followed by the fetcher itself: each 3xx is
 *     followed manually and re-validated, which closes the
 *     "public domain that 302s to an internal address" and DNS-rebinding
 *     variants;
 *  4. optionally a `lookup` hook (Node-style DNS resolution): when provided,
 *     every hop's hostname must resolve to public addresses only. This is
 *     the strongest tier and is for runtimes that CAN reach private
 *     networks. On Cloudflare Workers the platform itself cannot route to
 *     private address space, so the pattern-based tiers (1-3) are the
 *     operative defence there; the hook stays as defense in depth for any
 *     other runtime we might move to.
 */

/** How many redirect hops a cited source may follow before we stop. */
export const SSRF_MAX_REDIRECTS = 3;

/** Thrown when the hostname policy rejects a target. Not a network error. */
export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfBlockedError';
  }
}

interface Cidr {
  base: number;
  bits: number;
}

/** IPv4 ranges that must never be reachable from a server-side fetch. */
const PRIVATE_V4_CIDRS: Cidr[] = [
  { base: 0x00000000, bits: 8 }, // 0.0.0.0/8 — this network
  { base: 0x0a000000, bits: 8 }, // 10/8 — RFC1918
  { base: 0x64400000, bits: 10 }, // 100.64/10 — CGNAT
  { base: 0x7f000000, bits: 8 }, // 127/8 — loopback
  { base: 0xa9fe0000, bits: 16 }, // 169.254/16 — link-local, incl. the 169.254.169.254 metadata endpoint
  { base: 0xac100000, bits: 12 }, // 172.16/12 — RFC1918
  { base: 0xc0000000, bits: 24 }, // 192.0.0/24 — IETF protocol assignments
  { base: 0xc0a80000, bits: 16 }, // 192.168/16 — RFC1918
  { base: 0xc6120000, bits: 15 }, // 198.18/15 — benchmarking
  { base: 0xe0000000, bits: 4 }, // 224/3 — multicast
  { base: 0xf0000000, bits: 4 }, // 240/4 — reserved, incl. the 255.255.255.255 broadcast
];

const INTERNAL_HOSTNAME_PATTERNS: RegExp[] = [
  /^localhost$/,
  /\.localhost$/,
  /\.local$/,
  /\.internal$/,
  /\.lan$/,
  /^internal$/,
];

function stripBrackets(host: string): string {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

function ipv4ToLong(dotted: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(dotted);
  if (!m) return null;
  let long = 0;
  for (let i = 1; i <= 4; i++) {
    const octet = m[i];
    if (octet.length > 1 && octet.startsWith('0')) return null;
    const n = Number(octet);
    if (n > 255) return null;
    long = (long << 8) | n;
  }
  return long >>> 0;
}

function isPrivateIpv4(dotted: string): boolean {
  const long = ipv4ToLong(dotted);
  if (long === null) return false;
  return PRIVATE_V4_CIDRS.some(({ base, bits }) => long >>> (32 - bits) === base >>> (32 - bits));
}

function isPrivateIpv6(host: string): boolean {
  const h = stripBrackets(host).toLowerCase();
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) — the private-ness lives in the v4 part.
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(h);
  if (mapped) return isPrivateIpv4(mapped[1]);
  if (h === '::' || h === '::1') return true;
  const firstHextet = h.split(':')[0];
  if (/^f[cd][0-9a-f]{2}$/.test(firstHextet)) return true; // fc00::/7 — ULA
  if (/^fe[89ab][0-9a-f]/.test(firstHextet)) return true; // fe80::/10 — link-local
  return false;
}

/**
 * Rejects hostnames that identify a non-public target. Pure string policy —
 * no I/O, so it can be applied to every redirect hop before any request is
 * made. Throws `SsrfBlockedError` (not a plain Error) so a caller can tell
 * "refused by policy" apart from "the network said no".
 */
export function assertPublicHost(hostname: string): void {
  const bare = stripBrackets(hostname.toLowerCase());
  if (!bare) throw new SsrfBlockedError('hôte vide');

  if (isPrivateIpv4(bare) || isPrivateIpv6(bare)) {
    throw new SsrfBlockedError(`adresse interne interdite : ${hostname}`);
  }

  // Non-canonical numeric encodings of an IP (decimal "2130706433", octal
  // "0177.0.0.1", hex "0x7f.0.0.1", leading-zero octets): some stacks resolve
  // these, so a hostile URL could smuggle 127.0.0.1 past a dotted-quad check.
  if (/^0x[0-9a-f]+/i.test(bare) || /^0[0-7]+$/.test(bare)) {
    throw new SsrfBlockedError(`encodage d'adresse non canonique : ${hostname}`);
  }
  if (/^\d{1,10}$/.test(bare)) {
    const long = Number(bare);
    const dotted = [24, 16, 8, 0].map((shift) => (long >>> shift) & 255).join('.');
    if (isPrivateIpv4(dotted)) {
      throw new SsrfBlockedError(`adresse interne interdite : ${hostname}`);
    }
    return;
  }
  // Any all-numeric dotted form with a leading-zero octet is a non-canonical
  // address encoding (octal "0177.0.0.1" et al.) — refuse it as such.
  if (/^\d+(\.\d+)*$/.test(bare) && bare.split('.').some((o) => o.length > 1 && o.startsWith('0'))) {
    throw new SsrfBlockedError(`encodage d'adresse non canonique : ${hostname}`);
  }

  for (const pattern of INTERNAL_HOSTNAME_PATTERNS) {
    if (pattern.test(bare)) {
      throw new SsrfBlockedError(`nom d'hôte interne interdit : ${hostname}`);
    }
  }
}

async function guardHost(hostname: string, lookup?: (hostname: string) => Promise<string[]>): Promise<void> {
  assertPublicHost(hostname);
  if (!lookup) return;
  const addresses = await lookup(hostname);
  for (const address of addresses) {
    if (isPrivateIpv4(stripBrackets(address)) || isPrivateIpv6(address)) {
      throw new SsrfBlockedError(`hôte résolu vers une adresse interne : ${hostname} → ${address}`);
    }
  }
}

export interface ServerSafeFetchOptions {
  /**
   * Optional DNS pre-resolution (Node-style `dns.promises.lookup` shape).
   * When given, every hop's hostname must resolve to public addresses only.
   * Omit on runtimes (like Workers) that cannot reach private networks at all.
   */
  lookup?: (hostname: string) => Promise<string[]>;
  /** Redirect hops to follow at most. Defaults to {@link SSRF_MAX_REDIRECTS}. */
  maxRedirects?: number;
  /** Injectable fetch; defaults to the runtime's global fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * The server-side page fetch: same timeout, same byte cap, same HTML check as
 * {@link fetchPageText}, plus the SSRF guard on the initial target and on
 * every redirect hop. Rejects with `SsrfBlockedError` when the hostname
 * policy refuses, plain `Error` for everything else, so the research and
 * verification stages can degrade a single failed source exactly as they do
 * for a dead browser-side fetch.
 */
export async function safeFetchPageText(
  url: string,
  fetchTimeoutMs: number,
  options: ServerSafeFetchOptions = {}
): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxRedirects = options.maxRedirects ?? SSRF_MAX_REDIRECTS;

  let current = new URL(url);
  if (current.protocol !== 'https:' && current.protocol !== 'http:') {
    throw new Error(`type de contenu non exploitable : ${current.protocol}`);
  }
  await guardHost(current.hostname, options.lookup);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), fetchTimeoutMs);

  try {
    let response = await fetchImpl(current.href, {
      signal: controller.signal,
      redirect: 'manual',
      headers: { accept: 'text/html,application/xhtml+xml' }
    });

    let hops = 0;
    while (response.status === 301 || response.status === 302 || response.status === 303 || response.status === 307 || response.status === 308) {
      if (hops >= maxRedirects) {
        throw new Error(`trop de redirections (${maxRedirects})`);
      }
      const location = response.headers.get('location');
      if (!location) {
        throw new Error(`redirection HTTP ${response.status} sans en-tête Location`);
      }
      current = new URL(location, current);
      if (current.protocol !== 'https:' && current.protocol !== 'http:') {
        throw new SsrfBlockedError(`redirection vers un schéma interdit : ${current.protocol}`);
      }
      await guardHost(current.hostname, options.lookup);
      hops += 1;
      response = await fetchImpl(current.href, {
        signal: controller.signal,
        redirect: 'manual',
        headers: { accept: 'text/html,application/xhtml+xml' }
      });
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`);
    }
    if (!contentType.includes('text/html') && !contentType.includes('xhtml')) {
      throw new Error(`type de contenu non exploitable : ${contentType || 'inconnu'}`);
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_PAGE_BYTES) {
      throw new Error(`page trop volumineuse (${buffer.byteLength} octets)`);
    }
    return extractPageText(new TextDecoder().decode(buffer));
  } finally {
    clearTimeout(timer);
  }
}
