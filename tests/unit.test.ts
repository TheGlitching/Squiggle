import { describe, it, expect, beforeEach } from 'vitest';
import { ArticleExtractor } from '../src/content/extractor';
import { RangeTracker } from '../src/content/rangeTracker';
import { ContentScriptController } from '../src/content/contentScript';
import { TextBlock, FindingHighlightTarget } from '../src/content/types';

describe('Article Detection & Extraction Unit Tests', () => {
  let mockDoc: Document;

  beforeEach(() => {
    mockDoc = document.implementation.createHTMLDocument('Test Document');
  });

  it('extracts metadata from OpenGraph and meta tags', () => {
    const metaTitle = mockDoc.createElement('meta');
    metaTitle.setAttribute('property', 'og:title');
    metaTitle.setAttribute('content', 'Le Monde - Analyse Critique');
    mockDoc.head.appendChild(metaTitle);

    const metaAuthor = mockDoc.createElement('meta');
    metaAuthor.setAttribute('name', 'author');
    metaAuthor.setAttribute('content', 'Claire Dubois');
    mockDoc.head.appendChild(metaAuthor);

    const extractor = new ArticleExtractor(mockDoc);
    const meta = extractor.extractMetadata();

    expect(meta.title).toBe('Le Monde - Analyse Critique');
    expect(meta.byline).toBe('Claire Dubois');
  });

  it('extracts article text blocks with coordinates and paragraph numbering', () => {
    const article = mockDoc.createElement('article');
    const p1 = mockDoc.createElement('p');
    p1.textContent = 'Premier paragraphe de test avec un contenu substantiel pour analyse.';
    const p2 = mockDoc.createElement('p');
    p2.textContent = 'Second paragraphe démontrant une argumentation rigoureuse sans sophisme.';
    article.appendChild(p1);
    article.appendChild(p2);
    mockDoc.body.appendChild(article);

    const extractor = new ArticleExtractor(mockDoc);
    const result = extractor.extract();

    expect(result.blocks.length).toBeGreaterThanOrEqual(2);
    expect(result.blocks[0].text).toContain('Premier paragraphe');
    expect(result.blocks[1].text).toContain('Second paragraphe');
    expect(result.blocks[0].nodeCoordinates.xpath).toBeDefined();
  });
});

describe('Range Tracking & Anchoring Unit Tests', () => {
  let mockDoc: Document;

  beforeEach(() => {
    mockDoc = document.implementation.createHTMLDocument('Test Document');
  });

  it('calculates dice coefficient and bounding box correctly', () => {
    const tracker = new RangeTracker(mockDoc);
    const sim1 = tracker.calculateDiceCoefficient('scientific consensus', 'scientific consensus');
    expect(sim1).toBe(1.0);

    const sim2 = tracker.calculateDiceCoefficient('unprecedented warming', 'unprecedented global warming trend');
    expect(sim2).toBeGreaterThan(0.6);

    const sim3 = tracker.calculateDiceCoefficient('cat', 'dog');
    expect(sim3).toBe(0);

    const bbox = tracker.computeBoundingBox([
      { top: 100, left: 50, width: 200, height: 20, lineIndex: 0 },
      { top: 125, left: 50, width: 150, height: 20, lineIndex: 1 },
    ]);
    expect(bbox.top).toBe(100);
    expect(bbox.left).toBe(50);
    expect(bbox.width).toBe(200);
    expect(bbox.height).toBe(45);
  });

  it('dispatches messages cleanly in ContentScriptController', () => {
    const controller = new ContentScriptController(mockDoc);
    const pingRes = controller.handleMessage({ type: 'FC_PING' });
    expect(pingRes.success).toBe(true);
    expect(pingRes.data).toBeDefined();

    const clearRes = controller.handleMessage({ type: 'FC_CLEAR_HIGHLIGHTS' });
    expect(clearRes.success).toBe(true);
  });
});
