import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { Readability } from '@mozilla/readability';
import { ArticleExtractor } from '../shared/src/extract/extractor';

// One reconstruction per French title (national, regional, pure players) in
// tests/fixtures/articles, each with its own furniture: noscript image fallbacks,
// related-article cards, sign-in banners, promos, comment widgets. The article body
// is wrapped in [data-fixture-body]; that attribute is the ground truth and the
// extractor never reads it.
const DIR = join(__dirname, 'fixtures', 'articles');
const FIXTURES = readdirSync(DIR).filter(f => f.endsWith('.html')).sort();
const BLOCK_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, blockquote, li';

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

// A browser with scripting on parses <noscript> content as raw text, which is what
// made "<img src=...>" reach the audit prompt. Reproduce that before parsing, which
// also keeps the test from loading the fallback images.
function load(file: string): Document {
  const html = readFileSync(join(DIR, file), 'utf8').replace(
    /<noscript>([\s\S]*?)<\/noscript>/g,
    (_m, inner: string) =>
      `<noscript>${inner.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</noscript>`
  );
  return new DOMParser().parseFromString(html, 'text/html');
}

function measure(file: string) {
  const doc = load(file);
  // A block inside another block (a quote's paragraph) is read as part of the outer one.
  const truth = new Set(
    Array.from(doc.querySelectorAll(`[data-fixture-body] :is(${BLOCK_SELECTOR})`))
      .filter(el => !el.parentElement?.closest(`[data-fixture-body] :is(${BLOCK_SELECTOR})`))
      .map(el => norm(el.textContent ?? ''))
  );
  const article = new ArticleExtractor(doc).extract();
  const sent = article.blocks.reduce((n, b) => n + b.cleanText.length, 0);
  const inBody = article.blocks.filter(b => truth.has(b.cleanText)).reduce((n, b) => n + b.cleanText.length, 0);
  const bodyChars = Array.from(truth).reduce((n, t) => n + t.length, 0);
  return { doc, article, truth, sent, inBody, bodyChars };
}

describe('Article extraction on saved French pages', () => {
  it('covers at least ten titles', () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(10);
  });

  it('sends at least 90% article characters on the whole set', () => {
    const total = FIXTURES.map(measure).reduce(
      (acc, m) => ({ sent: acc.sent + m.sent, inBody: acc.inBody + m.inBody }),
      { sent: 0, inBody: 0 }
    );
    expect(total.inBody / total.sent).toBeGreaterThanOrEqual(0.9);
  });

  describe.each(FIXTURES)('%s', file => {
    const m = measure(file);

    it('sends at least 90% article characters', () => {
      expect(m.inBody / m.sent).toBeGreaterThanOrEqual(0.9);
    });

    it('keeps the article body, not just less of the page', () => {
      expect(m.inBody / m.bodyChars).toBeGreaterThanOrEqual(0.9);
    });

    it('never sends markup from a noscript fallback', () => {
      for (const b of m.article.blocks) {
        expect(b.text).not.toMatch(/<\s*(img|noscript|script)\b/i);
        expect(b.cleanText).not.toMatch(/src=/);
      }
    });

    it('agrees with Readability on what the article text is', () => {
      const oracle = new Readability(m.doc.cloneNode(true) as Document).parse();
      const text = norm(oracle?.textContent ?? '');
      const agreed = m.article.blocks
        .filter(b => text.includes(b.cleanText.slice(0, 40)))
        .reduce((n, b) => n + b.cleanText.length, 0);
      expect(agreed / m.sent).toBeGreaterThanOrEqual(0.9);
    });
  });

  it('keeps a standfirst whose class is lead, heading, headline or thread', () => {
    const { article } = measure('sudouest.html');
    const texts = article.blocks.map(b => b.cleanText);
    expect(texts.some(t => t.startsWith('Quarante-trois millions'))).toBe(true);
    expect(texts.some(t => t.startsWith('Le vote est intervenu'))).toBe(true);
  });

  it('keeps a list of external sources while dropping lists of site links', () => {
    const { article } = measure('lacroix.html');
    const texts = article.blocks.map(b => b.cleanText);
    expect(texts.some(t => t.startsWith('Rapport sur l'))).toBe(true);
    expect(article.citedSources.map(s => s.href).sort()).toEqual([
      'https://www.education.gouv.example.invalid/rapport-batiments',
      'https://www.insee.example.invalid/statistiques/ecoles',
    ]);
    expect(article.blocks.some(b => b.cleanText.includes('Un nouveau gymnase'))).toBe(false);
  });

  it('reads an embedded post once, and leaves out a dialog and a video carousel inside the article', () => {
    const { article } = measure('franceinfo-enquete.html');
    const texts = article.blocks.map(b => b.cleanText);
    expect(texts.filter(t => t.includes('Des vigiles bénévoles poussent'))).toHaveLength(1);
    expect(article.blocks.find(b => b.cleanText.includes('Des vigiles bénévoles poussent'))?.isQuote).toBe(true);
    expect(new Set(texts).size).toBe(texts.length);
    expect(texts.some(t => /connectez-vous|Sans paiement/.test(t))).toBe(false);
    expect(texts).not.toContain('Shorts');
    expect(texts.some(t => t.startsWith('Franceinfo a pu consulter une autre vidéo'))).toBe(true);
  });
});
