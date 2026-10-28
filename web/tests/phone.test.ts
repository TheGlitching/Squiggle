/** Which link opens an article in the phone's browser rather than in the publisher's app. */
import { describe, expect, it } from 'vitest';

import { browserLink, phoneOs } from '../src/phone';

const ARTICLE = 'https://www.lefigaro.fr/politique/budget-20261028';

describe('browserLink', () => {
  it('names Safari from iOS 17, and leaves an older iPhone the plain link', () => {
    const ios = (version: string) => `Mozilla/5.0 (iPhone; CPU iPhone OS ${version} like Mac OS X) AppleWebKit/605.1.15`;
    expect(browserLink(ARTICLE, 'ios', ios('17_0'))).toBe(`x-safari-${ARTICLE}`);
    expect(browserLink(ARTICLE, 'ios', ios('16_7'))).toBe(ARTICLE);
    // An iPad's Safari reports a Mac, and its release only as Safari's version.
    const ipad = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
    expect(phoneOs(ipad, 5)).toBe('ios');
    expect(phoneOs(ipad, 0)).toBeNull();
    expect(browserLink(ARTICLE, 'ios', ipad)).toBe(`x-safari-${ARTICLE}`);
  });

  it('is the address itself on a computer', () => {
    expect(browserLink(ARTICLE, null, '')).toBe(ARTICLE);
  });
});
