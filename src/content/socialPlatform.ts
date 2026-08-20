/**
 * Social platform classification.
 *
 * The content script serves every page, but a social platform is not an
 * article: on X a single tweet is its own `<article>` node, so the semantic
 * extractor's "pick the article with the most words" would grab one fragment
 * of a thread and call it the story. Before the article extractor ever runs,
 * this module asks whether the page is a social thread worth assembling as a
 * coherent piece - and if it is, which platform's DOM to parse.
 *
 * The classification is deliberately narrow: returning a platform only for
 * the views that make sense to analyze. An X /status/:id page is a thread
 * (or a single post) and is analyzable; the home timeline is a stream of
 * unrelated accounts, not an article, so it stays unclassified and the normal
 * extractor (or a refusal) decides. New platforms slot into the registry
 * under the same shape.
 */

export type SocialPlatform = 'x';

export interface SocialPlatformMatch {
  platform: SocialPlatform;
  /** The path that made it a thread, when one did (e.g. `/handle/status/123`). */
  threadPath?: string;
}

const X_HOSTS = new Set(['x.com', 'twitter.com', 'www.x.com', 'www.twitter.com']);

function normalizeHost(host: string): string {
  return (host || '').trim().toLowerCase().replace(/^www\./, '');
}

/** An X status/thread page: the path carries a username then `/status/<id>`. */
function classifyX(host: string, path: string): SocialPlatformMatch | null {
  if (!X_HOSTS.has(host)) return null;
  const statusMatch = /^\/([^/?#]+)\/status\/(\d+)/i.exec(path ?? '');
  if (!statusMatch) return null;
  return { platform: 'x', threadPath: path };
}

/**
 * Classifies a host + path into a social platform whose thread layout we know
 * how to read, or null when the page is not one. Kept pure so tests drive the
 * registry without a browser.
 */
export function detectSocialPlatform(hostname: string, pathname: string): SocialPlatformMatch | null {
  const host = normalizeHost(hostname);
  return classifyX(host, pathname);
}