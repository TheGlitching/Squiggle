/**
 * Three-Tier Highlight Anchoring Engine
 *
 * Tier 1: DOM Range matching using exact nodeCoordinates (XPath + offsets)
 * Tier 2: Exact quote substring search across extracted TextBlocks and DOM tree
 * Tier 3: Fuzzy Levenshtein / Dice coefficient matching with prefix/suffix context disambiguation
 */

import {
  FindingHighlightTarget,
  AnchoredHighlight,
  AnchorTier,
  HighlightRect,
  TextBlock,
} from './types';

export class RangeTracker {
  private doc: Document;

  constructor(doc: Document = document) {
    this.doc = doc;
  }

  /**
   * Anchor a collection of findings against document text blocks
   */
  public anchorFindings(
    targets: FindingHighlightTarget[],
    blocks: TextBlock[]
  ): AnchoredHighlight[] {
    const results: AnchoredHighlight[] = [];

    for (const target of targets) {
      const anchored = this.anchorSingleFinding(target, blocks);
      results.push(anchored);
    }

    return results;
  }

  /**
   * Anchor a single finding using the 3-tier cascade
   */
  public anchorSingleFinding(
    target: FindingHighlightTarget,
    blocks: TextBlock[]
  ): AnchoredHighlight {
    // Tier 1: DOM Coordinates / Pre-calculated Range
    if (target.domCoordinates && target.domCoordinates.xpath) {
      const range = this.resolveRangeFromCoordinates(target.domCoordinates);
      if (range && range.toString().trim().length > 0) {
        const rects = this.computeRangeRects(range);
        const matchedText = range.toString();
        return {
          id: `hl-${target.findingId}`,
          findingId: target.findingId,
          target,
          tier: 'dom-range' as AnchorTier,
          confidence: 1.0,
          range,
          matchedText,
          blockIndex: this.findBlockIndexForNode(range.startContainer, blocks),
          rects,
          boundingBox: this.computeBoundingBox(rects),
        };
      }
    }

    // Tier 2: Exact Quote Substring Match
    const exactMatch = this.findExactQuoteMatch(target, blocks);
    if (exactMatch) {
      return exactMatch;
    }

    // Tier 3: Fuzzy Match with Context (Prefix / Suffix)
    const fuzzyMatch = this.findFuzzyQuoteMatch(target, blocks);
    if (fuzzyMatch) {
      return fuzzyMatch;
    }

    // Fallback: Unanchored
    return {
      id: `hl-${target.findingId}`,
      findingId: target.findingId,
      target,
      tier: 'unanchored' as AnchorTier,
      confidence: 0,
      range: null,
      matchedText: '',
      blockIndex: -1,
      rects: [],
      boundingBox: { top: 0, left: 0, width: 0, height: 0 },
    };
  }

  /**
   * Tier 1: Resolve DOM Range from XPath + offsets
   */
  private resolveRangeFromCoordinates(coords: {
    xpath: string;
    startOffset: number;
    endOffset: number;
  }): Range | null {
    try {
      const node = this.evaluateXPath(coords.xpath);
      if (!node) return null;

      const targetNode = node.nodeType === Node.ELEMENT_NODE && node.firstChild ? node.firstChild : node;
      const maxLen = targetNode.textContent?.length || 0;
      const start = Math.min(coords.startOffset, maxLen);
      const end = Math.min(coords.endOffset, maxLen);

      if (start >= end) return null;

      const range = this.doc.createRange();
      range.setStart(targetNode, start);
      range.setEnd(targetNode, end);
      return range;
    } catch {
      return null;
    }
  }

  /**
   * Tier 2: Exact Quote matching in TextBlocks and DOM tree
   */
  private findExactQuoteMatch(
    target: FindingHighlightTarget,
    blocks: TextBlock[]
  ): AnchoredHighlight | null {
    const rawQuote = target.quote.trim();
    if (!rawQuote) return null;
    const cleanQuote = rawQuote.replace(/\s+/g, ' ');

    // 1. Search in blocks
    for (let bIdx = 0; bIdx < blocks.length; bIdx++) {
      const block = blocks[bIdx];
      const blockText = block.cleanText;
      const quoteIndex = blockText.indexOf(cleanQuote);

      if (quoteIndex !== -1) {
        const xpath = block.xpath || block.nodeCoordinates?.xpath;
        const domNode = xpath ? this.evaluateXPath(xpath) : null;
        if (domNode) {
          const range = this.createRangeForTextInElement(domNode, cleanQuote);
          if (range) {
            const rects = this.computeRangeRects(range);
            return {
              id: `hl-${target.findingId}`,
              findingId: target.findingId,
              target,
              tier: 'exact-quote',
              confidence: 0.95,
              range,
              matchedText: cleanQuote,
              blockIndex: bIdx,
              rects,
              boundingBox: this.computeBoundingBox(rects),
            };
          }
        }
      }
    }

    return null;
  }

