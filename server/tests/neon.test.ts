/**
 * The Neon row mapping, against a stubbed driver: no network, only the shapes
 * Postgres answers with.
 */
import { describe, expect, it, vi } from 'vitest';

// A query ending in `GROUP BY` with nothing to group answers no row at all;
// any other aggregate answers one row, its BIGINTs as strings.
vi.mock('@neondatabase/serverless', () => ({
  neon: () => (strings: TemplateStringsArray) =>
    Promise.resolve(/GROUP BY \w+\s*$/.test(strings.join('?')) ? [] : [new Proxy({}, { get: () => '2' })]),
}));

const { NeonDb } = await import('../src/db/neon');
const { METRIC_NAMES } = await import('../src/db/types');

describe('NeonDb.collectMetrics', () => {
  it('counts an event or counter with no row yet as 0, never leaves it out', async () => {
    const raw = await new NeonDb('postgres://stub').collectMetrics({ now: 10 * 7 * 86_400_000, weeks: 4, trialAnalyses: 3 });
    expect(raw.subscriptionsStarted).toBe(0);
    expect(raw.subscriptionsCancelled).toBe(0);
    expect(raw.counters).toEqual(Object.fromEntries(METRIC_NAMES.map((name) => [name, 0])));
    expect(raw.accountsPerWeek).toEqual([0, 0, 0, 0]);
    expect(raw.accountsTotal).toBe(2);
  });
});
