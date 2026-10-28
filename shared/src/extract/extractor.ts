/**
 * Article Detector & Semantic Extractor
 * Squiggle Editorial Verification Extension
 *
 * Implements:
 * 1. JSON-LD structured data parsing (schema.org/NewsArticle, Article, ReportageNewsArticle)
 * 2. Semantic HTML analysis (<article>, main[role="main"], schema tags)
 * 3. Text-density heuristic scoring (link-density penalties, paragraph depth)
 * 4. Readability-grade text block extraction with XPath and Character-offset mapping
 */

import type { ArticleMetadata, CitedSource, ExtractedArticle, TextBlock } from './types';

// Subtrees a reader never sees. With scripting on, a <noscript> fallback is parsed as
// raw markup text, so its textContent is HTML source ("<img src=...>"), not prose.
const NON_CONTENT_SELECTOR = 'noscript, script, template, style';
const NON_CONTENT_TAGS = new Set(['noscript', 'script', 'template', 'style']);

// Matched against whole words of an id/class, never substrings: "ad" must not catch
// "lead", "heading", "headline" or "thread", which are the standfirst and the title.
const NOISE_WORD =
  /^(ads?|banner|share|sharing|promo|promoted|related|teasers?|disclaimer|copyright|signin|signup|login|subscribe|newsletter|comments?|breadcrumbs?|outbrain|taboola)$|^(advert|sponsor|cookie|consent)/;

// Short blocks that are page furniture whatever their markup: "related article" lead-ins,
// sign-in prompts, comment widgets. French first, English for the sites that mix both.
const BOILERPLATE_LEAD_IN =
  /^(à lire aussi|lire aussi|lire également|voir aussi|sur le même sujet|en savoir plus|read more|related articles?)\s*([:\-–—]|$)/i;
const BOILERPLATE_PROMPT =
  /^(abonnez-vous|connectez-vous|créez un compte|j['’]ai déjà un compte|je n['’]ai pas de compte|signaler un abus|article rédigé par|sign in|log in|subscribe)\b/i;
const BOILERPLATE_MAX_CHARS = 300;

// An <article> scoring less than a fifth of the <main> around it is a box in the page, not the article.
const MINOR_ARTICLE_SHARE = 5;

// A block this made of links is navigation (a menu, a card, a list of headlines).
const LINK_DENSITY_LIMIT = 0.8;
const CARD_LIST_ITEM_DENSITY = 0.5;
const CARD_LIST_SHARE = 0.6;

export class ArticleExtractor {
  private doc: Document;

  constructor(doc: Document = document) {
    this.doc = doc;
  }

  /**
   * Main entry point: detect and extract article content
   */
  public extract(): ExtractedArticle {
    const metadata = this.extractMetadata();
    const { container, method, confidence } = this.detectArticleContainer();

    const blocks: TextBlock[] = [];
    let fullText = '';
    let cleanText = '';
    let currentOffset = 0;

    const candidateElements = this.collectContentElements(container);
    const articleBaseUrl = this.resolveArticleBaseUrl();
    const articleHost = articleBaseUrl ? this.safeHostname(articleBaseUrl) : null;
    const citedSources: CitedSource[] = [];
    const citedSourceIndexByHref = new Map<string, number>();

    let blockIdx = 0;
    for (const el of candidateElements) {
      const rawText = this.visibleText(el);
      const trimmedText = rawText.replace(/\s+/g, ' ').trim();

      // Skip empty or trivial noise
      if (trimmedText.length < 5) continue;

      const isHeading = /^H[1-6]$/i.test(el.tagName);
      const isQuote = el.tagName.toLowerCase() === 'blockquote' || el.tagName.toLowerCase() === 'q';
      const isList = el.tagName.toLowerCase() === 'li' || el.tagName.toLowerCase() === 'ul' || el.tagName.toLowerCase() === 'ol';

      const xpath = this.getElementXPath(el);
      const cssSelector = this.getElementCSSPath(el);
      const blockId = `block-${blockIdx}`;
      const links = this.extractBlockLinks(el, articleBaseUrl);

      const block: TextBlock = {
        id: blockId,
        index: blockIdx,
        text: rawText,
        cleanText: trimmedText,
        charStart: currentOffset,
        charEnd: currentOffset + trimmedText.length,
        tagName: el.tagName.toLowerCase(),
        isHeading,
        isQuote,
        isList,
        domPath: cssSelector,
        xpath,
        nodeCoordinates: {
          xpath,
          cssSelector,
          startOffset: 0,
          endOffset: rawText.length,
        },
        ...(links.length > 0 ? { links } : {}),
      };

      blocks.push(block);
      fullText += (fullText ? '\n\n' : '') + trimmedText;
      cleanText += (cleanText ? ' ' : '') + trimmedText;
      currentOffset += trimmedText.length + 1;
      blockIdx++;

      // The article's own hyperlinks are the reader's citations; a self-link is
      // navigation, not a source, so it is excluded from the cited-source list.
      for (const link of links) {
        const domain = this.safeHostname(link.href);
        if (!domain || domain === articleHost) continue;

        const existingIdx = citedSourceIndexByHref.get(link.href);
        if (existingIdx === undefined) {
          citedSourceIndexByHref.set(link.href, citedSources.length);
          citedSources.push({ href: link.href, domain, text: link.text, blockId });
        } else if (link.text.length > citedSources[existingIdx].text.length) {
          citedSources[existingIdx].text = link.text;
        }
      }
    }

    const words = cleanText.split(/\s+/).filter(w => w.length > 0);

    return {
      metadata,
      fullText,
      cleanText,
      wordCount: words.length,
      blocks,
      detectionMethod: method,
      extractionConfidence: confidence,
      rootContainerSelector: this.getElementCSSPath(container),
      citedSources,
    };
  }

