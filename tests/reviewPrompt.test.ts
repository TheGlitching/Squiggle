/**
 * The store review request: asked once, from the second finished analysis on,
 * and never again whatever the reader did with it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { claimReviewPrompt, recordFinalizedAnalysis, reviewStore } from '../src/review/reviewPrompt';

beforeEach(() => {
  const map = new Map<string, unknown>();
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (key: string) => (map.has(key) ? { [key]: map.get(key) } : {}),
        set: async (items: Record<string, unknown>) => {
          for (const [k, v] of Object.entries(items)) map.set(k, v);
        },
      },
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('review prompt', () => {
  it('is asked on the second finished analysis, then never again', async () => {
    expect(await claimReviewPrompt()).toBe(false);
    await recordFinalizedAnalysis();
    expect(await claimReviewPrompt()).toBe(false);
    await recordFinalizedAnalysis();
    expect(await claimReviewPrompt()).toBe(true);
    await recordFinalizedAnalysis();
    expect(await claimReviewPrompt()).toBe(false);
  });

  it('is never asked outside an extension', async () => {
    vi.stubGlobal('chrome', undefined);
    await recordFinalizedAnalysis();
    await recordFinalizedAnalysis();
    expect(await claimReviewPrompt()).toBe(false);
  });

  it('leads to the store of the build', () => {
    expect(reviewStore('chrome').url).toMatch(/^https:\/\/chromewebstore\.google\.com\/detail\/.+\/reviews$/);
    expect(reviewStore('firefox').url).toMatch(/^https:\/\/addons\.mozilla\.org\//);
  });
});
