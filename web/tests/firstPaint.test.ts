/**
 * The built page fetches nothing beyond its first screen before the browser reports its
 * first contentful paint (`firstPaintReady` in vite.config.ts). An animation frame is
 * not that moment: on PageSpeed's phone it ran a second before the frame was shown, so
 * the app's script and the Newsreader faces were fetched during the first paint and
 * counted as holding it back. Reads web/dist, so build the web app first.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const page = readFileSync(join(__dirname, '../dist/index.html'), 'utf8');
const loader = [...page.matchAll(/<script>(\{ let started[\s\S]*?)<\/script>/g)];
const BEACON = 'https://static.cloudflareinsights.com/beacon.min.js';
/** The faces, the app and, in a build given the analytics token, Cloudflare's script. */
const STARTED = page.includes(BEACON) ? 3 : 2;

/** Runs the page's loader against a browser whose paint, timers and DOM the test drives. */
function boot({ paintTiming = true, rootText = 'Un deuxième avis sur votre lecture.' } = {}) {
  const fetched: string[] = [];
  const timers: Array<{ at: number; run: () => void }> = [];
  const listeners: Record<string, () => void> = {};
  let observer: ((list: { getEntriesByName: (name: string) => unknown[] }) => void) | undefined;
  let frame: (() => void) | undefined;
  let now = 0;
  const appended = (node: { src?: string; textContent?: string }) =>
    fetched.push(node.src ?? (node.textContent?.includes('Newsreader') ? 'newsreader' : 'style'));
  const browser = {
    window: { PerformanceObserver: { supportedEntryTypes: paintTiming ? ['paint'] : [] } },
    PerformanceObserver: class {
      constructor(callback: typeof observer) {
        observer = callback;
      }
      observe() {}
    },
    addEventListener: (type: string, listener: () => void) => (listeners[type] = listener),
    setTimeout: (run: () => void, ms = 0) => timers.push({ at: now + ms, run }),
    requestAnimationFrame: (run: () => void) => (frame = run),
    document: {
      createElement: () => ({ dataset: {} }),
      head: { append: appended },
      body: { append: appended },
      getElementById: () => ({ textContent: rootText }),
    },
    load: (src: string) => fetched.push(src),
  };
  const run = new Function(...Object.keys(browser), loader[0][1].replace("import('", "load('"));
  run(...Object.values(browser));
  const advance = (ms: number) => {
    now += ms;
    for (const timer of timers.splice(0).sort((a, b) => a.at - b.at)) {
      if (timer.at <= now) timer.run();
      else timers.push(timer);
    }
  };
  return {
    fetched,
    advance,
    paint: () => observer?.({ getEntriesByName: (name) => (name === 'first-contentful-paint' ? [{}] : []) }),
    otherPaint: () => observer?.({ getEntriesByName: () => [] }),
    contentLoaded: () => listeners.DOMContentLoaded?.(),
    frame: () => frame?.(),
  };
}

describe('the built home page', () => {
  it('has the one loader this test drives', () => {
    expect(loader).toHaveLength(1);
    expect(page).not.toMatch(/<script type="module"[^>]*src="\/assets\//);
  });

  it('fetches the app and the Newsreader faces only once the first contentful paint is reported', () => {
    const browser = boot();
    browser.contentLoaded();
    browser.otherPaint();
    browser.advance(1000);
    expect(browser.fetched).toEqual([]);

    browser.paint();
    browser.advance(0);
    expect(browser.fetched).toHaveLength(STARTED);
    expect(browser.fetched[0]).toBe('newsreader');
    expect(browser.fetched.at(-1)).toMatch(/^\/assets\/index-.*\.js$/);

    browser.advance(4000);
    expect(browser.fetched).toHaveLength(STARTED);
  });

  it('starts at once when there is nothing to paint, and after four seconds when no paint is reported', () => {
    const empty = boot({ rootText: '  ' });
    empty.contentLoaded();
    expect(empty.fetched).toHaveLength(STARTED);

    const unreported = boot();
    unreported.contentLoaded();
    unreported.advance(3999);
    expect(unreported.fetched).toEqual([]);
    unreported.advance(1);
    expect(unreported.fetched).toHaveLength(STARTED);
  });

  it('falls back to the next frame where paint timing is not supported', () => {
    const browser = boot({ paintTiming: false });
    browser.frame();
    expect(browser.fetched).toEqual([]);
    browser.advance(0);
    expect(browser.fetched).toHaveLength(STARTED);
  });

  it('loads Cloudflare Web Analytics, when the build was given its token, with the app and not before', () => {
    const browser = boot();
    browser.advance(1000);
    expect(browser.fetched).toEqual([]);
    browser.paint();
    browser.advance(0);
    if (STARTED === 3) expect(browser.fetched).toContain(BEACON);
    else expect(browser.fetched).not.toContain(BEACON);
  });
});
