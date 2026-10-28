/**
 * The /favori guide: only the reader's own browser, every gesture at once
 * before starting, one button that copies the bookmark and moves on to the
 * gesture that saves it, the step reached kept for a reader who comes back,
 * and an example article that says whether the bookmark works.
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/App';
import { readPage } from '../src/favori/lecture';
import { pageFragment } from '../src/favori/payload';
import { Favori, FavoriEssai, bookmarkletFor, favoriTried } from '../src/pages/Favori';
import { memoryStorage } from './helpers';

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36';

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState({}, '', '/');
});

const onAndroid = () => vi.stubGlobal('navigator', { ...navigator, userAgent: ANDROID, maxTouchPoints: 5 });

describe('Favori', () => {
  it('on an Android phone, copies the bookmark and moves on to saving it', async () => {
    vi.stubGlobal('navigator', { ...navigator, userAgent: ANDROID, maxTouchPoints: 5 });
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    render(<Favori />);

    expect(screen.getByRole('button', { name: 'Android' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Copier le favori' }));

    expect(writeText).toHaveBeenCalledWith(bookmarkletFor(window.location.origin));
    expect(screen.getByRole('heading', { name: 'Mettez cette page en favori' })).toHaveFocus();
    expect(screen.getByText('Étape 2 sur 5')).toBeInTheDocument();
  });

  it('on a computer, offers the bookmark to drag, with its javascript: address', () => {
    render(<Favori />);
    expect(screen.getByRole('link', { name: 'Analyser avec Squiggle' })).toHaveAttribute(
      'href',
      bookmarkletFor(window.location.origin),
    );
  });

  it('before starting, lists every gesture at once beside the drawing of each screen', async () => {
    onAndroid();
    const user = userEvent.setup();
    render(<Favori />);
    const overview = screen.getByRole('region', { name: 'Toute la marche, d’un coup d’œil' });
    expect(within(overview).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Copiez le favori, ici',
      '⋮, puis l’étoile ☆',
      '« Modifier », dans le bandeau en bas',
      'Collez dans « URL », puis retour',
      'Sur un article : barre d’adresse, « Analyser »',
    ]);
    await user.click(within(overview).getByRole('button', { name: 'Mettre l’animation en pause' }));
    expect(within(overview).getByRole('button', { name: 'Reprendre l’animation' })).toBeInTheDocument();
    // Once started, the guide shows one gesture at a time again.
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    await user.click(screen.getByRole('button', { name: 'Copier le favori' }));
    expect(screen.queryByRole('region', { name: 'Toute la marche, d’un coup d’œil' })).not.toBeInTheDocument();
  });

  it('back from the browser’s screens, resumes at the step reached and offers the try', () => {
    onAndroid();
    localStorage.setItem('squiggle.favori', JSON.stringify({ os: 'android', step: 3 }));
    render(<Favori />);
    expect(screen.getByRole('heading', { name: 'Collez le favori dans « URL »' })).toBeInTheDocument();
    expect(screen.getByText('Vous reprenez à l’étape 4.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tester mon favori' })).toHaveAttribute('href', '/favori/essai');
  });

  it('starts over when this browser keeps nothing', () => {
    onAndroid();
    const refuse = () => {
      throw new DOMException('denied', 'SecurityError');
    };
    vi.stubGlobal('localStorage', { getItem: refuse, setItem: refuse, removeItem: refuse });
    render(<Favori />);
    expect(screen.getByRole('heading', { name: 'Copiez le favori' })).toBeInTheDocument();
  });

  it('the bookmark run on the example article comes back to the guide, which says it works', async () => {
    onAndroid();
    window.history.replaceState({}, '', '/favori/essai');
    const { unmount } = render(<FavoriEssai />);
    const html = await readPage(document, {
      document,
      innerHeight: 800,
      scrollY: 0,
      scrollBy: vi.fn(),
      scrollTo: vi.fn(),
      getComputedStyle: () => ({}),
    } as unknown as Window);
    unmount();
    const hash = await pageFragment(html, 'https://squiggle.example/favori/essai');
    expect(favoriTried({ search: '', hash })).toBe(true);

    window.history.replaceState({}, '', `/analyser${hash}`);
    render(<App />);
    expect(await screen.findByText(/Votre favori marche/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'C’est prêt' })).toBeInTheDocument();
    expect(window.location.pathname + window.location.search + window.location.hash).toBe('/favori');
  });

  it('an article that is not the example is analysed as usual', async () => {
    const hash = await pageFragment('<p>Le budget est voté.</p>', 'https://presse.example/budget');
    expect(favoriTried({ search: '', hash })).toBe(false);
  });

  it('a bookmark saved before, which brings the example’s text, is recognised too', () => {
    const params = new URLSearchParams({
      title: 'Le favori à l’essai',
      url: 'https://squiggle.example/autre',
      text: 'Ce court article sert d’essai au favori « Analyser avec Squiggle ».',
      via: 'favori',
    });
    expect(favoriTried({ search: '', hash: `#${params}` })).toBe(true);
  });

  it('a bookmark that still opens this page, touched on the example, is sent back to the paste', () => {
    onAndroid();
    localStorage.setItem('squiggle.favori.essai', String(performance.timeOrigin - 1000));
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([{ type: 'navigate' } as PerformanceNavigationTiming]);
    render(<Favori />);
    expect(screen.getByText(/Votre favori a rouvert cette page/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Collez le favori dans « URL »' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recopier le favori' })).toBeInTheDocument();
    expect(localStorage.getItem('squiggle.favori.essai')).toBeNull();
  });
});
