import { describe, expect, it } from 'vitest';

import { MIGRATIONS, migrate, type SqlQuery } from '../src/migrations';
import { sql as authSql } from '../src/migrations/001_auth';
import { sql as usageSql } from '../src/migrations/002_usage_reports';
import { sql as runsSql } from '../src/migrations/003_analysis_runs';
import { sql as billingSql } from '../src/migrations/004_billing';
import { sql as ledgerSql } from '../src/migrations/005_usage_log_no_article';
import { T0 } from './helpers';

/** A recording fake that answers the schema_migrations bookkeeping. */
class FakeSql implements SqlQuery {
  statements: string[] = [];
  private applied = new Set<string>();

  async query(text: string, params?: readonly unknown[]): Promise<Array<Record<string, unknown>>> {
    this.statements.push(text);
    if (text.startsWith('CREATE TABLE IF NOT EXISTS schema_migrations')) return [];
    if (text.startsWith('SELECT 1 AS x FROM schema_migrations WHERE name = $1')) {
      const name = params?.[0] as string;
      return this.applied.has(name) ? [{ x: 1 }] : [];
    }
    if (text.startsWith('INSERT INTO schema_migrations')) {
      this.applied.add(params?.[0] as string);
      return [];
    }
    return [];
  }
}

describe('migration runner', () => {
  it('applies every migration in order and records each', async () => {
    const q = new FakeSql();
    const applied = await migrate(q, MIGRATIONS, T0);
    // Derived from the list itself: adding a migration must not require
    // editing this test, only appending to `MIGRATIONS`.
    expect(applied).toEqual(MIGRATIONS.map((m) => m.name));

    // Every statement of every migration ran, in order, each exactly once.
    const statements = (sql: string) => sql.split(';').map((s) => s.trim()).filter((s) => s.length > 0);
    const expected = MIGRATIONS.flatMap((m) => statements(m.sql));
    const ddl = q.statements.filter(
      (s) =>
        !s.startsWith('CREATE TABLE IF NOT EXISTS schema_migrations') &&
        !s.startsWith('SELECT 1 AS x') &&
        !s.startsWith('INSERT INTO schema_migrations'),
    );
    expect(ddl).toEqual(expected);
  });

  it('is idempotent: a second run applies nothing', async () => {
    const q = new FakeSql();
    expect(await migrate(q, MIGRATIONS, T0)).toEqual(MIGRATIONS.map((m) => m.name));
    const before = q.statements.length;
    expect(await migrate(q, MIGRATIONS, T0 + 1000)).toEqual([]);
    // Only bookkeeping ran the second time: the idempotent table check plus
    // one applied-check per migration. No DDL was re-executed.
    expect(q.statements.slice(before)).toEqual([
      'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at BIGINT NOT NULL)',
      ...MIGRATIONS.map(() => 'SELECT 1 AS x FROM schema_migrations WHERE name = $1'),
    ]);
  });

  it('the auth schema defines every table the DB layer touches', () => {
    for (const table of [
      'users',
      'extension_keys',
      'tokens',
      'magic_links',
      'web_sessions',
      'nonces',
      'oauth_pending',
      'rate_limits',
    ]) {
      expect(authSql).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(`));
    }
    // Secrets are stored as hashes; timestamps are BIGINT epoch ms.
    expect(authSql).toContain('token_hash TEXT UNIQUE NOT NULL');
    expect(authSql).toContain('session_hash TEXT UNIQUE NOT NULL');
    expect(authSql).toContain('code_hash TEXT UNIQUE NOT NULL');
    expect(authSql).toContain('expires_at BIGINT NOT NULL');
  });

  it('the usage schema adds the quota, ledger and cache tables', () => {
    for (const table of ['usage_daily', 'usage_log', 'reports']) {
      expect(usageSql).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(`));
    }
    // The daily quota is keyed per (user, UTC day).
    expect(usageSql).toContain('PRIMARY KEY (user_id, day)');
    // The cache key is exactly (canonical URL, model, prompt version).
    expect(usageSql).toContain('UNIQUE (url_hash, model, prompt_version)');
    // The per-report size cap is enforced at the database level.
    expect(usageSql).toContain('CHECK (size_bytes >= 0 AND size_bytes <= 262144)');
    // The ledger's report reference outlives the report: no foreign key.
    expect(usageSql).not.toContain('REFERENCES reports');
    // Stripe identifiers are added to the existing table, not a new one.
    expect(usageSql).toContain('ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT');
    expect(usageSql).toContain('ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_sub_id TEXT');
  });

  it('the analysis-run schema keeps a run owned, expiring and finalizable once', () => {
    expect(runsSql).toMatch(/CREATE TABLE IF NOT EXISTS analysis_runs \(/);
    // A run belongs to an account and dies with it.
    expect(runsSql).toContain('REFERENCES users (id) ON DELETE CASCADE');
    // It expires, so an abandoned run leaves nothing behind.
    expect(runsSql).toContain('expires_at BIGINT NOT NULL');
    // Nullable: the conditional UPDATE on it is what makes finalize once-only.
    expect(runsSql).toContain('finalized_at BIGINT');
  });

  it('the billing schema deduplicates webhook deliveries on Stripe\'s own event id', () => {
    expect(billingSql).toMatch(/CREATE TABLE IF NOT EXISTS stripe_events \(/);
    // The primary key IS the deduplication: a redelivery collides here.
    expect(billingSql).toContain('id TEXT PRIMARY KEY');
    // Webhook routing looks an account up by its Stripe customer.
    expect(billingSql).toContain('users_stripe_customer_idx');
  });

  it('the ledger stops naming the article', () => {
    // Forward-only: 002 is amended, never edited.
    expect(ledgerSql).toContain('ALTER TABLE usage_log DROP COLUMN IF EXISTS report_id');
  });
});
