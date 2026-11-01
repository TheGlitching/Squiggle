/**
 * The bookmark "Analyser avec Squiggle". Pinned: it scrolls through a page
 * that renders its end late, takes the page without what the reader cannot
 * see, and the address /favori hands out is one runnable script, short
 * enough for Chrome on Android to keep whole, that opens this very site's
 * /analyser with the page in the fragment, never in a request, where the
 * extension's extractor reads the article out of it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { MAX_MESSAGE_CHARS } from '../../shared/src/engine/message';
import { ArticleExtractor } from '../../shared/src/extract/extractor';

import { carriesPage, readFavori } from '../src/favori/article';
import { readPage } from '../src/favori/lecture';
import { pageFragment } from '../src/favori/payload';
import { bookmarkletFor } from '../src/pages/Favori';
import { sharedParams } from '../src/paste';

const PARAGRAPHS = [
  'Le gouvernement a présenté mardi son projet de budget pour l’année prochaine, avec douze milliards d’économies.',
  'Les économies prévues portent surtout sur les dépenses de fonctionnement des ministères et des opérateurs.',
  'L’opposition dénonce un texte qui ne tient pas compte de la hausse des prix et promet de l’amender.',
];
const LATE = 'Le texte sera examiné à l’Assemblée nationale à partir du 14 octobre, en commission puis en séance.';
const HIDDEN = 'Ce paragraphe est réservé aux abonnés et n’est pas affiché au lecteur qui lit cette page sans compte.';

const ARTICLE_HTML = `<html lang="fr"><head><title>Budget : douze milliards d’économies</title>
  <link rel="canonical" href="https://presse.example/budget"><link rel="icon" href="/favicon.ico">
  <script>window.tracker = 1;</script><style>.x{}</style></head>
  <body><nav><a href="/">Accueil</a><a href="/politique">Politique</a></nav>
  <article><h1>Budget : douze milliards d’économies</h1>${PARAGRAPHS.map((p) => `<p>${p}</p>`).join('')}
  <p style="display:none">${HIDDEN}</p><img src="/photo.jpg" alt="Le ministre"></article>
  <footer>Mentions légales</footer></body></html>`;

/** The page as the bookmark takes it: nothing hidden left in it. */
const VISIBLE_HTML = ARTICLE_HTML.replace(/<p style="display:none">.*?<\/p>/, '');

function page(): Document {
  return new DOMParser().parseFromString(ARTICLE_HTML, 'text/html');
}

/** A window over `doc` whose styles come from the elements' own `style` attribute. */
function windowOver(doc: Document, extra: Record<string, unknown> = {}) {
  return {
    document: doc,
    innerHeight: 800,
    scrollY: 0,
    location: { href: '' },
    scrollBy: vi.fn(),
    scrollTo: vi.fn(),
    getComputedStyle: (el: HTMLElement) => ({ display: el.style.display, visibility: el.style.visibility, opacity: el.style.opacity }),
    ...extra,
  };
}

