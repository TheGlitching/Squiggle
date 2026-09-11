/**
 * Forward-only migration runner.
 *
 * A migration is a named batch of SQL statements, recorded in
 * `schema_migrations` once applied, so `migrate()` is idempotent: it is safe
 * to run it on every deployment and it only ever moves forward. Statements
 * are executed one at a time (the Neon HTTP driver speaks the extended query
 * protocol, which takes a single statement per round-trip).
 *
 * The runner depends on a minimal `SqlQuery` interface — the `NeonQueryFunction`
 * returned by `neon()` satisfies it, and the tests satisfy it with a
 * recording fake, so the runner itself is testable without a database.
 */
import { name as authName, sql as authSql } from './001_auth';
import { name as usageName, sql as usageSql } from './002_usage_reports';
import { name as runsName, sql as runsSql } from './003_analysis_runs';
import { name as billingName, sql as billingSql } from './004_billing';
import { name as ledgerName, sql as ledgerSql } from './005_usage_log_no_article';

export interface Migration {
  name: string;
  sql: string;
}

export interface SqlQuery {
  query(sqlText: string, params?: readonly unknown[]): Promise<Array<Record<string, unknown>>>;
}

/** Every migration, in order. Append new ones here; never edit an applied one. */
export const MIGRATIONS: readonly Migration[] = [
  { name: authName, sql: authSql },
  { name: usageName, sql: usageSql },
  { name: runsName, sql: runsSql },
  { name: billingName, sql: billingSql },
  { name: ledgerName, sql: ledgerSql },
];

function splitStatements(sql: string): string[] {
  return sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Apply every migration that has not been recorded yet.
 * @returns the names of the migrations applied by this call (empty if up to date).
 */
export async function migrate(
  q: SqlQuery,
  migrations: readonly Migration[] = MIGRATIONS,
  now: number = Date.now(),
): Promise<string[]> {
  await q.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at BIGINT NOT NULL)',
  );
  const applied: string[] = [];
  for (const migration of migrations) {
    const done = await q.query('SELECT 1 AS x FROM schema_migrations WHERE name = $1', [migration.name]);
    if (done.length > 0) continue;
    for (const statement of splitStatements(migration.sql)) {
      await q.query(statement);
    }
    await q.query('INSERT INTO schema_migrations (name, applied_at) VALUES ($1, $2)', [migration.name, now]);
    applied.push(migration.name);
  }
  return applied;
}
