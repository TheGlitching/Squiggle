/**
 * The iPhone shortcut is offered only when its signed file is in the build:
 * without it, /favori offers the bookmark alone and /raccourci sends the reader there.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/App';
import { Favori } from '../src/pages/Favori';
import { APP_PATHS, PUBLIC_PAGES, sitemap } from '../src/seo';

const build = vi.hoisted(() => ({ published: false }));
vi.mock('../src/shortcut', () => ({
  get SHORTCUT_PUBLISHED() {
    return build.published;
  },
}));

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  build.published = false;
  window.history.replaceState({}, '', '/');
});

describe('without the signed shortcut in the build', () => {
  it('on an iPhone, /favori offers the bookmark and no link to /raccourci', () => {
    vi.stubGlobal('navigator', { ...navigator, userAgent: IPHONE, maxTouchPoints: 5 });
    render(<Favori />);

    expect(screen.getByRole('button', { name: 'iPhone' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Copier le favori' })).toBeInTheDocument();
    expect(document.querySelector('a[href="/raccourci"]')).toBeNull();
  });

  it('/raccourci shows /favori, and is not in the sitemap', () => {
    window.history.replaceState({}, '', '/raccourci');
    render(<App />);

    expect(window.location.pathname).toBe('/favori');
    expect(screen.getByRole('heading', { level: 1, name: 'Analyser avec Squiggle' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ajouter le raccourci' })).toBeNull();
    expect(sitemap()).not.toContain('/raccourci');
    expect(PUBLIC_PAGES.map((page) => page.path)).not.toContain('/raccourci');
    expect(APP_PATHS).toContain('/raccourci');
  });
});

describe('with the signed shortcut in the build', () => {
  it('on an iPhone, /favori links to /raccourci, which offers the file', async () => {
    build.published = true;
    vi.stubGlobal('navigator', { ...navigator, userAgent: IPHONE, maxTouchPoints: 5 });
    render(<Favori />);
    expect(screen.getByRole('link', { name: 'ajouter le raccourci' })).toHaveAttribute('href', '/raccourci');
    cleanup();

    render(<App path="/raccourci" />);
    expect(screen.getByRole('link', { name: 'Ajouter le raccourci' })).toHaveAttribute(
      'href',
      '/raccourci/Analyser%20avec%20Squiggle.shortcut',
    );
  });
});
