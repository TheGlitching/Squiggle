/**
 * Social-platform post and thread extractor.
 *
 * Turns a social post's page (X, Threads, Instagram, Facebook, TikTok) into the same `ExtractedArticle` the
 * article extractor produces, so the entire downstream pipeline - engine
 * pipeline, source-reading research, sidepanel annotations, in-page
 * highlighting - treats a thread exactly like any other article. Nothing
 * upstream needs to know how the content got extracted.
 *
 * A signed-in X thread is read off its DOM, below. Every other post, and an X
 * post opened without a session, is read off the page's own metadata: the
 * `og:` tags and the `<title>` the platform writes for link previews carry the
 * post's whole text where the page itself shows one line of it (an Instagram
 * caption cut after "plus", an X post in a layout with no test ids), and they
 * are what the page already handed the reader. Measured on public posts, signed
 * out, in Android's web view (`tests/fixtures/social/`):
 *
 * - X: `og:description`, or the `<title>` "NASA sur X : « … » / X";
 * - Threads: `og:description`;
 * - Instagram: `og:title`, `NASA sur Instagram: "<caption>"`;
 * - TikTok: `og:description`, the caption between « », or the `<title>`;
 * - Facebook: `og:description` and the post's visible text, both cut with
 *   "..." / "Voir plus" without a session: the read is then `truncated`.
 *
 * Such a read has no node in the page, so its blocks carry no xpath: nothing
 * to highlight in place, which a phone has no use for anyway. The metadata is
 * only trusted when it names the post the page's address names, so a stale
 * `og:` tag left by an in-app navigation is never read as the current post.
 *
 * The layout facts relied upon for an X thread are deliberately X-specific but
 * kept simple and resilient:
 *
 * - Every post is an `<article data-testid="tweet">`; a quoted tweet renders
 *   as an article nested inside its owner, so filtering out nested articles
 *   leaves exactly the thread's own posts.
 * - A post's text is the `[data-testid="tweetText"]` element.
 * - Status id, author handle and quotes are read off the post's own links.
 *
 * The thread is read in DOM order and de-duplicated by status id; posts after
 * the first are the thread's continuations. A quoted tweet becomes an
 * `isQuote` block so the audit can tell the author's words from what they
 * quote. Self-navigation links (this thread's own /status/ and profile
 * links) are excluded exactly as the article extractor excludes the outlet's
 * own links - citations are what the thread links out to, not its chrome.
 */

import {
  ArticleMetadata,
  CitedSource,
  ExtractedArticle,
  TextBlock,
} from './types';
import { PLATFORM_NAMES, SocialPlatform } from './socialPlatform';

/** One thread post, as read off the DOM. */
interface ParsedPost {
  /** Numeric status id, when the post carries one. */
  id?: string;
  /** @handle without the @, when recoverable. */
  handle?: string;
  text: string;
  /** Text of a quoted tweet this post cites, when one rendered. */
  quotedText?: string;
  timestamp?: string;
  links: { text: string; href: string }[];
  /** The post node itself, for xpath/css anchoring. */
  node: Element;
}

