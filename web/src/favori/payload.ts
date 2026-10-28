/**
 * What the bookmark "Analyser avec Squiggle" hands to /analyser.
 *
 * It travels in the address's fragment, after `#`: a browser never sends the
 * fragment to any server, so the page goes from the reader's tab to the
 * reader's /analyser without passing through ours, exactly as a paste does.
 * `via=favori` tells the page to start the analysis at once.
 *
 * The bookmark carries the article's page, not its text: the extractor that
 * finds the article runs on /analyser (`article.ts`), because Chrome on Android
 * cuts an address pasted into a bookmark at 5,000 characters, and the
 * extractor alone is twice that. `page` is the page's HTML, gzipped then in
 * base64; `html` is the same HTML as is, from a browser with no
 * `CompressionStream`. A bookmark saved before carries the iPhone shortcut's
 * form (`#title=…&text=…&url=…`, read by `sharedParams` in `paste.ts`), which
 * /analyser still reads.
 */
export const FAVORI_PARAM = 'via';
export const FAVORI_VALUE = 'favori';
export const PAGE_PARAM = 'page';
export const HTML_PARAM = 'html';
/** The address of the page the bookmark read, as the reader had it. */
export const URL_PARAM = 'url';

export interface FavoriPayload {
  title: string;
  /** The article's address, a label and a cache key as with a paste: nothing fetches it. */
  url: string;
  /** One block of the article per line, as a paste has them. */
  text: string;
}

/** The fragment that carries a page's HTML, `#` included. */
export async function pageFragment(html: string, url: string): Promise<string> {
  const page: Record<string, string> =
    typeof CompressionStream === 'undefined' ? { [HTML_PARAM]: html } : { [PAGE_PARAM]: await gzipBase64(html) };
  return `#${new URLSearchParams({ ...page, [URL_PARAM]: url, [FAVORI_PARAM]: FAVORI_VALUE })}`;
}

async function gzipBase64(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = '';
  // In slices: one call with a whole page's bytes as arguments overflows the stack.
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
