/**
 * The browser hydrates each page the build rendered (`src/main.tsx`), so the page's
 * first render in a browser must be the build's, on any device. A page that differs
 * would be thrown away and painted again once the app's script has run, which is the
 * slow first paint the build's prerendering exists to avoid.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { App, rendersReaderState } from '../src/App';
import { saveDraft } from '../src/paste';
import { phoneOs } from '../src/phone';
import { PUBLIC_PAGES } from '../src/seo';
import { installFetch, memoryStorage } from './helpers';

const DEVICES = {
  computer: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  'Android phone': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
  iPhone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
};

// The analysis page asks who is signed in: no one, here. It keeps no draft yet.
beforeEach(() => {
  installFetch(() => undefined);
  vi.stubGlobal('localStorage', memoryStorage());
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
  document.body.replaceChildren();
});

// A first visit: nothing kept in the browser, nothing in the address.
const hydrated = PUBLIC_PAGES.map((page) => page.path).filter((path) => !rendersReaderState(path));

async function hydrationMismatches(path: string, address: string, agent: string): Promise<unknown[]> {
  const html = renderToString(<App path={path} />);
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(agent);
  window.history.pushState({}, '', address);
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.append(root);

  const mismatches: unknown[] = [];
  await act(async () => {
    hydrateRoot(root, <App />, { onRecoverableError: (error) => mismatches.push(error) });
  });
  return mismatches;
}

it('hydrates the analysis page for a reader with nothing of their own', () => {
  // Painted again, its title is a new node, and the browser counts its paint as the page's largest one.
  expect(hydrated).toContain('/analyser');
});

it.each(Object.entries(DEVICES).flatMap(([device, agent]) => hydrated.map((path) => [path, device, agent] as const)))(
  '%s hydrates on a(n) %s without a mismatch',
  async (path, _device, agent) => {
    expect(await hydrationMismatches(path, path, agent)).toEqual([]);
  },
);

// A campaign link, or the click id a social network adds, is not the reader's state.
it.each(['/analyser?ref=clemi', '/analyser?fbclid=abc'])('%s hydrates without a mismatch', async (address) => {
  window.history.pushState({}, '', address);
  expect(rendersReaderState('/analyser')).toBe(false);
  expect(await hydrationMismatches('/analyser', address, DEVICES['Android phone'])).toEqual([]);
});

it.each([
  '/analyser?apres=essai',
  '/analyser?paiement=ok',
  '/analyser?captures=2',
  '/analyser?media=1',
  `/analyser?rapport=${'a'.repeat(64)}`,
  '/analyser#text=Un%20texte%20partag%C3%A9%20assez%20long%20pour%20%C3%AAtre%20lu%20comme%20un%20article.',
  '/analyser#url=https%3A%2F%2Fexample.org%2Farticle',
])('%s is rendered as the reader’s own', (address) => {
  window.history.pushState({}, '', address);
  expect(rendersReaderState('/analyser')).toBe(true);
});

it('renders the analysis page as the reader’s own when a draft is kept', () => {
  window.history.pushState({}, '', '/analyser');
  saveDraft({ title: '', source: '', text: 'Le brouillon du lecteur.' });
  expect(rendersReaderState('/analyser')).toBe(true);
});

// A page that shows only the reader's device's guide (/favori) shows it from the first
// paint, by the device `index.html` names before the app runs: the app's own rule.
it.each([
  ...Object.values(DEVICES).map((agent) => [agent, 0] as const),
  ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15', 5] as const,
  ['Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0', 0] as const,
])('index.html names the device of %s as the app does', (userAgent, maxTouchPoints) => {
  const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]).find((code) => code.includes('dataset.device'));
  const root = { dataset: {} as Record<string, string> };
  new Function('navigator', 'document', script ?? '')({ userAgent, maxTouchPoints }, { documentElement: root });
  expect(root.dataset.device).toBe(phoneOs(userAgent, maxTouchPoints) ?? 'ordinateur');
});
