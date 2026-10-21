import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DAILY_CRON, runScheduled } from '../src/index';
import { RUN_TTL_MS } from '../src/analyze/stages';
import { DAY_MS, REPORT_MAX_COUNT, REPORT_TTL_MS, USAGE_LOG_RETENTION_MS } from '../src/usage/limits';
import { T0, makeTestEnv } from './helpers';

afterEach(() => vi.restoreAllMocks());

describe('scheduled retention sweeps', () => {
  it('hourly drops lapsed runs and ledger rows past 12 months; daily drops expired reports', async () => {
    const env = makeTestEnv();
    const { db } = env.services;
    const { clock } = env;
    const user = await db.createUser({ email: 'marie@example.com' }, T0);

    const run = (now: number) =>
      db.createAnalysisRun({ userId: user.id, urlHash: 'u', state: '{}', now, ttlMs: RUN_TTL_MS });
    const oldRun = await run(T0);
    const report = (id: number) =>
      db.createReport({
        urlHash: `url-${id}`,
        model: 'm',
        promptVersion: 'v1',
        report: '{}',
        sizeBytes: 2,
        now: T0,
        ttlMs: REPORT_TTL_MS,
      });
    await report(1);
    await db.recordAnalysis({ userId: user.id, now: T0 });

    // 1 hour on: the run lapsed, the report and the ledger row did not.
    clock.set(T0 + RUN_TTL_MS);
    const freshRun = await run(clock.now());
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runScheduled(env.services, '0 * * * *');
    expect(await db.getAnalysisRun(oldRun.id)).toBeNull();
    expect(await db.getAnalysisRun(freshRun.id)).not.toBeNull();
    expect(await db.countUsageLog(user.id)).toBe(1);

    // 12 months on: the ledger row goes. The report only goes on the daily sweep.
    clock.set(T0 + USAGE_LOG_RETENTION_MS);
    await runScheduled(env.services, '0 * * * *');
    expect(await db.countUsageLog(user.id)).toBe(0);
    expect(await db.findReport('url-1', 'm', 'v1')).not.toBeNull();
    await runScheduled(env.services, DAILY_CRON);
    expect(await db.findReport('url-1', 'm', 'v1')).toBeNull();

    // counts only: no free text in the line.
    const lines = log.mock.calls.map((c) => JSON.parse(c[0] as string));
    expect(lines.at(-1)).toMatchObject({ event: 'retention_purge', scope: 'reports', count: 1 });
  });

  it('daily keeps only REPORT_MAX_COUNT reports', async () => {
    const env = makeTestEnv();
    const { db } = env.services;
    for (let i = 0; i < REPORT_MAX_COUNT + 2; i++) {
      await db.createReport({
        urlHash: `url-${i}`,
        model: 'm',
        promptVersion: 'v1',
        report: '{}',
        sizeBytes: 2,
        now: T0 + i,
        ttlMs: REPORT_TTL_MS,
      });
    }
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await runScheduled(env.services, DAILY_CRON);
    expect(await db.findReport('url-0', 'm', 'v1')).toBeNull();
    expect(await db.findReport('url-1', 'm', 'v1')).toBeNull();
    expect(await db.findReport('url-2', 'm', 'v1')).not.toBeNull();
  });
});

describe('published retention table', () => {
  const privacy = readFileSync(new URL('../../PRIVACY.md', import.meta.url), 'utf8');
  const transparency = readFileSync(new URL('../../web/src/pages/Transparence.tsx', import.meta.url), 'utf8');

  it('matches the constants', () => {
    const rows = [
      `${REPORT_TTL_MS / DAY_MS} jours, ${REPORT_MAX_COUNT} rapports au plus`,
      `${RUN_TTL_MS / 3_600_000} heure`,
      '12 mois',
    ];
    for (const row of rows) {
      expect(privacy).toContain(row);
      expect(transparency).toContain(row);
    }
    expect(USAGE_LOG_RETENTION_MS).toBe(365 * DAY_MS);
  });
});
