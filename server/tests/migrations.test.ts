import { describe, expect, it } from 'vitest';

import { MIGRATIONS, migrate, type SqlQuery } from '../src/migrations';
import { sql as authSql } from '../src/migrations/001_auth';
import { sql as usageSql } from '../src/migrations/002_usage_reports';
import { sql as runsSql } from '../src/migrations/003_analysis_runs';
import { sql as billingSql } from '../src/migrations/004_billing';
import { sql as ledgerSql } from '../src/migrations/005_usage_log_no_article';
import { sql as textHashSql } from '../src/migrations/007_reports_text_hash';
import { sql as changeSql } from '../src/migrations/009_email_change';
import { sql as metricsSql } from '../src/migrations/010_metric_counters';
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

  it('the report cache is keyed on the article text as well as its address', () => {
    // The old key let a text invented for a real address be served to everyone.
    expect(usageSql).toContain('UNIQUE (url_hash, model, prompt_version)');
    expect(textHashSql).toContain('DROP CONSTRAINT IF EXISTS reports_url_hash_model_prompt_version_key');
    expect(textHashSql).toContain('UNIQUE (url_hash, text_hash, model, prompt_version)');
    // Reports filed under the old key cannot prove which text they came from.
    expect(textHashSql.indexOf('DELETE FROM reports')).toBeLessThan(textHashSql.indexOf('ADD COLUMN'));
    expect(textHashSql).toContain('text_hash TEXT NOT NULL');
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

  it('everything that names an account goes when the account does', () => {
    // `Db.deleteUser` removes the user row and relies on the schema for every
    // table that points at it. A new table with a `user_id` that forgot the
    // cascade would survive an erasure, so the schema is checked, not trusted.
    const all = MIGRATIONS.map((m) => m.sql).join('\n');
    const references = all.match(/REFERENCES users \(id\)[^,\n]*/g) ?? [];
    expect(references.length).toBeGreaterThanOrEqual(7);
    for (const ref of references) expect(ref).toContain('ON DELETE CASCADE');

    // Every column called user_id (or change_user_id) is such a reference.
    const userColumns = all.match(/(?:^\s*|ADD COLUMN IF NOT EXISTS )(?:change_)?user_id TEXT[^\n]*/gm) ?? [];
    expect(userColumns.length).toBe(references.length);
    for (const column of userColumns) expect(column).toContain('REFERENCES users (id) ON DELETE CASCADE');
  });

  it('an email-change code is tied to its account and dies with it', () => {
    expect(changeSql).toContain('ALTER TABLE magic_links ADD COLUMN IF NOT EXISTS change_user_id TEXT');
    expect(changeSql).toContain('REFERENCES users (id) ON DELETE CASCADE');
  });

  it('the metric counters carry a day, a fixed name and a number, and nothing else', () => {
    // No user and no article column: the table cannot become a browsing history.
    expect(metricsSql).toContain('CREATE TABLE IF NOT EXISTS metric_counters');
    expect(metricsSql).not.toMatch(/user_id|url|email|article/i);
  });
});