  /**
   * Extract high-fidelity metadata from JSON-LD, OpenGraph, Twitter Cards, and meta tags
   */
  public extractMetadata(): ArticleMetadata {
    let title = '';
    let byline: string | null = null;
    let siteName: string | null = null;
    let publishedTime: string | null = null;
    let modifiedTime: string | null = null;
    let description: string | null = null;
    let lang = this.doc.documentElement.lang || null;
    let canonicalUrl: string | null = null;

    // 1. Check JSON-LD
    const jsonLdScripts = Array.from(this.doc.querySelectorAll('script[type="application/ld+json"]'));
    for (const script of jsonLdScripts) {
      try {
        const json = JSON.parse(script.textContent || '{}');
        const items = Array.isArray(json) ? json : json['@graph'] ? json['@graph'] : [json];

        for (const item of items) {
          const type = item['@type'];
          if (
            type === 'NewsArticle' ||
            type === 'Article' ||
            type === 'ReportageNewsArticle' ||
            type === 'BlogPosting' ||
            type === 'AnalysisNewsArticle'
          ) {
            if (item.headline && !title) title = String(item.headline);
            if (item.author) {
              if (typeof item.author === 'string') byline = item.author;
              else if (Array.isArray(item.author)) byline = item.author.map((a: any) => a.name || a).join(', ');
              else if (item.author.name) byline = item.author.name;
            }
            if (item.publisher && item.publisher.name) siteName = item.publisher.name;
            if (item.datePublished) publishedTime = item.datePublished;
            if (item.dateModified) modifiedTime = item.dateModified;
            if (item.description) description = item.description;
            if (item.inLanguage) lang = item.inLanguage;
            if (item.mainEntityOfPage) {
              canonicalUrl = typeof item.mainEntityOfPage === 'string'
                ? item.mainEntityOfPage
                : item.mainEntityOfPage['@id'] || canonicalUrl;
            }
          }
        }
      } catch {
        // Ignore invalid JSON-LD scripts
      }
    }

    // 2. OpenGraph / Twitter Fallback
    if (!title) {
      const ogTitle = this.doc.querySelector('meta[property="og:title"]')?.getAttribute('content');
      const twitterTitle = this.doc.querySelector('meta[name="twitter:title"]')?.getAttribute('content');
      title = ogTitle || twitterTitle || this.doc.title || '';
    }

    if (!byline) {
      const metaAuthor = this.doc.querySelector('meta[name="author"]')?.getAttribute('content');
      const relAuthor = this.doc.querySelector('[rel="author"]')?.textContent?.trim();
      byline = metaAuthor || relAuthor || null;
    }

    if (!siteName) {
      siteName = this.doc.querySelector('meta[property="og:site_name"]')?.getAttribute('content') || null;
    }

    if (!publishedTime) {
      publishedTime =
        this.doc.querySelector('meta[property="article:published_time"]')?.getAttribute('content') ||
        this.doc.querySelector('time[datetime]')?.getAttribute('datetime') ||
        null;
    }

    if (!modifiedTime) {
      modifiedTime =
        this.doc.querySelector('meta[property="article:modified_time"]')?.getAttribute('content') || null;
    }

    if (!description) {
      description =
        this.doc.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
        this.doc.querySelector('meta[name="description"]')?.getAttribute('content') ||
        null;
    }

    const canonicalLink = this.doc.querySelector('link[rel="canonical"]')?.getAttribute('href');
    if (!canonicalUrl && canonicalLink) canonicalUrl = canonicalLink;

    // Calculate approximate read time (average 220 words per minute)
    const totalBodyWords = (this.doc.body?.textContent || '').split(/\s+/).length;
    const estimatedReadTimeMinutes = Math.max(1, Math.round(totalBodyWords / 220));

    return {
      title,
      byline,
      siteName,
      publishedTime,
      modifiedTime,
      description,
      lang,
      canonicalUrl: canonicalUrl || (typeof window !== 'undefined' ? window.location?.href : null),
      estimatedReadTimeMinutes,
    };
  }

