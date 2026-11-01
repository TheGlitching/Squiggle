/**
 * The page as the bookmark takes it, in the reader's own tab.
 *
 * Some sites render the end of a long article only as the reader scrolls to
 * it, so the page is scrolled through the article first, then copied, then put
 * back where the reader was. The copy keeps what the extractor reads (the
 * text, the links, the head's metadata) and drops what it never reads, and
 * what the reader cannot see: the extractor that reads it on /analyser has no
 * styles to tell a hidden paragraph by. A social post is not scrolled: it is
 * at the top, and what scrolling renders below it is other people's comments.
 */

import { SOCIAL_HOST } from '../../../shared/src/extract/socialPlatform';

/** Long enough for a lazy site to render what scrolled into view. */
const STEP_MS = 150;
/** A long article on a slow phone, and never longer: a page that keeps growing is cut here. */
const MAX_SCROLL_MS = 15_000;

/** Marks, for the length of the copy, what the reader cannot see. */
const HIDDEN = 'data-squiggle-hidden';
/** What the extractor never reads: code, media, embedded pages. JSON-LD and the canonical link are metadata. */
const DROPPED = `[${HIDDEN}],script:not([type="application/ld+json"]),style,link:not([rel=canonical]),svg,iframe,noscript,template,img,picture,video,audio,canvas`;

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

/** The page's HTML, once every part of the article has been rendered. */
export async function readPage(doc: Document = document, win: Window = window): Promise<string> {
  // ponytail: the first <article> stands in for the extractor's container, which is too big to ship in the bookmark.
  const article = doc.querySelector('[itemprop="articleBody"], article') ?? doc.documentElement;
  if (!SOCIAL_HOST.test(win.location?.hostname ?? '')) {
    const top = win.scrollY;
    await scrollThrough(article, win);
    win.scrollTo(0, top);
  }

  const hidden: Element[] = [];
  for (const el of doc.body.querySelectorAll('*')) {
    const style = win.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      el.setAttribute(HIDDEN, '');
      hidden.push(el);
    }
  }
  const copy = doc.documentElement.cloneNode(true) as Element;
  for (const el of hidden) el.removeAttribute(HIDDEN);
  for (const el of copy.querySelectorAll(DROPPED)) el.remove();
  return copy.outerHTML;
}
