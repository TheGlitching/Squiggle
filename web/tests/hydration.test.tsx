/**
 * The browser hydrates each page the build rendered (`src/main.tsx`), so the page's
 * first render in a browser must be the build's, on any device. A page that differs
 * would be thrown away and painted again once the app's script has run, which is the
 * slow first paint the build's prerendering exists to avoid.
 */
import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { App, READER_STATE_PAGES } from '../src/App';
import { PUBLIC_PAGES } from '../src/seo';
import { installFetch } from './helpers';

const DEVICES = {
  computer: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  phone: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
};

// The analysis page asks who is signed in: no one, here.
beforeEach(() => void installFetch(() => undefined));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
  document.body.replaceChildren();
});

const hydrated = PUBLIC_PAGES.map((page) => page.path).filter((path) => !READER_STATE_PAGES.includes(path));

it.each(Object.entries(DEVICES).flatMap(([device, agent]) => hydrated.map((path) => [path, device, agent] as const)))(
  '%s hydrates on a %s without a mismatch',
  async (path, _device, agent) => {
    const html = renderToString(<App path={path} />);
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(agent);
    window.history.pushState({}, '', path);
    const root = document.createElement('div');
    root.innerHTML = html;
    document.body.append(root);

    const mismatches: unknown[] = [];
    await act(async () => {
      hydrateRoot(root, <App />, { onRecoverableError: (error) => mismatches.push(error) });
    });

    expect(mismatches).toEqual([]);
  },
);
