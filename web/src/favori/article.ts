/**
 * The article in the page the bookmark "Analyser avec Squiggle" brought to
 * /analyser (`payload.ts`).
 *
 * The extension's extractor (`shared/src/extract/extractor.ts`) decides what
 * the article is, so a page read by the bookmark on a phone and by the
 * extension on a computer gives the same blocks. It runs here rather than in
 * the article's tab only because it is too big to fit in a bookmark.
 */
import { ArticleExtractor } from '../../../shared/src/extract/extractor';
import { FAVORI_PARAM, FAVORI_VALUE, HTML_PARAM, PAGE_PARAM, URL_PARAM, type FavoriPayload } from './payload';

/** Whether these are the fields of a bookmark that brought a page, which takes reading. */
export function carriesPage(params: URLSearchParams): boolean {
  return params.get(FAVORI_PARAM) === FAVORI_VALUE && (params.has(PAGE_PARAM) || params.has(HTML_PARAM));
}

/** The article in the page the bookmark brought. */
export async function readFavori(params: URLSearchParams): Promise<FavoriPayload> {
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

  const article = new ArticleExtractor(doc).extract();
  const title = article.metadata.title.replace(/\s+/g, ' ').trim();
  const lines = article.blocks.map((block) => block.cleanText);
  // The headline is the title; it is not also the first paragraph.
  if (lines[0] === title) lines.shift();
  // Without a canonical link the extractor falls back on this page's own address.
  const canonical = article.metadata.canonicalUrl;
  return { title, url: canonical && canonical !== window.location.href ? canonical : url, text: lines.join('\n') };
}

async function gunzipBase64(base64: string): Promise<string> {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}
