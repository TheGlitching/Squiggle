/**
 * The install CTA routes by browser from two named store constants. A wrong
 * route sends the reader to the store they cannot use, and the fallback has to
 * hold when neither store applies.
 */
import { describe, expect, it } from 'vitest';

import { CHROME_URL, FIREFOX_URL, installUrlFor } from '../src/install';

describe('installUrlFor', () => {
  it('sends Firefox to AMO', () => {
    expect(installUrlFor('Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0')).toBe(
      FIREFOX_URL,
    );
  });

  it('sends every Chromium browser to the Chrome Web Store', () => {
    for (const ua of [
      'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
      'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36 OPR/112.0.0.0',
      'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36 Brave/126',
    ]) {
      expect(installUrlFor(ua)).toBe(CHROME_URL);
    }
  });

  it('returns null for a browser with no store', () => {
    expect(installUrlFor('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15')).toBeNull();
  });
});