  /**
   * Multi-tier article container detection
   */
  private detectArticleContainer(): {
    container: HTMLElement;
    method: 'json-ld' | 'semantic-article' | 'text-density' | 'readability-fallback';
    confidence: number;
  } {
    // Tier 1: Explicit <article> or role="article"
    const articles = Array.from(this.doc.querySelectorAll('article, [role="article"]')) as HTMLElement[];
    if (articles.length > 0) {
      // Find the article tag with highest paragraph word count
      let bestArticle = articles[0];
      let maxScore = -1;
      for (const art of articles) {
        const score = this.calculateTextDensityScore(art);
        if (score > maxScore) {
          maxScore = score;
          bestArticle = art;
        }
      }
      // An <article> holding a small part of the page's main text is a box inside it (a live
      // page's credits, a teaser), not the article: the main container is read instead.
      const main = this.doc.querySelector('main, [role="main"]') as HTMLElement | null;
      const boxInMain =
        main !== null && main.contains(bestArticle) && maxScore * MINOR_ARTICLE_SHARE < this.calculateTextDensityScore(main);
      if (!boxInMain) {
        return { container: bestArticle, method: 'semantic-article', confidence: articles.length === 1 ? 0.95 : 0.9 };
      }
    }

    // Tier 2: Common semantic containers
    const semanticSelectors = [
      'main',
      '[role="main"]',
      '#main-content',
      '.article-body',
      '.article__body',
      '.story-body',
      '.post-content',
      '.entry-content',
      '.article-content',
    ];

    for (const selector of semanticSelectors) {
      const el = this.doc.querySelector(selector) as HTMLElement;
      if (el && this.calculateTextDensityScore(el) > 100) {
        return { container: el, method: 'semantic-article', confidence: 0.85 };
      }
    }

    // Tier 3: Text-density heuristic scoring across all candidates
    const allDivs = Array.from(this.doc.querySelectorAll('div, section, main')) as HTMLElement[];
    let bestContainer: HTMLElement = this.doc.body || (this.doc.documentElement as HTMLElement);
    let highestDensityScore = 0;

    for (const el of allDivs) {
      // Exclude navigation, header, footer, sidebar, comments
      const idAndClass = `${el.id} ${el.className}`.toLowerCase();
      if (/nav|header|footer|sidebar|comment|menu|ad-|banner|promo|social/i.test(idAndClass)) {
        continue;
      }

      const score = this.calculateTextDensityScore(el);
      if (score > highestDensityScore) {
        highestDensityScore = score;
        bestContainer = el;
      }
    }

    if (highestDensityScore > 150) {
      return { container: bestContainer, method: 'text-density', confidence: 0.75 };
    }

    return {
      container: (this.doc.body as HTMLElement) || (this.doc.documentElement as HTMLElement),
      method: 'readability-fallback',
      confidence: 0.5,
    };
  }

  /**
   * Score an element based on text length, paragraph count, and link density penalty
   */
  public calculateTextDensityScore(element: HTMLElement): number {
    const text = element.textContent || '';
    const textLen = text.trim().length;
    if (textLen < 50) return 0;

    // Link density penalty: navigation bars or link lists have high link text ratio
    const links = Array.from(element.querySelectorAll('a'));
    let linkTextLen = 0;
    for (const a of links) {
      linkTextLen += (a.textContent || '').trim().length;
    }
    const linkDensity = linkTextLen / (textLen || 1);
    if (linkDensity > 0.5) return 0; // Likely a menu, list of headlines, or footer

    const paragraphs = element.querySelectorAll('p, blockquote');
    const pCount = paragraphs.length;

    // Heuristic: weighted text length, boosted by paragraph count, penalized by link density
    const score = (textLen * 0.5 + pCount * 80) * (1 - linkDensity);
    return score;
  }

