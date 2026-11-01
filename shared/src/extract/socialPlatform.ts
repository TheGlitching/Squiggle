/**
 * Social platform classification.
 *
 * The extension's content script and the web app's bookmark reader
 * (`web/src/favori/article.ts`) both serve every page, but a social post is not
 * an article: on X a single tweet is its own `<article>` node, and on Instagram
 * the caption the reader sees is cut after one line, so the semantic
 * extractor's "pick the article with the most words" would grab a fragment of
 * a thread, or a line of interface, and call it the story. Before the article
 * extractor ever runs, this module asks whether the page is one post (or one
 * thread) worth reading as a coherent piece - and if it is, which platform's
 * page to read.
 *
 * The classification is deliberately narrow: it returns a platform only for
 * the address of one post. A profile, a home timeline or a search is a stream
 * of unrelated posts, not a text, so it stays unclassified, and the readers
 * say so rather than read the stream (`isSocialHost`).
 */

export type SocialPlatform = 'x' | 'threads' | 'instagram' | 'facebook' | 'tiktok';

/** The platform's name, as a reader knows it and as a report's title gives it. */
export const PLATFORM_NAMES: Record<SocialPlatform, string> = {
  x: 'X',
  threads: 'Threads',
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
};

export interface SocialPlatformMatch {
  platform: SocialPlatform;
  /** The path that made it a post or a thread (e.g. `/handle/status/123`). */
  threadPath?: string;
}

/**
 * Every host of the platforms above, with or without `www.` or `m.`. Kept as
 * one expression so the bookmark (`web/src/favori/lecture.ts`) can carry it
 * without the rest of this module; `LectureActivity.SOCIAL` in the Android app
 * is its copy.
 */
export const SOCIAL_HOST =
  /^(?:(?:www|m|mobile|web)\.)?(?:x\.com|twitter\.com|threads\.com|threads\.net|instagram\.com|facebook\.com|fb\.watch|tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com)$/i;

const POST_PATHS: Record<SocialPlatform, { hosts: RegExp; path: RegExp }> = {
  x: { hosts: /^(?:x|twitter)\.com$/, path: /^\/[^/]+\/status\/\d+/i },
  threads: { hosts: /^threads\.(?:com|net)$/, path: /^\/@[^/]+\/post\/[\w-]+/i },
  // A post, a reel or a video, with or without the account's name before it.
  instagram: { hosts: /^instagram\.com$/, path: /^\/(?:[\w.]+\/)?(?:p|reels?|tv)\/[\w-]+/i },
  // Facebook names a post a dozen ways, the share links included (they redirect in the reader's page).
  facebook: {
    hosts: /^facebook\.com$/,
    path: /^\/(?:story\.php|permalink\.php|photo(?:\.php)?\/?|watch\/?|reel\/|share\/|groups\/[^/]+\/(?:posts|permalink)\/|[^/]+\/(?:posts|videos|photos)\/)/i,
  },
  tiktok: { hosts: /^tiktok\.com$/, path: /^\/(?:@[^/]+\/(?:video|photo)\/\d+|t\/[\w-]+)/i },
};

/** The short links the apps share, a post whatever their path: they redirect to it. */
const SHORT_LINKS: Record<string, SocialPlatform> = {
  'fb.watch': 'facebook',
  'vm.tiktok.com': 'tiktok',
  'vt.tiktok.com': 'tiktok',
};

function normalizeHost(host: string): string {
  return (host || '').trim().toLowerCase().replace(/^(?:www|m|mobile|web)\./, '');
}

/**
 * Classifies a host + path into the platform of the one post the page shows,
 * or null when the page is not one. Kept pure so tests drive the registry
 * without a browser.
 */
export function detectSocialPlatform(hostname: string, pathname: string): SocialPlatformMatch | null {
  const host = normalizeHost(hostname);
  const path = pathname ?? '';
  const short = SHORT_LINKS[host];
  if (short) return path.length > 1 ? { platform: short, threadPath: path } : null;
  for (const platform of Object.keys(POST_PATHS) as SocialPlatform[]) {
    const rule = POST_PATHS[platform];
    if (rule.hosts.test(host)) return rule.path.test(path) ? { platform, threadPath: path } : null;
  }
  return null;
}

/** True for a social host whatever the path: a profile or a lone post opened as a page. */
export function isSocialHost(hostname: string): boolean {
  return SOCIAL_HOST.test((hostname || '').trim());
}
