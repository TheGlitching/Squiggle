/**
 * Social-platform thread extractor.
 *
 * Turns a social thread page (X today) into the same `ExtractedArticle` the
 * article extractor produces, so the entire downstream pipeline - engine
 * pipeline, source-reading research, sidepanel annotations, in-page
 * highlighting - treats a thread exactly like any other article. Nothing
 * upstream needs to know how the content got extracted.
 *
 * The layout facts relied upon here are deliberately X-specific but kept
 * simple and resilient:
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
import { SocialPlatform } from './socialPlatform';

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
  const text = clean(textEl?.textContent ?? el.textContent ?? '');

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
    return this.platform === 'x' ? this.extractX() : null;
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