  /**
   * Capture the citable anchors inside a content block: absolute http(s) links only,
   * excluding in-page fragments and non-navigable schemes the reader could never open.
   */
  private extractBlockLinks(el: HTMLElement, baseUrl: string | null): { text: string; href: string }[] {
    const anchors = Array.from(el.querySelectorAll('a[href]')) as HTMLAnchorElement[];
    const links: { text: string; href: string }[] = [];

    for (const a of anchors) {
      const rawHref = a.getAttribute('href')?.trim();
      if (!rawHref || rawHref.startsWith('#') || /^(javascript|mailto):/i.test(rawHref)) continue;

      let absolute: URL;
      try {
        absolute = new URL(rawHref, baseUrl ?? undefined);
      } catch {
        continue; // unresolvable without a base: not a usable citation
      }
      if (absolute.protocol !== 'http:' && absolute.protocol !== 'https:') continue;

      links.push({
        text: (a.textContent || '').replace(/\s+/g, ' ').trim(),
        href: absolute.href,
      });
    }

    return links;
  }

  /**
   * Resolve the URL the article's own relative links are anchored against: an explicit
   * <base>/document URI when present, otherwise the canonical link, otherwise the
   * hosting window's location. Without one of these, relative hrefs cannot be trusted.
   */
  private resolveArticleBaseUrl(): string | null {
    // An explicit <base> wins outright: it is the author's own statement of the
    // document's URL and always outranks the ambient document.baseURI.
    if (this.doc.querySelector('base[href]')) return this.doc.baseURI;

    const canonicalLink = this.doc.querySelector('link[rel="canonical"]')?.getAttribute('href');
    if (canonicalLink) {
      // The attribute is frequently a bare path ("/section/article-123"), and
      // using it unresolved as a base makes every relative link in the article
      // fail to resolve, silently discarding every citation. Resolve it
      // against the document's own location before trusting it as a base.
      const documentLocation =
        this.doc.baseURI && this.doc.baseURI !== 'about:blank'
          ? this.doc.baseURI
          : typeof window !== 'undefined'
            ? window.location?.href
            : undefined;
      try {
        return new URL(canonicalLink, documentLocation).href;
      } catch {
        // Neither absolute on its own nor resolvable against a known location:
        // fall through to the other bases rather than handing back garbage.
      }
    }

    if (this.doc.baseURI && this.doc.baseURI !== 'about:blank') return this.doc.baseURI;
    if (typeof window !== 'undefined' && window.location?.href) return window.location.href;
    return null;
  }

  /**
   * Registrable-domain approximation for comparing hosts (self-link exclusion,
   * source de-duplication): keeps only the last two labels of the hostname, so
   * every subdomain of a publisher ("www.", "abonne.", "mobile.", ...) is
   * treated as the same source. This is a deliberate simplification - it
   * mishandles multi-part public suffixes such as "co.uk" - but it is exactly
   * what self-link exclusion needs: a paywall or subscription pitch hosted on
   * a different subdomain of the same publisher must never be counted as an
   * independent citation.
   */
  private safeHostname(url: string): string | null {
    try {
      const labels = new URL(url).hostname.toLowerCase().split('.').filter(Boolean);
      return labels.length <= 2 ? labels.join('.') : labels.slice(-2).join('.');
    } catch {
      return null;
    }
  }

