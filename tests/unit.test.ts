import { describe, it, expect, beforeEach } from 'vitest';
import { ArticleExtractor } from '../shared/src/extract/extractor';
import { RangeTracker } from '../src/content/rangeTracker';
import { ContentScriptController } from '../src/content/contentScript';

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

describe('Article container', () => {
  const post = (n: number) =>
    `<div class="post"><p>Mise à jour ${n} : le ministère a publié de nouveaux chiffres sur la situation, avec le détail de chaque région.</p></div>`;

  it('reads a live page whose only <article> is its credits box, not that box', () => {
    const doc = new DOMParser().parseFromString(
      `<body><main><article class="context"><p>Ce live a été animé par deux journalistes du service International.</p></article>
        ${Array.from({ length: 12 }, (_, i) => post(i + 1)).join('')}</main></body>`,
      'text/html',
    );
    const blocks = new ArticleExtractor(doc).extract().blocks.map((b) => b.cleanText);
    expect(blocks).toHaveLength(13);
    expect(blocks.filter((b) => b.startsWith('Mise à jour'))).toHaveLength(12);
  });

  it('keeps the <article> when it is the main text, beside the page around it', () => {
    const doc = new DOMParser().parseFromString(
      `<body><main><article>${Array.from({ length: 8 }, (_, i) => post(i + 1)).join('')}</article>
        <section><p>Les plus lus : une autre histoire, résumée en une phrase pour donner envie de cliquer dessus.</p></section></main></body>`,
      'text/html',
    );
    const blocks = new ArticleExtractor(doc).extract().blocks.map((b) => b.cleanText);
    expect(blocks).toHaveLength(8);
  });

  // A WordPress page whose body is a plain div in <main>, with an embedded map, and whose
  // only <article> elements are the related-article cards below the main column.
  const cards = (teaser: string) =>
    `<section>${Array.from(
      { length: 4 },
      (_, i) => `<article class="item"><a href="/autre-${i}"><h3>Autre article ${i}</h3></a>${teaser}</article>`,
    ).join('')}</section>`;
  const page = (wrapper: string, teaser: string) =>
    `<body>${wrapper.replace(
      '%',
      `<div class="entry-content">${post(1)}<iframe src="about:blank" title="Carte interactive"></iframe>${Array.from({ length: 7 }, (_, i) => post(i + 2)).join('')}</div>`,
    )}${cards(teaser)}</body>`;

  it.each([
    ['link-only cards beside <main>', '<main>%</main>', ''],
    ['cards with a teaser beside <main>', '<main>%</main>', '<p>Un résumé court.</p>'],
    ['link-only cards and no <main>', '<div>%</div>', ''],
  ])('reads the article body, not a related-article card (%s)', (_name, wrapper, teaser) => {
    const doc = new DOMParser().parseFromString(page(wrapper, teaser), 'text/html');
    const blocks = new ArticleExtractor(doc).extract().blocks.map((b) => b.cleanText);
    expect(blocks.filter((b) => b.startsWith('Mise à jour'))).toHaveLength(8);
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
