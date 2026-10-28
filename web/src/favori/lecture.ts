/**
 * The article as the bookmark reads it, in the reader's own page.
 *
 * The extension's extractor (`shared/src/extract/extractor.ts`) decides what
 * the article is, so a page read by the bookmark on a phone and by the
 * extension on a computer gives the same blocks. Some sites render the end of
 * a long article only as the reader scrolls to it, so the page is scrolled
 * through the article first, then read, then put back where the reader was.
 */
import { ArticleExtractor } from '../../../shared/src/extract/extractor';
import type { FavoriPayload } from './payload';

/** Long enough for a lazy site to render what scrolled into view. */
const STEP_MS = 150;
/** A long article on a slow phone, and never longer: a page that keeps growing is cut here. */
const MAX_SCROLL_MS = 15_000;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Scroll down a screen at a time until the article's end is in view and stays
 * there, or the page will not scroll (a consent wall, a page that scrolls an
 * inner box): what is rendered by then is what is read.
 */
export async function scrollThrough(article: Element, win: Window = window): Promise<void> {
  const deadline = Date.now() + MAX_SCROLL_MS;
  const doc = win.document.documentElement;
  let settled = 0;
  while (Date.now() < deadline) {
    const atEnd =
      article.getBoundingClientRect().bottom <= win.innerHeight + 2 ||
      win.scrollY + win.innerHeight >= doc.scrollHeight - 2;
    // At the end twice in a row: nothing more was rendered below it.
    if (atEnd && ++settled >= 2) return;
    if (!atEnd) settled = 0;
    const from = win.scrollY;
    win.scrollBy(0, Math.max(200, win.innerHeight * 0.9));
    await wait(atEnd ? STEP_MS * 3 : STEP_MS);
    if (!atEnd && win.scrollY === from) return;
  }
}

/** The article in this page, once every part of it has been rendered. */
export async function readPage(doc: Document = document, win: Window = window): Promise<FavoriPayload> {
  const first = new ArticleExtractor(doc).extract();
  const container = first.rootContainerSelector ? doc.querySelector(first.rootContainerSelector) : null;
  const top = win.scrollY;
  await scrollThrough(container ?? doc.documentElement, win);
  win.scrollTo(0, top);

  const article = new ArticleExtractor(doc).extract();
  const title = article.metadata.title.replace(/\s+/g, ' ').trim();
  const lines = article.blocks.map((block) => block.cleanText);
  // The headline is the title; it is not also the first paragraph.
  if (lines[0] === title) lines.shift();
  return { title, url: article.metadata.canonicalUrl || win.location.href, text: lines.join('\n') };
}
