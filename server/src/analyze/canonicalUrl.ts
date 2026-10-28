/**
 * The shared cache key.
 *
 * Two readers opening "the same article" rarely send the same string: one
 * arrives from a newsletter with `utm_*` parameters, another from a social
 * app with `fbclid`, a third with a `#section` anchor. Keying the cache on the
 * raw URL would give each of them a separate, separately-billed analysis of
 * one article, which is exactly the saving the shared cache exists to make.
 *
 * The canonical form is computed HERE, on the server, and never taken from the
 * client: the key decides which stored report a reader is served, so letting a
 * client name it would let a poisoned page be served under another article's
 * address.
 *
 * The normalisation is deliberately conservative — it only removes what is
 * known to be reader-identifying or campaign tracking, or to name a rendering
 * of the same page (its mobile or AMP edition, or Google's AMP cache). A query parameter this
 * list does not know stays in the key, because on many sites (`?p=1234`,
 * `?articleId=…`) it *is* the article.
 */
import { sha256Hex, youtubeVideoId, youtubeWatchUrl } from '@squiggle/shared';

/** Query parameters that never change which article is being read. */
const TRACKING_PARAMS = [
  /^utm_/i,
  /^ga_/i,
  /^mc_/i,
  /^pk_/i,
  /^ref$/i,
  /^ref_src$/i,
  /^fbclid$/i,
  /^gclid$/i,
  /^dclid$/i,
  /^msclkid$/i,
  /^igshid$/i,
  /^twclid$/i,
  /^s_kwcid$/i,
  /^xtor$/i,
  /^at_medium$/i,
  /^at_campaign$/i,
  /^_ga$/i,
  /^yclid$/i,
  // The AMP and app-share variants of a page, which serve the same article.
  /^amp$/i,
  /^_amp$/i,
  /^amp_js_v$/i,
  /^amp_gsa$/i,
  /^usqp$/i,
  /^_gl$/i,
];

function isTracking(name: string, value: string): boolean {
  return TRACKING_PARAMS.some((re) => re.test(name)) || (/^outputtype$/i.test(name) && /^amp$/i.test(value));
}

/**
 * Subdomains that name a rendering of a site, not another site: the mobile
 * and AMP editions of `lemonde.fr` publish the articles of `lemonde.fr`.
 */
const EDITION_PREFIX = /^(?:www|m|mobile|amp)\./;

/**
 * The publisher's own address behind an AMP cache link: Google's
 * `cdn.ampproject.org/c/s/<host>/<path>` and `google.com/amp/s/<host>/<path>`.
 */
function unwrapAmpCache(url: URL): URL {
  const host = url.hostname.toLowerCase();
  const path =
    host.endsWith('.cdn.ampproject.org')
      ? /^\/[cv](?:\/s)?\/(.+)$/.exec(url.pathname)
      : /^(?:www\.)?google\.[a-z.]+$/.test(host)
        ? /^\/amp\/(?:s\/)?(.+)$/.exec(url.pathname)
        : null;
  if (!path) return url;
  try {
    return new URL(`https://${path[1]}${url.search}`);
  } catch {
    return url;
  }
}

/** A page's path without its AMP marker: `/amp/x`, `/x/amp`, `/x.amp.html`, `/x.amp`. */
function withoutAmpPath(pathname: string): string {
  return pathname
    .replace(/^\/amp(?=\/)/i, '')
    .replace(/\/amp\/?$/i, '')
    .replace(/\.amp(\.html?)$/i, '$1')
    .replace(/\.amp$/i, '');
}

/**
 * The canonical form of an article URL, or null when the string is not an
 * http(s) URL at all (the only kind a reader can be looking at).
 */
export function canonicalArticleUrl(raw: string): string | null {
  // Every link to one video is one address: the extension's watch page, the
  // app's `youtu.be/<id>?si=…`, a Short, a link timed with `&t=90s`.
  const videoId = youtubeVideoId(raw.trim());
  let parsed: URL;
  try {
    parsed = new URL(videoId ? youtubeWatchUrl(videoId) : raw.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  parsed = unwrapAmpCache(parsed);

  // http and https of the same page are the same page.
  parsed.protocol = 'https:';
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  const site = host.replace(EDITION_PREFIX, '');
  // Only while a domain is left: `m.fr` is a site, not the mobile edition of `fr`.
  parsed.hostname = site.includes('.') ? site : host;
  parsed.pathname = withoutAmpPath(parsed.pathname) || '/';
  parsed.port = '';
  parsed.hash = '';
  parsed.username = '';
  parsed.password = '';

  const kept = [...parsed.searchParams.entries()].filter(([name, value]) => !isTracking(name, value));
  kept.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  parsed.search = '';
  for (const [name, value] of kept) parsed.searchParams.append(name, value);

  // "/article/" and "/article" are one page; "/" is not the same as "".
  if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  }

  return parsed.toString();
}

/**
 * Where a text pasted into the web app without its address is filed. Such a
 * report is then keyed by the fingerprint of its text alone, which is what
 * already tells two readers of one address apart: the same words get the same
 * report, any other words a different one. It is not an http(s) URL, so no
 * canonical article address can ever equal it.
 */
export const PASTED_TEXT_KEY = 'squiggle:texte-colle';

/**
 * The canonical form of a payload's address: an article's canonical URL, the
 * pasted-text key when there is none, or null when the string given is not an
 * http(s) page.
 */
export function canonicalAddress(raw: string | undefined): string | null {
  return raw === undefined ? PASTED_TEXT_KEY : canonicalArticleUrl(raw);
}

/** SHA-256 hex of the canonical address. This is what the cache and the logs use. */
export async function articleUrlHash(raw: string | undefined): Promise<string | null> {
  const canonical = canonicalAddress(raw);
  return canonical === null ? null : sha256Hex(canonical);
}
