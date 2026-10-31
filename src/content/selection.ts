/**
 * A short passage the reader selected in the page, read as a message.
 *
 * A post on a feed, a chain pasted into a webmail, a comment: none of these is
 * the page's article, and the article extractor would either miss them or
 * read the whole page around them. A reader who selects one before running
 * the analysis is pointing at exactly what they want judged, so a selection of
 * a message's length is analysed instead of the page. A longer selection is
 * ignored: the page's own article is then what the reader most likely means.
 */
import { MAX_MESSAGE_CHARS, MIN_MESSAGE_CHARS } from '../../shared/src/engine/message';
import type { ExtractedArticle, TextBlock } from './types';

export function selectedMessage(selected: string, url: string): ExtractedArticle | null {
  const lines = selected
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  // Counted as the server counts it, so the server reads it as a message too.
  const chars = lines.reduce((total, line) => total + line.length, 0);
  if (chars < MIN_MESSAGE_CHARS || chars > MAX_MESSAGE_CHARS) return null;

  let offset = 0;
  const blocks: TextBlock[] = lines.map((text, index) => {
    const block: TextBlock = {
      id: `selection-${index + 1}`,
      index,
      text,
      cleanText: text,
      charStart: offset,
      charEnd: offset + text.length,
      tagName: 'p',
      isHeading: false,
      isQuote: false,
      isList: false,
      // No DOM path: a highlight finds its quote in the page by its words.
      domPath: '',
      xpath: '',
      nodeCoordinates: { xpath: '', cssSelector: '', startOffset: 0, endOffset: 0 },
    };
    offset += text.length + 2;
    return block;
  });
  const fullText = lines.join('\n\n');
  return {
    metadata: {
      title: '',
      byline: null,
      siteName: null,
      publishedTime: null,
      modifiedTime: null,
      description: null,
      lang: null,
      canonicalUrl: url || null,
      estimatedReadTimeMinutes: 1,
    },
    fullText,
    cleanText: fullText,
    wordCount: fullText.split(/\s+/).filter(Boolean).length,
    blocks,
    detectionMethod: 'selection',
    extractionConfidence: 1,
    rootContainerSelector: '',
    citedSources: [],
  };
}
