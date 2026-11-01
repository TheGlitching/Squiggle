/**
 * Once the Edge Add-ons address is known, Edge readers are sent there and labelled for it;
 * every other Chromium browser keeps the Chrome Web Store. (The empty case is in install.test.ts.)
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@squiggle/shared/src/stores', () => ({
  CHROME_STORE_URL: 'https://chrome.example/squiggle',
  FIREFOX_STORE_URL: 'https://firefox.example/squiggle',
  EDGE_STORE_URL: 'https://edge.example/squiggle',
}));

import { CHROME_URL, EDGE_URL, installLabelFor, installUrlFor } from '../src/install';

const BASE = 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36';

describe('Edge listing known', () => {
  it('sends Edge to its own store and the other Chromium browsers to Chrome', () => {
    expect(installUrlFor(`${BASE} Edg/126.0.0.0`)).toBe(EDGE_URL);
    expect(installUrlFor(BASE)).toBe(CHROME_URL);
    expect(installUrlFor(`${BASE} OPR/112.0.0.0`)).toBe(CHROME_URL);
  });

  it('labels the Edge button for Edge', () => {
    expect(installLabelFor(EDGE_URL, `${BASE} Edg/126.0.0.0`)).toBe('Ajouter à Edge');
  });
});