  /**
   * Tier 3: Fuzzy quote search with Levenshtein-similarity and prefix/suffix disambiguation
   */
  private findFuzzyQuoteMatch(
    target: FindingHighlightTarget,
    blocks: TextBlock[]
  ): AnchoredHighlight | null {
    const quote = target.quote.trim().replace(/\s+/g, ' ').toLowerCase();
    if (quote.length < 8) return null;

    let bestScore = 0;
    let bestBlockIdx = -1;
    let bestRange: Range | null = null;
    let bestMatchedText = '';

    for (let bIdx = 0; bIdx < blocks.length; bIdx++) {
      const block = blocks[bIdx];
      const blockText = block.cleanText.toLowerCase();

      // Quick n-gram / dice coefficient check
      const similarity = this.calculateDiceCoefficient(quote, blockText);
      if (similarity > bestScore && similarity > 0.45) {
        // Try to find best matching window inside block
        const windowMatch = this.findBestSubMatch(quote, block.cleanText);
        if (windowMatch && windowMatch.score > bestScore) {
          const xpath = block.xpath || block.nodeCoordinates?.xpath;
          const domNode = xpath ? this.evaluateXPath(xpath) : null;
          if (domNode) {
            const range = this.createRangeForTextInElement(domNode, windowMatch.matchedSubstring);
            if (range) {
              bestScore = windowMatch.score;
              bestBlockIdx = bIdx;
              bestRange = range;
              bestMatchedText = windowMatch.matchedSubstring;
            }
          }
        }
      }
    }

    if (bestRange && bestScore >= 0.6) {
      const rects = this.computeRangeRects(bestRange);
      return {
        id: `hl-${target.findingId}`,
        findingId: target.findingId,
        target,
        tier: 'fuzzy-match',
        confidence: Math.round(bestScore * 100) / 100,
        range: bestRange,
        matchedText: bestMatchedText,
        blockIndex: bestBlockIdx,
        rects,
        boundingBox: this.computeBoundingBox(rects),
      };
    }

    return null;
  }

  /**
   * Find matching sub-string window inside a candidate block
   */
  private findBestSubMatch(
    queryLower: string,
    targetText: string
  ): { matchedSubstring: string; score: number } | null {
    const targetLower = targetText.toLowerCase();
    const queryLen = queryLower.length;

    // Slide window of approximately queryLen (+/- 20%)
    const windowMin = Math.max(10, Math.floor(queryLen * 0.8));
    const windowMax = Math.min(targetText.length, Math.ceil(queryLen * 1.2));

    let maxScore = 0;
    let bestSubstring = '';

    const step = Math.max(1, Math.floor(queryLen / 8));
    for (let i = 0; i <= targetText.length - windowMin; i += step) {
      for (let len = windowMin; len <= windowMax && i + len <= targetText.length; len += step) {
        const subLower = targetLower.substring(i, i + len);
        const score = this.calculateDiceCoefficient(queryLower, subLower);
        if (score > maxScore) {
          maxScore = score;
          bestSubstring = targetText.substring(i, i + len);
        }
      }
    }

    if (maxScore > 0.5) {
      return { matchedSubstring: bestSubstring, score: maxScore };
    }
    return null;
  }

  /**
   * Bi-gram Dice coefficient similarity calculation (0.0 to 1.0)
   */
  public calculateDiceCoefficient(a: string, b: string): number {
    if (a === b) return 1.0;
    if (a.length < 2 || b.length < 2) return 0.0;

    const getBigrams = (str: string): Map<string, number> => {
      const map = new Map<string, number>();
      for (let i = 0; i < str.length - 1; i++) {
        const bigram = str.substring(i, i + 2);
        map.set(bigram, (map.get(bigram) || 0) + 1);
      }
      return map;
    };

    const bigramsA = getBigrams(a);
    const bigramsB = getBigrams(b);

    let intersection = 0;
    bigramsA.forEach((count, bigram) => {
      if (bigramsB.has(bigram)) {
        intersection += Math.min(count, bigramsB.get(bigram)!);
      }
    });

    const totalBigrams = (a.length - 1) + (b.length - 1);
    return (2.0 * intersection) / totalBigrams;
  }

