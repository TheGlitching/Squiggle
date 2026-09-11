import { describe, expect, it } from 'vitest';

import { MemoryDb } from '../src/db/memory';
import { DAY_MS, REPORT_MAX_BYTES, REPORT_TTL_MS, USAGE_LOG_RETENTION_MS, utcDayOf } from '../src/usage/limits';
import { T0 } from './helpers';

const DAY = DAY_MS;

function makeReport(db: MemoryDb, id: number, now: number = T0, ttlMs: number = REPORT_TTL_MS) {
  return db.createReport({
    urlHash: `url-${id}`,
    model: 'gemini-3.5-flash',
    promptVersion: 'v1',
    report: JSON.stringify({ id, title: `report ${id}` }),
    sizeBytes: 2048,
    now,
    ttlMs,
  });
}

describe('utcDayOf', () => {
  it('maps any instant to its UTC midnight', () => {
    const midnight = Math.ceil(T0 / DAY) * DAY; // 2023-11-15 00:00 UTC
    expect(utcDayOf(T0)).toBe(midnight - DAY);
    expect(utcDayOf(midnight - 1)).toBe(midnight - DAY);
    expect(utcDayOf(midnight)).toBe(midnight);
  });
});

describe('usage: ledger + daily counter', () => {
  it('bumps the daily counter and keeps a ledger row per analysis', async () => {
    const db = new MemoryDb();
    const user = await db.createUser({ email: 'marie@example.com', emailVerified: true }, T0);

    // T0 is 22:13 UTC, so "+30 min" stays on the same UTC day; "+1s after
    // midnight" starts the next one.
    const day = utcDayOf(T0);
    await db.recordAnalysis({ userId: user.id, now: T0 });
    await db.recordAnalysis({ userId: user.id, now: T0 + 30 * 60 * 1000 });
    await db.recordAnalysis({ userId: user.id, now: day + DAY + 1000 });

    expect(await db.getDailyUsage(user.id, day)).toBe(2);
    expect(await db.getDailyUsage(user.id, day + DAY)).toBe(1);
    expect(await db.getDailyUsage(user.id, day + 2 * DAY)).toBe(0);
    expect(await db.sumUsage(user.id)).toBe(3);

    // A different user's activity does not leak in.
    const other = await db.createUser({ email: 'jean@example.com' }, T0);
    await db.recordAnalysis({ userId: other.id, now: T0 });
    expect(await db.sumUsage(user.id)).toBe(3);
    expect(await db.sumUsage(other.id)).toBe(1);
  });
});

describe('the shared report cache', () => {
  it('serves a hit only for the exact (url, model, prompt version) key', async () => {
    const db = new MemoryDb();
    expect(await db.findReport('url-1', 'gemini-3.5-flash', 'v1')).toBeNull();

    const created = await makeReport(db, 1);
    expect(created.expiresAt).toBe(T0 + REPORT_TTL_MS);

    const hit = await db.findReport('url-1', 'gemini-3.5-flash', 'v1');
    expect(hit).not.toBeNull();
    expect(hit!.report).toBe(created.report);
    expect(hit!.id).toBe(created.id);

    // A prompt-version bump is a cache miss by design (invalidation rule).
    expect(await db.findReport('url-1', 'gemini-3.5-flash', 'v2')).toBeNull();
    expect(await db.findReport('url-2', 'gemini-3.5-flash', 'v1')).toBeNull();
  });

  it('rejects oversized payloads and duplicate cache keys', async () => {
    const db = new MemoryDb();
    await makeReport(db, 1);

    await expect(
      db.createReport({
        urlHash: 'url-big',
        model: 'gemini-3.5-flash',
        promptVersion: 'v1',
        report: 'x'.repeat(REPORT_MAX_BYTES + 1),
        sizeBytes: REPORT_MAX_BYTES + 1,
        now: T0,
        ttlMs: REPORT_TTL_MS,
      }),
    ).rejects.toThrow(/size cap/);

    await expect(makeReport(db, 1, T0 + 1000)).rejects.toThrow(/already cached/);
    // The original report is untouched by the rejected insert.
    expect((await db.findReport('url-1', 'gemini-3.5-flash', 'v1'))!.createdAt).toBe(T0);
  });
});

