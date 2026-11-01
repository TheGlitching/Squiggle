/** A reported finding is counted under names the server accepts, and only those. */
import { describe, expect, it } from 'vitest';

import { FindingCategorySchema, SourceNatureSchema } from '../src/engine/types';
import { FLAG_REASONS, flagCounters, isAudienceMetricName, sourceFlagCounter } from '../src/hosted/audience';

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

describe('sourceFlagCounter', () => {
  it('names a distinct counter on the closed list for every nature', () => {
    const names = SourceNatureSchema.options.map(sourceFlagCounter);
    for (const name of names) expect(isAudienceMetricName(name)).toBe(true);
    expect(new Set(names).size).toBe(SourceNatureSchema.options.length);
  });
});
