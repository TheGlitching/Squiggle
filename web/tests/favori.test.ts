/**
 * The bookmark "Analyser avec Squiggle". Pinned: it reads the article with the
 * extension's extractor, scrolls through a page that renders its end late,
 * and the address /favori hands out is one runnable script that opens this
 * very site's /analyser with the article in the fragment, never in a request.
 */
import { describe, expect, it, vi } from 'vitest';

import { readPage } from '../src/favori/lecture';
import { bookmarkletFor } from '../src/pages/Favori';
import { articleFromShare, sharedParams } from '../src/paste';

const PARAGRAPHS = [
  'Le gouvernement a présenté mardi son projet de budget pour l’année prochaine, avec douze milliards d’économies.',
  'Les économies prévues portent surtout sur les dépenses de fonctionnement des ministères et des opérateurs.',
  'L’opposition dénonce un texte qui ne tient pas compte de la hausse des prix et promet de l’amender.',
];
const LATE = 'Le texte sera examiné à l’Assemblée nationale à partir du 14 octobre, en commission puis en séance.';

function page(): Document {
  return new DOMParser().parseFromString(
    `<html lang="fr"><head><title>Budget : douze milliards d’économies</title>
      <link rel="canonical" href="https://presse.example/budget"></head>
      <body><nav><a href="/">Accueil</a><a href="/politique">Politique</a></nav>
      <article><h1>Budget : douze milliards d’économies</h1>${PARAGRAPHS.map((p) => `<p>${p}</p>`).join('')}</article>
      <footer>Mentions légales</footer></body></html>`,
    'text/html',
  );
}

describe('readPage', () => {
  it('reads the article, once a page that renders its end as the reader scrolls has rendered it', async () => {
    const doc = page();
    const article = doc.querySelector('article')!;
    let scrolled = 0;
    // The end of the article is below the screen until the page has been scrolled twice.
    article.getBoundingClientRect = () => ({ bottom: scrolled >= 2 ? 500 : 3000 }) as DOMRect;
    Object.defineProperty(doc.documentElement, 'scrollHeight', { value: 5000 });
    const win: { scrollY: number } & Record<string, unknown> = {
      document: doc,
      innerHeight: 800,
      scrollY: 120,
      location: { href: 'https://presse.example/budget?utm_source=app' },
      scrollBy: vi.fn((_x: number, y: number) => {
        win.scrollY += y;
        if (++scrolled === 2) article.insertAdjacentHTML('beforeend', `<p>${LATE}</p>`);
      }),
      scrollTo: vi.fn(),
    };

    const read = await readPage(doc, win as unknown as Window);
    expect(read.title).toBe('Budget : douze milliards d’économies');
    // The headline is the title, not also the first line.
    expect(read.text).toBe([...PARAGRAPHS, LATE].join('\n'));
    expect(read.text).not.toMatch(/Accueil|Mentions légales/);
    expect(win.scrollTo).toHaveBeenCalledWith(0, 120);
  });

  it('reads what is there at once when the page will not scroll', async () => {
    const doc = page();
    doc.querySelector('article')!.getBoundingClientRect = () => ({ bottom: 3000 }) as DOMRect;
    Object.defineProperty(doc.documentElement, 'scrollHeight', { value: 5000 });
    const win = { document: doc, innerHeight: 800, scrollY: 0, location: { href: '' }, scrollBy: vi.fn(), scrollTo: vi.fn() };
    const started = Date.now();
    const read = await readPage(doc, win as unknown as Window);
    expect(read.text).toBe(PARAGRAPHS.join('\n'));
    expect(win.scrollBy).toHaveBeenCalledTimes(1);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe('the bookmark /favori hands out', () => {
  it('is one script that opens this site’s /analyser with the article in the fragment', async () => {
    const address = bookmarkletFor('https://staging.squiggle.example');
    expect(address.startsWith('javascript:')).toBe(true);
    // Percent-encoded throughout: no `#` that a browser would cut the address at.
    expect(address).not.toMatch(/[#\s]/);
    const code = decodeURIComponent(address.slice('javascript:'.length));
    expect(code).not.toContain('__SQUIGGLE_ORIGIN__');
    expect(code).not.toMatch(/fetch\(|XMLHttpRequest|sendBeacon|createElement\("script"\)/);

    // Run it on an article page, as a tap on the bookmark does.
    const doc = page();
    document.documentElement.innerHTML = doc.documentElement.innerHTML;
    let opened = '';
    const location = { href: 'https://presse.example/budget' };
    Object.defineProperty(location, 'href', {
      get: () => 'https://presse.example/budget',
      set: (value: string) => {
        opened = value;
      },
    });
    new Function('location', code)(location);
    await vi.waitFor(() => expect(opened).not.toBe(''), { timeout: 3000 });
    expect(opened.startsWith('https://staging.squiggle.example/analyser#')).toBe(true);
    const params = sharedParams({ search: '', hash: opened.slice(opened.indexOf('#')) });
    expect(params.get('via')).toBe('favori');
    expect(articleFromShare(params)).toEqual({
      title: 'Budget : douze milliards d’économies',
      source: 'https://presse.example/budget',
      text: PARAGRAPHS.join('\n'),
    });
  });
});
