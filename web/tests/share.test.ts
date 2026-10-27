// @vitest-environment node
/**
 * The share images the build writes (`src/share.tsx`): the size every preview
 * expects, and small enough that no network gives up on fetching one.
 */
import { describe, expect, it } from 'vitest';

import { PUBLIC_PAGES } from '../src/seo';
import { SHARE_HEIGHT, SHARE_WIDTH, shareImage } from '../src/share';

describe('share images', () => {
  it.each(['/enseignants', '/glossaire/correlation-causalite'])('draws %s as a 1200 x 630 PNG under 300 KB', async (path) => {
    const png = await shareImage(PUBLIC_PAGES.find((page) => page.path === path)!);
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([SHARE_WIDTH, SHARE_HEIGHT]);
    expect(png.length).toBeLessThan(300_000);
  });
});
