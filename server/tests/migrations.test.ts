import { describe, expect, it } from 'vitest';

import { MIGRATIONS, migrate, type SqlQuery } from '../src/migrations';
import { sql as authSql, name as authName } from '../src/migrations/001_auth';
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
  it('applies the auth schema in order and records it', async () => {
    const q = new FakeSql();
    const applied = await migrate(q, MIGRATIONS, T0);
    expect(applied).toEqual([authName]);

    // Every statement of 001_auth ran, in order, each exactly once.
    const expected = authSql.split(';').map((s) => s.trim()).filter((s) => s.length > 0);
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
    expect(await migrate(q, MIGRATIONS, T0)).toEqual([authName]);
    const before = q.statements.length;
    expect(await migrate(q, MIGRATIONS, T0 + 1000)).toEqual([]);
    // Only bookkeeping ran the second time: the idempotent table check plus
    // the applied-check. None of the 001_auth DDL was re-executed.
    expect(q.statements.slice(before)).toEqual([
      'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at BIGINT NOT NULL)',
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
});
