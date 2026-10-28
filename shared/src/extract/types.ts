/**
 * What the article extractor reads out of a page: the article's metadata and
 * its ordered blocks, each with the DOM path the extension anchors highlights to.
 */

export interface ArticleMetadata {
  title: string;
  byline: string | null;
  siteName: string | null;
  publishedTime: string | null;
  modifiedTime: string | null;
  description: string | null;
  lang: string | null;
  canonicalUrl: string | null;
  estimatedReadTimeMinutes: number;
}

export interface DOMNodeCoordinates {
  xpath: string;
  cssSelector: string;
  startOffset: number;
  endOffset: number;
}

export interface TextBlock {
  id: string;
  index: number;
  text: string;
  cleanText: string;
  charStart: number;
  charEnd: number;
  tagName: string;
  isHeading: boolean;
  isQuote: boolean;
  isList: boolean;
  domPath: string;
  xpath: string;
  nodeCoordinates: DOMNodeCoordinates;
  links?: { text: string; href: string }[];
}

export interface CitedSource {
  href: string;
  domain: string;
  text: string;
  blockId?: string;
}

export interface ExtractedArticle {
  metadata: ArticleMetadata;
  fullText: string;
  cleanText: string;
  wordCount: number;
  blocks: TextBlock[];
  detectionMethod:
    | 'json-ld'
    | 'semantic-article'
    | 'text-density'
    | 'readability-fallback'
    | 'social-thread';
  extractionConfidence: number; // 0.0 - 1.0
  rootContainerSelector: string;
  citedSources: CitedSource[];
}