describe('cache purge (TTL + size cap)', () => {
  it('removes expired reports first, keeping fresh ones', async () => {
    const db = new MemoryDb();
    await makeReport(db, 1, T0, 1000); // short-lived, already past its TTL
    await makeReport(db, 2, T0, REPORT_TTL_MS); // fresh

    const result = await db.purgeReports(T0 + 2000, 500);
    expect(result).toEqual({ expired: 1, overCap: 0 });
    expect(await db.findReport('url-1', 'gemini-3.5-flash', 'v1')).toBeNull();
    expect(await db.findReport('url-2', 'gemini-3.5-flash', 'v1')).not.toBeNull();
  });

  it('evicts the oldest reports only until the cache is back under the cap', async () => {
    const db = new MemoryDb();
    for (let i = 1; i <= 5; i += 1) await makeReport(db, i, T0 + i); // all fresh

    const result = await db.purgeReports(T0 + 100, 3);
    expect(result).toEqual({ expired: 0, overCap: 2 });

    // The two oldest (t = T0+1, T0+2) are gone; the three newest remain.
    expect(await db.findReport('url-1', 'gemini-3.5-flash', 'v1')).toBeNull();
    expect(await db.findReport('url-2', 'gemini-3.5-flash', 'v1')).toBeNull();
    for (const i of [3, 4, 5]) {
      expect(await db.findReport(`url-${i}`, 'gemini-3.5-flash', 'v1')).not.toBeNull();
    }
  });

  it('is a no-op when the cache is within its limits', async () => {
    const db = new MemoryDb();
    await makeReport(db, 1);
    expect(await db.purgeReports(T0, 500)).toEqual({ expired: 0, overCap: 0 });
    expect(await db.findReport('url-1', 'gemini-3.5-flash', 'v1')).not.toBeNull();
  });

  it('applies the TTL and the cap in one pass', async () => {
    const db = new MemoryDb();
    await makeReport(db, 1, T0, 1000); // expired
    await makeReport(db, 2, T0 + 1); // fresh, oldest
    await makeReport(db, 3, T0 + 2); // fresh
    await makeReport(db, 4, T0 + 3); // fresh

    const result = await db.purgeReports(T0 + 2000, 2);
    expect(result).toEqual({ expired: 1, overCap: 1 }); // expired first, then oldest
    expect(await db.findReport('url-1', 'gemini-3.5-flash', 'v1')).toBeNull();
    expect(await db.findReport('url-2', 'gemini-3.5-flash', 'v1')).toBeNull();
    expect(await db.findReport('url-3', 'gemini-3.5-flash', 'v1')).not.toBeNull();
    expect(await db.findReport('url-4', 'gemini-3.5-flash', 'v1')).not.toBeNull();
  });
});

describe('purgeExpired (retention sweep)', () => {
  it('drops lapsed auth rows but keeps valid ones', async () => {
    const db = new MemoryDb();
    const user = await db.createUser({ email: 'marie@example.com' }, T0);

    // Expired and fresh variants of every short-lived row type.
    await db.addNonce({ keyId: 'k', nonce: 'n-old', now: T0, ttlMs: 1000 });
    await db.addNonce({ keyId: 'k', nonce: 'n-new', now: T0 + 1000, ttlMs: REPORT_TTL_MS });
    const sOld = await db.createSession({ userId: user.id, sessionHash: 's-old', now: T0, ttlMs: 1000 });
    const sNew = await db.createSession({ userId: user.id, sessionHash: 's-new', now: T0 + 1000, ttlMs: REPORT_TTL_MS });
    await db.createMagicLink({ email: 'a@b.c', codeHash: 'c-old', ip: null, now: T0, ttlMs: 1000 });
    await db.createMagicLink({ email: 'a@b.c', codeHash: 'c-new', ip: null, now: T0 + 1000, ttlMs: REPORT_TTL_MS });
    await db.createOAuthPending({
      state: 'st-old',
      codeVerifier: 'v',
      nonce: 'n',
      redirectUri: 'https://squiggle.fr/auth/google/callback',
      now: T0,
      ttlMs: 1000,
    });
    await db.createOAuthPending({
      state: 'st-new',
      codeVerifier: 'v',
      nonce: 'n',
      redirectUri: 'https://squiggle.fr/auth/google/callback',
      now: T0 + 1000,
      ttlMs: REPORT_TTL_MS,
    });

    await db.purgeExpired(T0 + 2000, USAGE_LOG_RETENTION_MS);

    expect(await db.findSessionByHash(sOld.sessionHash)).toBeNull();
    expect(await db.findSessionByHash(sNew.sessionHash)).not.toBeNull();
    expect(await db.findMagicLinkByCodeHash('c-old')).toBeNull();
    expect(await db.findMagicLinkByCodeHash('c-new')).not.toBeNull();
    expect(await db.findOAuthPending('st-old')).toBeNull();
    expect(await db.findOAuthPending('st-new')).not.toBeNull();
    expect(await db.addNonce({ keyId: 'k', nonce: 'n-old', now: T0 + 2000, ttlMs: 1000 })).toBe(true); // gone
    expect(await db.addNonce({ keyId: 'k', nonce: 'n-new', now: T0 + 2000, ttlMs: 1000 })).toBe(false); // kept
  });

  it('keeps ledger rows for 12 months, then drops them', async () => {
    const db = new MemoryDb();
    const user = await db.createUser({ email: 'marie@example.com' }, T0);

    const old = await db.recordAnalysis({ userId: user.id, now: T0 });
    const recent = await db.recordAnalysis({ userId: user.id, now: T0 + 1000 });

    // Both ledger rows survive a sweep well inside the retention window.
    await db.purgeExpired(T0 + 30 * DAY, USAGE_LOG_RETENTION_MS);
    expect(await db.countUsageLog(user.id)).toBe(2);

    // Past the retention window: the cutoff lands between the two rows
    // (cutoff = now − retention = T0 + 500 ms), so the old row (T0) is
    // dropped and the recent one (T0 + 1 s) is kept.
    await db.purgeExpired(T0 + USAGE_LOG_RETENTION_MS + 500, USAGE_LOG_RETENTION_MS);
    expect(await db.countUsageLog(user.id)).toBe(1);

    // The daily counter is intentionally not pruned by retention: quota
    // accounting only ever reads recent days, and it is per-day by nature.
    expect(await db.sumUsage(user.id)).toBe(2);
    expect(old.createdAt).toBeLessThan(recent.createdAt);
  });
});

describe('report size cap constant', () => {
  it('matches the CHECK constraint in migration 002', async () => {
    const { sql } = await import('../src/migrations/002_usage_reports');
    expect(sql).toContain(`size_bytes <= ${REPORT_MAX_BYTES}`);
  });
});