function clean(text: string): string {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function hostOf(urlStr: string): string {
  try {
    return new URL(urlStr).host || '';
  } catch {
    return '';
  }
}

function absoluteHref(raw: string, base: string): string | null {
  try {
    const u = new URL(raw.trim(), base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

/** https://x.com/handle/status/<id> -> the id. */
function statusIdOf(el: Element): string | undefined {
  for (const a of Array.from(el.querySelectorAll('a[href*="/status/"]'))) {
    const m = /\/status\/(\d+)/i.exec(a.getAttribute('href') || '');
    if (m) return m[1];
  }
  return undefined;
}

function handleOf(el: Element): string | undefined {
  const userLink = Array.from(el.querySelectorAll('[data-testid="User-Name"] a[href^="/"]'))
    .map((a) => a.getAttribute('href') || '')
    .find((href) => /^\/[^/]+\/?$/.test(href));
  return userLink ? userLink.replace(/^\/*/, '').replace(/\/+$/, '') : undefined;
}

/** Top-level thread posts: drop any article nested inside another article. */
function collectThreadPosts(doc: Document): Element[] {
  const all = Array.from(doc.querySelectorAll('article[data-testid="tweet"], article')) as Element[];
  const topLevel = all.filter((p) => {
    let a: Element | null = p.parentElement;
    while (a && a !== doc.documentElement && a.tagName.toLowerCase() !== 'html') {
      if (a.tagName.toLowerCase() === 'article') return false;
      a = a.parentElement;
    }
    return true;
  });

  const seen = new Set<string>();
  const unique: Element[] = [];
  for (const p of topLevel) {
    const id = statusIdOf(p);
    if (id) {
      if (seen.has(id)) continue;
      seen.add(id);
    }
    unique.push(p);
  }
  return unique;
}

function parsePost(el: Element, pageHost: string): ParsedPost {
  const textEl = el.querySelector('[data-testid="tweetText"]');
  // Never fall back to the whole node: it holds scripts and chrome, not the post.
  const text = clean(textEl?.textContent ?? '');

  const links: { text: string; href: string }[] = [];
  const seen = new Set<string>();
  for (const a of Array.from(el.querySelectorAll('a[href]'))) {
    const raw = a.getAttribute('href')?.trim();
    if (!raw || raw.startsWith('#') || /^(javascript|mailto):/i.test(raw)) continue;
    const href = absoluteHref(raw, `https://${pageHost}`);
    if (!href) continue;
    const host = hostOf(href).toLowerCase();
    // x.com /twitter.com navigation is this thread's own chrome, not a citation.
    if (host === 'x.com' || host === 'twitter.com' || host.endsWith('.x.com') || host.endsWith('.twitter.com')) {
      continue;
    }
    if (seen.has(href)) continue;
    seen.add(href);
    links.push({ text: clean(a.textContent ?? ''), href });
  }

  const timeEl = el.querySelector('time[datetime]');
  const quotedEl = el.querySelector('[data-testid="tweet-quoted"]');
  const quotedText = quotedEl
    ? clean(
        quotedEl.querySelector('[data-testid="tweetText"]')?.textContent ??
          quotedEl.textContent ??
          ''
      )
    : undefined;

  return {
    id: statusIdOf(el),
    handle: handleOf(el),
    text,
    quotedText,
    timestamp: timeEl?.getAttribute('datetime') ?? undefined,
    links,
    node: el,
  };
}

export class SocialExtractor {
  private doc: Document;
  private platform: SocialPlatform;
  private pageHost: string;
  private canonicalUrl: string;

  constructor(doc: Document, platform: SocialPlatform, url: string) {
    this.doc = doc;
    this.platform = platform;
    this.canonicalUrl = url || '';
    try {
      this.pageHost = new URL(url).host;
    } catch {
      this.pageHost = 'x.com';
    }
  }

  /** Null when the classified page rendered no readable posts. */
  public extract(): ExtractedArticle | null {
    return (this.platform === 'x' ? this.extractX() : null) ?? this.extractFromMetadata();
  }

  /** The post as the page's preview metadata gives it, or null when it gives no text. */
  private extractFromMetadata(): ExtractedArticle | null {
    if (!this.metadataNamesThisPost()) return null;
    const read = readPostMetadata(this.doc, this.platform);
    if (!read || read.text.length === 0) return null;
    const name = PLATFORM_NAMES[this.platform];
    const title = read.author ? `Publication ${name} de ${read.author}` : `Publication ${name}`;
    const lines = read.text.split('\n').map(clean).filter(Boolean);

    const blocks: TextBlock[] = [];
    let offset = 0;
    const push = (text: string, heading: boolean) => {
      blocks.push({
        id: heading ? 'head' : `post-${blocks.length}`,
        index: blocks.length,
        text,
        cleanText: text,
        charStart: offset,
        charEnd: offset + text.length,
        tagName: heading ? 'h1' : 'p',
        isHeading: heading,
        isQuote: false,
        isList: false,
        domPath: '',
        xpath: '',
        nodeCoordinates: { xpath: '', cssSelector: '', startOffset: 0, endOffset: 0 },
      });
      offset += text.length + 1;
    };
    push(title, true);
    for (const line of lines) push(line, false);

    const cleanText = lines.join(' ');
    const words = cleanText.split(/\s+/).filter((w) => w.length > 0);
    return {
      metadata: {
        title,
        byline: read.author,
        siteName: name,
        publishedTime: null,
        modifiedTime: null,
        description: cleanText.slice(0, 140) || null,
        lang: this.doc.documentElement?.lang || null,
        canonicalUrl: postAddress(this.doc) ?? this.canonicalUrl,
        estimatedReadTimeMinutes: Math.max(1, Math.round(words.length / 45)),
      },
      fullText: blocks.map((b) => b.cleanText).join('\n\n'),
      cleanText,
      wordCount: words.length,
      blocks,
      detectionMethod: 'social-thread',
      extractionConfidence: read.truncated ? 0.4 : 0.8,
      rootContainerSelector: 'head',
      citedSources: [],
      ...(read.truncated ? { truncated: true } : {}),
    };
  }

  /**
   * Whether the preview metadata is this post's: one of the address's ids (a
   * status number, a shortcode, a story id) is in the page's `og:url` or
   * canonical link. A page without either is taken at its word.
   */
  private metadataNamesThisPost(): boolean {
    const named = [metaContent(this.doc, 'og:url'), postAddress(this.doc)].filter(Boolean).join(' ');
    if (!named) return true;
    let ids: string[] = [];
    try {
      const url = new URL(this.canonicalUrl);
      ids = [...url.pathname.split('/'), ...url.searchParams.values()].filter((part) => /^[\w-]{6,}$/.test(part) && /\d/.test(part));
    } catch {
      return true;
    }
    return ids.length === 0 || ids.some((id) => named.includes(id));
  }

  private extractX(): ExtractedArticle | null {
    const posts = collectThreadPosts(this.doc).map((el) => parsePost(el, this.pageHost));
    const meaningful = posts.filter((p) => p.text.length > 0);
    if (meaningful.length === 0) return null;

    const root = meaningful[0];
    const authorLabel = root.handle ? `@${root.handle}` : 'X post';
    const title =
      meaningful.length > 1 ? `Fil de ${authorLabel}` : `Post de ${authorLabel}`;

    const blocks: TextBlock[] = [];
    let cleanText = '';
    let offset = 0;

    // A head block names the author and date so the panel shows who said it.
    const headText = clean(`${authorLabel}${root.timestamp ? ` · ${root.timestamp}` : ''}`);
    blocks.push({
      id: 'head',
      index: 0,
      text: headText,
      cleanText: headText,
      charStart: 0,
      charEnd: headText.length,
      tagName: 'h1',
      isHeading: true,
      isQuote: false,
      isList: false,
      domPath: 'article',
      xpath: this.xpathOf(root.node),
      nodeCoordinates: {
        xpath: this.xpathOf(root.node),
        cssSelector: 'article',
        startOffset: 0,
        endOffset: headText.length,
      },
    });
    offset += headText.length + 1;

    const citedSources: CitedSource[] = [];
    const citedByHref = new Map<string, number>();

    for (const post of meaningful) {
      // The author's own words, un-quoted: a post quoting someone is not itself
      // a quote, and the reader must see the distinction.
      const pushBlock = (blockText: string, isQuote: boolean) => {
        const block: TextBlock = {
          id: `post-${blocks.length}`,
          index: blocks.length,
          text: blockText,
          cleanText: blockText,
          charStart: offset,
          charEnd: offset + blockText.length,
          tagName: isQuote ? 'blockquote' : 'p',
          isHeading: false,
          isQuote,
          isList: false,
          domPath: 'article',
          xpath: this.xpathOf(post.node),
          nodeCoordinates: {
            xpath: this.xpathOf(post.node),
            cssSelector: 'article',
            startOffset: 0,
            endOffset: blockText.length,
          },
          ...(post.links.length > 0 && !isQuote ? { links: post.links } : {}),
        };
        blocks.push(block);
        offset += blockText.length + 1;
        cleanText += (cleanText ? ' ' : '') + blockText;
      };

      pushBlock(post.text, false);
      if (post.quotedText) {
        pushBlock(post.quotedText, true);
      }

      for (const link of post.links) {
        if (!citedByHref.has(link.href)) {
          citedByHref.set(link.href, citedSources.length);
          citedSources.push({ href: link.href, domain: hostOf(link.href), text: link.text });
        }
      }
    }

    const words = cleanText.split(/\s+/).filter((w) => w.length > 0);

    const metadata: ArticleMetadata = {
      title,
      byline: root.handle ? `@${root.handle}` : null,
      siteName: 'X (Twitter)',
      publishedTime: root.timestamp ?? null,
      modifiedTime: null,
      description: cleanText.slice(0, 140) || null,
      lang: this.doc.documentElement?.lang || null,
      canonicalUrl: this.canonicalUrl,
      estimatedReadTimeMinutes: Math.max(1, Math.round(words.length / 45)),
    };

    return {
      metadata,
      fullText: blocks.map((b) => b.cleanText).join('\n\n'),
      cleanText,
      wordCount: words.length,
      blocks,
      detectionMethod: 'social-thread',
      extractionConfidence: 0.85,
      rootContainerSelector: 'main',
      citedSources,
    };
  }

  private xpathOf(node: Element): string {
    const parts: string[] = [];
    let n: Element | null = node;
    while (n && n !== (this.doc.documentElement as Element)) {
      const tag = n.localName;
      const parent: Element | null = n.parentElement;
      if (!parent) break;
      const index = Array.from(parent.children ?? []).indexOf(n) + 1;
      parts.unshift(`${tag}[${index}]`);
      n = parent;
    }
    return parts.length ? `/${parts.join('/')}` : '';
  }
}


/**
 * A classified social page whose post text could not be found (X's signed-out
 * layout carries no test ids). Empty on purpose: the background tells the reader
 * the post could not be read, and nothing from the page's chrome reaches a model.
 */
export function unreadSocialPost(url: string): ExtractedArticle {
  return {
    metadata: {
      title: '',
      byline: null,
      siteName: 'X (Twitter)',
      publishedTime: null,
      modifiedTime: null,
      description: null,
      lang: null,
      canonicalUrl: url,
      estimatedReadTimeMinutes: 1,
    },
    fullText: '',
    cleanText: '',
    wordCount: 0,
    blocks: [],
    detectionMethod: 'social-thread',
    extractionConfidence: 0,
    rootContainerSelector: 'main',
    citedSources: [],
  };
}

/** A post's text and author as its page's preview metadata gives them. */
export interface PostMetadata {
  text: string;
  /** The account, as the platform names it ("NASA (@NASA)", "NASA"), when it does. */
  author: string | null;
  truncated: boolean;
}

function metaContent(doc: Document, key: string): string {
  const el = doc.querySelector(`meta[property="${key}"], meta[name="${key}"]`);
  return (el?.getAttribute('content') ?? '').trim();
}

function postAddress(doc: Document): string | null {
  return doc.querySelector('link[rel="canonical"]')?.getAttribute('href')?.trim() || null;
}

/** The post's text, line breaks kept, runs of spaces and blank lines folded. */
function postText(raw: string): string {
  return raw
    .split('\n')
    .map((line) => line.replace(/[^\S\n]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

const longest = (...texts: string[]): string => texts.map(postText).reduce((a, b) => (b.length > a.length ? b : a), '');

/** "NASA (@NASA) sur X", "NASA on Instagram" -> "NASA (@NASA)", "NASA". */
function authorBefore(label: string, platform: string): string | null {
  const m = new RegExp(`^(.+?)\\s+(?:sur|on)\\s+${platform}\\b`, 'i').exec(label);
  return m ? m[1].trim() : null;
}

/** Facebook's cut: the text ends on "..." or "… Voir plus" / "See more". */
/** What may follow the post's own text in its box: the cut marker alone. */
const CUT_ONLY = /^\s*(?:\.\.\.|…)?\s*(?:Voir plus|See more|Afficher la suite)?\s*$/i;
const CUT = /(?:\s*(?:\.\.\.|…)\s*(?:Voir plus|See more|Afficher la suite)?|\s+(?:Voir plus|See more))\s*$/i;

/**
 * Reads a post off its page's preview metadata (and, for Facebook, the
 * visible text that starts like it). Exported for the tests.
 */
export function readPostMetadata(doc: Document, platform: SocialPlatform): PostMetadata | null {
  const ogTitle = metaContent(doc, 'og:title');
  const ogDescription = metaContent(doc, 'og:description');
  const title = (doc.querySelector('title')?.textContent ?? '').trim();

  switch (platform) {
    case 'x': {
      // <title>: NASA sur X : « <post> » / X
      const inTitle = /[«"]\s*([\s\S]*?)\s*[»"]\s*\/\s*X\s*$/.exec(title)?.[1] ?? '';
      return { text: longest(ogDescription, inTitle), author: authorBefore(ogTitle, 'X'), truncated: false };
    }
    case 'threads':
      return { text: longest(ogDescription), author: authorBefore(ogTitle, 'Threads'), truncated: false };
    case 'instagram': {
      // og:title: NASA sur Instagram: "<caption>"; og:description: 308K likes, … - nasa le <date>: "<caption>".
      const inTitle = /:\s*"([\s\S]*)"\s*$/.exec(ogTitle)?.[1] ?? '';
      const inDescription = /:\s*"([\s\S]*)"\.?\s*$/.exec(ogDescription)?.[1] ?? '';
      return { text: longest(inTitle, inDescription), author: authorBefore(ogTitle, 'Instagram'), truncated: false };
    }
    case 'tiktok': {
      // og:description: 188.5K j'aime, 2573 commentaires. « <caption> »; <title>: <caption> | TikTok
      const inDescription = /[«"]\s*([\s\S]*?)\s*[»"]\s*$/.exec(ogDescription)?.[1] ?? '';
      const inTitle = /^([\s\S]*?)\s*\|\s*TikTok\s*$/.exec(title)?.[1] ?? '';
      const author = /·\s*(.+)$/.exec(ogTitle)?.[1]?.trim() || null;
      return { text: longest(inDescription, inTitle === 'TikTok' ? '' : inTitle), author, truncated: false };
    }
    case 'facebook': {
      // Without a session both the metadata and the post stop on "..." / "Voir plus"; with one,
      // the post's text in the page may be whole: the longer of the two, cut or not.
      const start = postText(ogDescription.replace(CUT, '')).slice(0, 40);
      let visible = '';
      if (start.length >= 10) {
        // The innermost element that starts like the post, with the "... Voir plus" beside it, if any.
        const holders = Array.from(doc.body?.querySelectorAll('div, span, p') ?? []).filter((el) =>
          postText(el.textContent ?? '').startsWith(start),
        );
        let el = holders[holders.length - 1];
        while (el?.parentElement) {
          const inner = postText(el.textContent ?? '');
          const outer = postText(el.parentElement.textContent ?? '');
          if (!outer.startsWith(inner) || !CUT_ONLY.test(outer.slice(inner.length))) break;
          el = el.parentElement;
        }
        visible = el ? postText(el.textContent ?? '') : '';
      }
      const og = postText(ogDescription);
      const best = visible.replace(CUT, '').length > og.replace(CUT, '').length ? visible : og;
      return {
        text: postText(best.replace(CUT, '')),
        author: ogTitle || null,
        truncated: CUT.test(best),
      };
    }
  }
}
