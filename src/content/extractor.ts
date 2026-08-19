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

import { ArticleMetadata, CitedSource, ExtractedArticle, TextBlock } from './types';

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
      const rawText = el.textContent || '';
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
    if (articles.length === 1) {
      return { container: articles[0], method: 'semantic-article', confidence: 0.95 };
    } else if (articles.length > 1) {
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
      return { container: bestArticle, method: 'semantic-article', confidence: 0.9 };
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
   * Collect sequential textual content elements (p, h1-h6, blockquote, li)
   */
  private collectContentElements(container: HTMLElement): HTMLElement[] {
    const selector = 'p, h1, h2, h3, h4, h5, h6, blockquote, li';
    const elements = Array.from(container.querySelectorAll(selector)) as HTMLElement[];

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

      // Filter out elements with noise classes
      const idAndClass = `${el.id} ${el.className}`.toLowerCase();
      if (/ad|banner|share|promo|sponsor|cookie|disclaimer|copyright/i.test(idAndClass)) {
        return false;
      }

      // Filter out parent link if element is purely inside a promotional widget
      if (el.closest('header, footer, nav, aside')) {
        return false;
      }

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
