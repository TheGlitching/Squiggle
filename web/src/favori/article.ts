/**
 * The article in the page the bookmark "Analyser avec Squiggle" brought to
 * /analyser (`payload.ts`).
 *
 * The extension's extractor (`shared/src/extract/extractor.ts`) decides what
 * the article is, so a page read by the bookmark on a phone and by the
 * extension on a computer gives the same blocks. It runs here rather than in
 * the article's tab only because it is too big to fit in a bookmark.
 */
import { MIN_MESSAGE_CHARS } from '../../../shared/src/engine/message';
import { youtubeVideoId } from '../../../shared/src/engine/video';
import { ArticleExtractor } from '../../../shared/src/extract/extractor';
import { SocialExtractor } from '../../../shared/src/extract/socialExtractor';
import { detectSocialPlatform, isSocialHost, PLATFORM_NAMES } from '../../../shared/src/extract/socialPlatform';
import { FAVORI_PARAM, FAVORI_VALUE, HTML_PARAM, PAGE_PARAM, URL_PARAM, type FavoriPayload } from './payload';

/** Whether these are the fields of a bookmark that brought a page, which takes reading. */
export function carriesPage(params: URLSearchParams): boolean {
  return params.get(FAVORI_PARAM) === FAVORI_VALUE && (params.has(PAGE_PARAM) || params.has(HTML_PARAM));
}

/**
 * Why a social page brought no text: the platform showed only the post's start
 * (Facebook without a session), the post has (almost) no text (a video, a
 * photo), the page is not one post (a profile, a feed, a consent wall), or it
 * is a YouTube video, which is read by its captions.
 */
export type PostProblem = 'cut' | 'no_text' | 'not_a_post' | 'video';

export interface FavoriRead extends FavoriPayload {
  /** The platform of a social page ("Instagram"), when the page was one. */
  network?: string;
  /** Why the social page brought no text; `text` is empty then. */
  problem?: PostProblem;
}

/** The article, or the social post, in the page the bookmark brought. */
export async function readFavori(params: URLSearchParams): Promise<FavoriRead> {
  const page = params.get(PAGE_PARAM);
  const html = page === null ? (params.get(HTML_PARAM) ?? '') : await gunzipBase64(page);
  const url = params.get(URL_PARAM) ?? '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  // Relative links resolve against the article's address, not this page's.
  if (url && !doc.querySelector('base[href]')) {
    const base = doc.createElement('base');
    base.href = url;
    doc.head.prepend(base);
  }

  const social = readPost(doc, url);
  if (social) return social;

  const article = new ArticleExtractor(doc).extract();
  const title = article.metadata.title.replace(/\s+/g, ' ').trim();
  const lines = article.blocks.map((block) => block.cleanText);
  // The headline is the title; it is not also the first paragraph.
  if (lines[0] === title) lines.shift();
  // Without a canonical link the extractor falls back on this page's own address.
  const canonical = article.metadata.canonicalUrl;
  return { title, url: canonical && canonical !== window.location.href ? canonical : url, text: lines.join('\n') };
}

/** A social page's post, or why it has none; null off the social sites. */
function readPost(doc: Document, url: string): FavoriRead | null {
  if (youtubeVideoId(url)) return { title: '', url, text: '', network: 'YouTube', problem: 'video' };
  let host = '';
  let path = '';
  try {
    ({ hostname: host, pathname: path } = new URL(url));
  } catch {
    return null;
  }
  const match = detectSocialPlatform(host, path);
  if (!match) return isSocialHost(host) ? { title: '', url, text: '', problem: 'not_a_post' } : null;
  const network = PLATFORM_NAMES[match.platform];
  const post = new SocialExtractor(doc, match.platform, url).extract();
  const title = post?.metadata.title ?? '';
  const address = post?.metadata.canonicalUrl || url;
  if (post?.truncated) return { title, url: address, text: '', network, problem: 'cut' };
  const lines = (post?.blocks ?? []).filter((block) => !block.isHeading).map((block) => block.cleanText);
  if (lines.join(' ').length < MIN_MESSAGE_CHARS) return { title, url: address, text: '', network, problem: 'no_text' };
  return { title, url: address, text: lines.join('\n'), network };
}

async function gunzipBase64(base64: string): Promise<string> {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}