  /**
   * textContent without the non-content subtrees (<noscript>, <script>, <template>, <style>).
   */
  private visibleText(el: Element): string {
    let text = '';
    const walk = (node: Node): void => {
      for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === Node.TEXT_NODE) {
          text += child.nodeValue ?? '';
        } else if (
          child.nodeType === Node.ELEMENT_NODE &&
          !NON_CONTENT_TAGS.has((child as Element).tagName.toLowerCase())
        ) {
          walk(child);
        }
      }
    };
    walk(el);
    return text;
  }

  private hasNoiseName(el: Element): boolean {
    const raw = `${el.id} ${typeof el.className === 'string' ? el.className : ''}`;
    // Split camelCase before lowercasing: "shareBar" is two words.
    const words = raw.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/);
    return words.some(w => NOISE_WORD.test(w));
  }

  private linkDensity(el: Element, text: string): number {
    if (!text) return 0;
    let linked = 0;
    for (const a of Array.from(el.querySelectorAll('a'))) {
      if (a.closest(NON_CONTENT_SELECTOR)) continue;
      linked += this.visibleText(a).replace(/\s+/g, ' ').trim().length;
    }
    return linked / text.length;
  }

  /**
   * Collect sequential textual content elements (p, h1-h6, blockquote, li), leaving out
   * the page furniture that surrounds an article: hidden nodes, fallbacks, promos,
   * comment widgets, link cards and link lists.
   */
  private collectContentElements(container: HTMLElement): HTMLElement[] {
    const selector = 'p, h1, h2, h3, h4, h5, h6, blockquote, li';
    const elements = Array.from(container.querySelectorAll(selector)) as HTMLElement[];
    const baseUrl = this.resolveArticleBaseUrl();
    const articleHost = baseUrl ? this.safeHostname(baseUrl) : null;
    const cardLists = new Map<Element, boolean>();

    // Links to the publisher itself are navigation; a block that cites only other
    // domains is a sources list and stays even when it is all links.
    const citesOnlyElsewhere = (el: HTMLElement): boolean => {
      const links = this.extractBlockLinks(el, baseUrl);
      return links.length > 0 && links.every(l => this.safeHostname(l.href) !== articleHost);
    };

    const isCardList = (list: Element | null): boolean => {
      if (!list || !/^(ul|ol)$/i.test(list.tagName)) return false;
      let verdict = cardLists.get(list);
      if (verdict === undefined) {
        const items = Array.from(list.children).filter(c => c.tagName.toLowerCase() === 'li');
        const dense = items.filter(li => {
          const text = this.visibleText(li).replace(/\s+/g, ' ').trim();
          return this.linkDensity(li, text) > CARD_LIST_ITEM_DENSITY;
        });
        verdict = items.length >= 2 && dense.length / items.length >= CARD_LIST_SHARE;
        cardLists.set(list, verdict);
      }
      return verdict;
    };

    return elements.filter(el => {
      // Filter out hidden elements
      if (typeof window !== 'undefined' && window.getComputedStyle) {
        try {
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            return false;
          }
        } catch {
          // ignore
        }
      }

      // Filter out fallbacks and markup that is not prose
      if (el.closest(NON_CONTENT_SELECTOR)) return false;

      // Filter out elements, or wrappers up to the article container, with noise names
      for (let node: HTMLElement | null = el; node && node !== container; node = node.parentElement) {
        if (this.hasNoiseName(node)) return false;
      }

      // Filter out parent link if element is purely inside a promotional widget
      if (el.closest('header, footer, nav, aside')) {
        return false;
      }

      const text = this.visibleText(el).replace(/\s+/g, ' ').trim();
      if (text.length <= BOILERPLATE_MAX_CHARS && (BOILERPLATE_LEAD_IN.test(text) || BOILERPLATE_PROMPT.test(text))) {
        return false;
      }

      // A block wrapped in a link is a card; a block that is mostly link text, or a
      // list of such blocks, is navigation. Quotes are the author's words, never cards.
      const tag = el.tagName.toLowerCase();
      const navigationLike =
        tag !== 'blockquote' &&
        (!!el.closest('a') ||
          this.linkDensity(el, text) >= LINK_DENSITY_LIMIT ||
          (tag === 'li' && isCardList(el.parentElement)));
      if (navigationLike && !citesOnlyElsewhere(el)) return false;

      return true;
    });
  }

  /**
   * Compute stable XPath for element
   */
  public getElementXPath(element: Node): string {
    if (element.nodeType === Node.DOCUMENT_NODE) return '';
    if (element === this.doc.body) return '/html/body';

    let count = 1;
    let sibling = element.previousSibling;
    while (sibling) {
      if (sibling.nodeType === element.nodeType && sibling.nodeName === element.nodeName) {
        count++;
      }
      sibling = sibling.previousSibling;
    }

    const tagName = element.nodeName.toLowerCase();
    const parentPath = element.parentNode ? this.getElementXPath(element.parentNode) : '';
    return `${parentPath}/${tagName}[${count}]`;
  }

  /**
   * Compute CSS selector path for element
   */
  public getElementCSSPath(element: HTMLElement): string {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return '';
    if (element.id) return `#${element.id}`;

    const path: string[] = [];
    let current: HTMLElement | null = element;

    while (current && current.nodeType === Node.ELEMENT_NODE && current !== this.doc.documentElement) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        selector = `#${current.id}`;
        path.unshift(selector);
        break;
      } else {
        let sibling = current.previousElementSibling;
        let index = 1;
        while (sibling) {
          if (sibling.tagName === current.tagName) index++;
          sibling = sibling.previousElementSibling;
        }
        if (index > 1) {
          selector += `:nth-of-type(${index})`;
        }
      }
      path.unshift(selector);
      current = current.parentElement;
    }

    return path.join(' > ');
  }
}
