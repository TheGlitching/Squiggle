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