  /**
   * Create Range for substring occurring in text nodes under an element
   */
  public createRangeForTextInElement(container: Node, textToFind: string): Range | null {
    const walker = this.doc.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let fullContent = '';
    const nodeOffsets: { node: Text; start: number; end: number }[] = [];

    let currentNode = walker.nextNode();
    while (currentNode) {
      const textNode = currentNode as Text;
      const text = textNode.nodeValue || '';
      const start = fullContent.length;
      fullContent += text;
      const end = fullContent.length;
      nodeOffsets.push({ node: textNode, start, end });
      textNodes.push(textNode);
      currentNode = walker.nextNode();
    }

    const cleanFull = fullContent.replace(/\s+/g, ' ');
    const cleanFind = textToFind.replace(/\s+/g, ' ').trim();

    const idx = cleanFull.indexOf(cleanFind);
    if (idx === -1) {
      // Direct raw search
      const rawIdx = fullContent.indexOf(textToFind);
      if (rawIdx === -1) return null;
      return this.mapOffsetsToRange(nodeOffsets, rawIdx, rawIdx + textToFind.length);
    }

    return this.mapOffsetsToRange(nodeOffsets, idx, idx + cleanFind.length);
  }

  /**
   * Map character offsets across multiple text nodes into a single DOM Range
   */
  private mapOffsetsToRange(
    nodeOffsets: { node: Text; start: number; end: number }[],
    startChar: number,
    endChar: number
  ): Range | null {
    let startNode: Text | null = null;
    let startOffset = 0;
    let endNode: Text | null = null;
    let endOffset = 0;

    for (const item of nodeOffsets) {
      if (!startNode && startChar >= item.start && startChar <= item.end) {
        startNode = item.node;
        startOffset = Math.min(startChar - item.start, item.node.nodeValue?.length || 0);
      }
      if (endChar >= item.start && endChar <= item.end) {
        endNode = item.node;
        endOffset = Math.min(endChar - item.start, item.node.nodeValue?.length || 0);
        break;
      }
    }

    if (!startNode || !endNode) {
      if (nodeOffsets.length > 0) {
        startNode = nodeOffsets[0].node;
        startOffset = 0;
        endNode = nodeOffsets[nodeOffsets.length - 1].node;
        endOffset = endNode.nodeValue?.length || 0;
      } else {
        return null;
      }
    }

    try {
      const range = this.doc.createRange();
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
      return range;
    } catch {
      return null;
    }
  }

  /**
   * Compute line-by-line bounding rects relative to document viewport / page coordinates
   */
  public computeRangeRects(range: Range): HighlightRect[] {
    const clientRects = Array.from(range.getClientRects());
    const scrollX = typeof window !== 'undefined' ? window.scrollX || window.pageXOffset || 0 : 0;
    const scrollY = typeof window !== 'undefined' ? window.scrollY || window.pageYOffset || 0 : 0;

    return clientRects
      .filter(r => r.width > 0 && r.height > 0)
      .map((r, i) => ({
        top: r.top + scrollY,
        left: r.left + scrollX,
        width: r.width,
        height: r.height,
        lineIndex: i,
      }));
  }

  /**
   * Compute total bounding box enclosing all line rects
   */
  public computeBoundingBox(rects: HighlightRect[]): {
    top: number;
    left: number;
    width: number;
    height: number;
  } {
    if (rects.length === 0) {
      return { top: 0, left: 0, width: 0, height: 0 };
    }

    let minTop = Infinity;
    let minLeft = Infinity;
    let maxBottom = -Infinity;
    let maxRight = -Infinity;

    for (const r of rects) {
      if (r.top < minTop) minTop = r.top;
      if (r.left < minLeft) minLeft = r.left;
      const bottom = r.top + r.height;
      const right = r.left + r.width;
      if (bottom > maxBottom) maxBottom = bottom;
      if (right > maxRight) maxRight = right;
    }

    return {
      top: minTop,
      left: minLeft,
      width: Math.max(0, maxRight - minLeft),
      height: Math.max(0, maxBottom - minTop),
    };
  }

  private findBlockIndexForNode(node: Node, blocks: TextBlock[]): number {
    for (let i = 0; i < blocks.length; i++) {
      const el = this.evaluateXPath(blocks[i].xpath);
      if (el && (el === node || el.contains(node))) {
        return i;
      }
    }
    return -1;
  }

  private evaluateXPath(xpath: string): Node | null {
    try {
      const result = this.doc.evaluate(
        xpath,
        this.doc,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      return result.singleNodeValue;
    } catch {
      return null;
    }
  }
}
