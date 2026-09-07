import { describe, expect, it } from 'vitest';

import { MIGRATIONS, migrate, type SqlQuery } from '../src/migrations';
import { sql as authSql, name as authName } from '../src/migrations/001_auth';
import { sql as usageSql, name as usageName } from '../src/migrations/002_usage_reports';
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
    expect(applied).toEqual([authName, usageName]);

    // Every statement of both migrations ran, in order, each exactly once.
    const statements = (sql: string) => sql.split(';').map((s) => s.trim()).filter((s) => s.length > 0);
    const expected = [...statements(authSql), ...statements(usageSql)];
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
    expect(await migrate(q, MIGRATIONS, T0)).toEqual([authName, usageName]);
    const before = q.statements.length;
    expect(await migrate(q, MIGRATIONS, T0 + 1000)).toEqual([]);
    // Only bookkeeping ran the second time: the idempotent table check plus
    // one applied-check per migration. No DDL was re-executed.
    expect(q.statements.slice(before)).toEqual([
      'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at BIGINT NOT NULL)',
      'SELECT 1 AS x FROM schema_migrations WHERE name = $1',
      'SELECT 1 AS x FROM schema_migrations WHERE name = $1',
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
});
