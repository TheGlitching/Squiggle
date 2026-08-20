import { describe, expect, it } from 'vitest';
import { detectSocialPlatform } from '../src/content/socialPlatform';
import { ContentScriptController } from '../src/content/contentScript';
import { SocialExtractor } from '../src/content/socialExtractor';

describe('social platform classification', () => {
  it('classifies an X status page as x', () => {
    const m = detectSocialPlatform('x.com', '/someuser/status/129182938473');
    expect(m?.platform).toBe('x');
    expect(m?.threadPath).toContain('/status/');
  });

  it('recognises twitter.com and the www-prefixed hosts', () => {
    expect(detectSocialPlatform('twitter.com', '/u/status/1')?.platform).toBe('x');
    expect(detectSocialPlatform('www.twitter.com', '/u/status/1')?.platform).toBe('x');
    expect(detectSocialPlatform('www.x.com', '/u/status/1')?.platform).toBe('x');
  });

  it('returns nothing for the timeline or non-status pages', () => {
    expect(detectSocialPlatform('x.com', '/')).toBeNull();
    expect(detectSocialPlatform('x.com', '/home')).toBeNull();
    expect(detectSocialPlatform('x.com', '/someuser')).toBeNull();
    expect(detectSocialPlatform('example.com', '')).toBeNull();
  });
});

describe('SocialExtractor - X thread to article', () => {
  function xDoc(html: string): Document {
    const doc = document.implementation.createHTMLDocument('X thread');
    const main = doc.createElement('main');
    main.innerHTML = html;
    doc.body.appendChild(main);
    return doc;
  }

  function post(opts: { id: string; handle: string; text: string; time?: string; link?: { href: string; text: string }; quote?: string }): string {
    const quote = opts.quote
      ? `<div data-testid="tweet-quoted"><article data-testid="tweet"><div data-testid="tweetText">${opts.quote}</div></article></div>`
      : '';
    const link = opts.link
      ? `<a href="${opts.link.href}">${opts.link.text}</a>`
      : '';
    return `<article data-testid="tweet">
      <div data-testid="User-Name"><a href="/${opts.handle}">@${opts.handle}</a></div>
      <a href="/${opts.handle}/status/${opts.id}">${opts.time ?? ''}</a>
      <time datetime="${opts.time ?? '2024-01-01T00:00:00.000Z'}"></time>
      <div data-testid="tweetText">${opts.text}</div>
      ${link}
      ${quote}
    </article>`;
  }

  it('assembles a multi-post thread in DOM order as one article', () => {
    const doc = xDoc(
      post({ id: '1', handle: 'alice', text: 'Premier constat.' }) +
        post({ id: '2', handle: 'alice', text: 'Second constat.' })
    );
    const article = new SocialExtractor(doc, 'x', 'https://x.com/alice/status/1').extract();
    expect(article).not.toBeNull();
    expect(article!.wordCount).toBeGreaterThanOrEqual(4);
    expect(article!.blocks.some((b) => b.cleanText === 'Premier constat.')).toBe(true);
    expect(article!.blocks.some((b) => b.cleanText === 'Second constat.')).toBe(true);
    expect(article!.metadata.title).toContain('alice');
  });

  it('marks a quoted tweet as a block and keeps the author handle', () => {
    const doc = xDoc(
      post({ id: '1', handle: 'alice', text: 'Réponse.', quote: 'Citation de Bob.' })
    );
    const article = new SocialExtractor(doc, 'x', 'https://x.com/alice/status/1').extract();
    expect(article?.blocks.some((b) => b.isQuote && b.cleanText.includes('Citation'))).toBe(true);
    expect(article?.metadata.byline).toBe('@alice');
  });

  it('captures outbound links as citations and drops thread chrome', () => {
    const doc = xDoc(
      post({
        id: '1',
        handle: 'alice',
        text: 'Voir le rapport.',
        link: { href: 'https://www.insee.fr/stat/1', text: "l'étude de l'Insee" }
      })
    );
    const article = new SocialExtractor(doc, 'x', 'https://x.com/alice/status/1').extract();
    expect(article?.citedSources).toEqual([
      { href: 'https://www.insee.fr/stat/1', domain: 'www.insee.fr', text: "l'étude de l'Insee" }
    ]);
  });

  it('returns null on a page that classified as X but rendered no posts', () => {
    const doc = xDoc('<p>loading…</p>');
    const article = new SocialExtractor(doc, 'x', 'https://x.com/alice/status/1').extract();
    expect(article).toBeNull();
  });

  it('de-duplicates the same status traversed twice', () => {
    const doc = xDoc(post({ id: '1', handle: 'alice', text: 'Unique.' }) + post({ id: '1', handle: 'alice', text: 'Dup.' }));
    const article = new SocialExtractor(doc, 'x', 'https://x.com/alice/status/1').extract();
    expect(article?.blocks.filter((b) => b.id.startsWith('post-'))).toHaveLength(1);
  });
});

describe('ContentScriptController - social routing', () => {
  it('extracts the social thread for an X status URL', () => {
    const doc = document.implementation.createHTMLDocument('X');
    doc.body.innerHTML =
      '<main><article data-testid="tweet"><div data-testid="tweetText">Le fil commence ici.</div></article></main>';
    const ctl = new ContentScriptController(doc, 'https://x.com/bob/status/9384');
    const article = ctl.detectAndExtract();
    expect(article.detectionMethod).toBe('social-thread');
    expect(article.cleanText).toContain('Le fil commence ici.');
  });

  it('falls back to the semantic extractor off a social thread URL', () => {
    const doc = document.implementation.createHTMLDocument('Example');
    doc.body.innerHTML = '<main><article><p>Un article classique.</p></article></main>';
    const ctl = new ContentScriptController(doc, 'https://example.com/article');
    const article = ctl.detectAndExtract();
    expect(article.detectionMethod).not.toBe('social-thread');
  });
});