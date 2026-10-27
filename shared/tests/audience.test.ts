/** A reported finding is counted under names the server accepts, and only those. */
import { describe, expect, it } from 'vitest';

import { FindingCategorySchema } from '../src/engine/types';
import { FLAG_REASONS, flagCounters, isAudienceMetricName } from '../src/hosted/audience';

describe('flagCounters', () => {
  it('names a counter on the closed list for every category and every reason', () => {
    const names = new Set<string>();
    for (const category of FindingCategorySchema.options) {
      for (const { id } of FLAG_REASONS) {
        const pair = flagCounters(category, id);
        for (const name of pair) expect(isAudienceMetricName(name)).toBe(true);
        pair.forEach((name) => names.add(name));
      }
    }
    expect(names.size).toBe(FindingCategorySchema.options.length + FLAG_REASONS.length);
  });
});