describe('readPage', () => {
  it('takes the page once one that renders its end as the reader scrolls has rendered it', async () => {
    const doc = page();
    const article = doc.querySelector('article')!;
    let scrolled = 0;
    // The end of the article is below the screen until the page has been scrolled twice.
    article.getBoundingClientRect = () => ({ bottom: scrolled >= 2 ? 500 : 3000 }) as DOMRect;
    Object.defineProperty(doc.documentElement, 'scrollHeight', { value: 5000 });
    const win = windowOver(doc, { scrollY: 120 });
    win.scrollBy = vi.fn((_x: number, y: number) => {
      win.scrollY += y;
      if (++scrolled === 2) article.insertAdjacentHTML('beforeend', `<p>${LATE}</p>`);
    });

    const html = await readPage(doc, win as unknown as Window);
    expect(html).toContain(LATE);
    expect(win.scrollTo).toHaveBeenCalledWith(0, 120);
  });

  it('leaves out what the reader cannot see and what the extractor never reads, and leaves the page as it was', async () => {
    const doc = page();
    doc.querySelector('article')!.getBoundingClientRect = () => ({ bottom: 500 }) as DOMRect;
    const html = await readPage(doc, windowOver(doc) as unknown as Window);
    expect(html).toContain(PARAGRAPHS[2]);
    expect(html).toContain('rel="canonical"');
    expect(html).not.toMatch(new RegExp(`${HIDDEN}|tracker|favicon|<style|<img`));
    expect(doc.querySelector('[data-squiggle-hidden]')).toBeNull();
    expect(doc.querySelector('img')).not.toBeNull();
  });

  it('does not scroll a social post into its comments', async () => {
    const doc = page();
    doc.querySelector('article')!.getBoundingClientRect = () => ({ bottom: 3000 }) as DOMRect;
    Object.defineProperty(doc.documentElement, 'scrollHeight', { value: 5000 });
    const win = windowOver(doc, { location: { href: 'https://www.instagram.com/p/DcqkO2BljsL/', hostname: 'www.instagram.com' } });
    expect(await readPage(doc, win as unknown as Window)).toContain(PARAGRAPHS[0]);
    expect(win.scrollBy).not.toHaveBeenCalled();
  });

  it('takes what is there at once when the page will not scroll', async () => {
    const doc = page();
    doc.querySelector('article')!.getBoundingClientRect = () => ({ bottom: 3000 }) as DOMRect;
    Object.defineProperty(doc.documentElement, 'scrollHeight', { value: 5000 });
    const win = windowOver(doc);
    const started = Date.now();
    expect(await readPage(doc, win as unknown as Window)).toContain(PARAGRAPHS[0]);
    expect(win.scrollBy).toHaveBeenCalledTimes(1);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe('readFavori', () => {
  it('reads the article out of the page with the extension’s extractor, gzipped or not', async () => {
    for (const compress of [true, false]) {
      const saved = globalThis.CompressionStream;
      if (!compress) vi.stubGlobal('CompressionStream', undefined);
      const fragment = await pageFragment(VISIBLE_HTML, 'https://presse.example/budget?utm_source=app');
      vi.stubGlobal('CompressionStream', saved);
      const params = sharedParams({ search: '', hash: fragment });
      expect(params.has(compress ? 'page' : 'html')).toBe(true);
      expect(carriesPage(params)).toBe(true);
      expect(await readFavori(params)).toEqual({
        title: 'Budget : douze milliards d’économies',
        url: 'https://presse.example/budget',
        // The headline is the title, not also the first line.
        text: PARAGRAPHS.join('\n'),
      });
    }
  });

  it('keeps the address the reader had when the page names no canonical one', async () => {
    const html = VISIBLE_HTML.replace(/<link rel="canonical"[^>]*>/, '');
    const params = sharedParams({ search: '', hash: await pageFragment(html, 'https://presse.example/budget?id=4') });
    expect((await readFavori(params)).url).toBe('https://presse.example/budget?id=4');
  });

  it('is not the reading of a bookmark saved before, which brings the text itself', () => {
    expect(carriesPage(new URLSearchParams({ title: 'T', text: 'x', url: 'https://presse.example/', via: 'favori' }))).toBe(false);
  });
});

/** Runs the bookmark on the page in `document`, as a tap does, and returns the address it opens. */
async function tapBookmark(href: string): Promise<string> {
  const code = decodeURIComponent(bookmarkletFor('https://staging.squiggle.example').slice('javascript:'.length));
  let opened = '';
  const location = {};
  Object.defineProperty(location, 'href', {
    get: () => href,
    set: (value: string) => {
      opened = value;
    },
  });
  new Function('location', code)(location);
  await vi.waitFor(() => expect(opened).not.toBe(''), { timeout: 3000 });
  return opened;
}

describe('the bookmark /favori hands out', () => {
  it('fits in the 5,000 characters Chrome on Android keeps of a bookmark’s address', () => {
    expect(bookmarkletFor('https://staging.squiggle.example').length).toBeLessThan(4000);
  });

  it('is one script that opens this site’s /analyser with the page in the fragment', async () => {
    const address = bookmarkletFor('https://staging.squiggle.example');
    expect(address.startsWith('javascript:')).toBe(true);
    // Percent-encoded throughout: no `#` that a browser would cut the address at.
    expect(address).not.toMatch(/[#\s]/);
    const code = decodeURIComponent(address.slice('javascript:'.length));
    expect(code).not.toContain('__SQUIGGLE_ORIGIN__');
    expect(code).not.toMatch(/fetch\(|XMLHttpRequest|sendBeacon|createElement\("script"\)/);

    // Run it on an article page, as a tap on the bookmark does.
    document.documentElement.innerHTML = page().documentElement.innerHTML;
    const opened = await tapBookmark('https://presse.example/budget');
    expect(opened.startsWith('https://staging.squiggle.example/analyser#')).toBe(true);
    const params = sharedParams({ search: '', hash: opened.slice(opened.indexOf('#')) });
    expect(params.get('via')).toBe('favori');
    expect(await readFavori(params)).toEqual({
      title: 'Budget : douze milliards d’économies',
      url: 'https://presse.example/budget',
      text: PARAGRAPHS.join('\n'),
    });
  });
});

describe('the bookmark on saved press pages', () => {
  // The extractor's own fixtures (`tests/extractorFixtures.test.ts`), each a reconstruction of one title's page.
  it.each(['lesechos', 'lefigaro', 'lemonde'])('brings %s’s article to /analyser as the extension reads it', async (title) => {
    const html = readFileSync(join(__dirname, '../../tests/fixtures/articles', `${title}.html`), 'utf8');
    const saved = new DOMParser().parseFromString(html, 'text/html');
    const extension = new ArticleExtractor(saved).extract();
    const lines = extension.blocks.map((block) => block.cleanText);
    if (lines[0] === extension.metadata.title.trim()) lines.shift();

    document.documentElement.innerHTML = saved.documentElement.innerHTML;
    const opened = await tapBookmark(`https://www.${title}.fr/article`);
    const read = await readFavori(sharedParams({ search: '', hash: opened.slice(opened.indexOf('#')) }));
    expect(read.text.length).toBeGreaterThan(500);
    expect(read.title).toBe(extension.metadata.title.replace(/\s+/g, ' ').trim());
    expect(read.text).toBe(lines.join('\n'));
  });
});

describe('the bookmark on a social post', () => {
  // Public posts as the bookmark copied them, signed out, in Android's web view (`tests/fixtures/social/`).
  const fixture = (name: string) => readFileSync(join(__dirname, '../../tests/fixtures/social', `${name}.html`), 'utf8');
  const read = async (name: string, url: string) =>
    readFavori(sharedParams({ search: '', hash: await pageFragment(fixture(name), url) }));

  it('brings the whole Instagram caption, titled with the network and the account', async () => {
    const post = await read('instagram-signed-out-post', 'https://www.instagram.com/p/DcqkO2BljsL/?igsh=xyz');
    expect(post.title).toBe('Publication Instagram de NASA');
    expect(post.network).toBe('Instagram');
    expect(post.url).toBe('https://www.instagram.com/p/DcqkO2BljsL/');
    expect(post.text.split('\n')[0]).toBe('Ad astra ⭐');
    expect(post.text).toContain('Nancy Grace Roman Space Telescope');
    expect(post.problem).toBeUndefined();
  });

  it.each([
    ['x-signed-out-meta', 'https://x.com/NASA/status/2116263878807998722?s=46', 'Publication X de NASA (@NASA)', /^MAX POWER/],
    ['threads-signed-out-post', 'https://www.threads.com/@nasa/post/DfKe2cBEYvb', 'Publication Threads de NASA (@nasa)', /^Watch live/],
    ['tiktok-signed-out-video', 'https://www.tiktok.com/@nasa/video/7679483952507276558', 'Publication TikTok de NASA', /^A pretty historic day here at NASA 🏅💫$/],
  ])('brings the post of %s, short enough to be read as a message', async (name, url, title, text) => {
    const post = await read(name, url);
    expect(post.title).toBe(title);
    expect(post.text).toMatch(text);
    expect(post.text.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS);
  });

  it('brings nothing of a Facebook post cut after its first line, and says why', async () => {
    const post = await read('facebook-signed-out-post', 'https://www.facebook.com/story.php?story_fbid=1672153010946735&id=100044561550831');
    expect(post).toMatchObject({ text: '', network: 'Facebook', problem: 'cut' });
  });

  it('brings nothing of a consent wall or a profile, not even the banner’s text', async () => {
    const post = await read('facebook-consent', 'https://www.facebook.com/cookie/consent');
    expect(post).toMatchObject({ text: '', problem: 'not_a_post' });
  });

  it('brings nothing of a YouTube Short, whose link is looked up instead', async () => {
    const post = await read('youtube-short', 'https://m.youtube.com/shorts/-62C9R_41Sc');
    expect(post).toMatchObject({ text: '', url: 'https://m.youtube.com/shorts/-62C9R_41Sc', problem: 'video' });
  });
});
