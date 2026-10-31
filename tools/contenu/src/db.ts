/**
 * The routine's private memory, a SQLite file on the VPS: the figures of every
 * week, the journal of every post it proposed, the strategy note's versions,
 * the lessons, the comments and the reply drafts. None of it goes in the
 * repository or in a pull request: search queries and audience figures are
 * business data.
 *
 * A dry run (`--a-blanc`) works on its own file, so rehearsing the routine
 * never leaves a post in the journal that Postiz does not have.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY, kind TEXT NOT NULL, started TEXT NOT NULL, finished TEXT,
  ok INTEGER, steps TEXT NOT NULL DEFAULT '[]', cost_usd REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY, run_id INTEGER, source TEXT NOT NULL, week TEXT NOT NULL,
  collected_at TEXT NOT NULL, status TEXT NOT NULL, payload TEXT
);
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY, week TEXT NOT NULL, network TEXT NOT NULL, slot_at TEXT NOT NULL,
  pillar TEXT NOT NULL, angle TEXT NOT NULL, source_id TEXT NOT NULL, text TEXT NOT NULL,
  image_url TEXT, alt TEXT, status TEXT NOT NULL, reason TEXT,
  postiz_id TEXT, created_at TEXT NOT NULL, checked_at TEXT
);
CREATE TABLE IF NOT EXISTS media (url TEXT PRIMARY KEY, postiz_id TEXT NOT NULL, postiz_path TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS strategy (
  id INTEGER PRIMARY KEY, week TEXT NOT NULL, created_at TEXT NOT NULL,
  note TEXT NOT NULL, valid INTEGER NOT NULL, problem TEXT
);
CREATE TABLE IF NOT EXISTS tests (
  id INTEGER PRIMARY KEY, network TEXT NOT NULL, kind TEXT NOT NULL, value TEXT NOT NULL,
  hypothesis TEXT NOT NULL, start TEXT NOT NULL, end TEXT NOT NULL,
  status TEXT NOT NULL, verdict TEXT
);
CREATE TABLE IF NOT EXISTS deep (
  id INTEGER PRIMARY KEY, kind TEXT NOT NULL, slug TEXT NOT NULL, rule TEXT NOT NULL,
  reason TEXT NOT NULL, status TEXT NOT NULL, branch TEXT, pr_number INTEGER, pr_url TEXT,
  files TEXT NOT NULL, marker TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS waitlist (
  id INTEGER PRIMARY KEY, subject TEXT NOT NULL UNIQUE, reason TEXT NOT NULL,
  origin TEXT NOT NULL, created_at TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY, network TEXT NOT NULL, post_ref TEXT NOT NULL, author TEXT NOT NULL,
  text TEXT NOT NULL, created_at TEXT NOT NULL, category TEXT, draft TEXT,
  draft_status TEXT, actual_reply TEXT, seen_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY, created_at TEXT NOT NULL, origin TEXT NOT NULL, kind TEXT NOT NULL,
  text TEXT NOT NULL, status TEXT NOT NULL, evidence TEXT
);
CREATE TABLE IF NOT EXISTS owner_mail (
  key TEXT PRIMARY KEY, received_at TEXT NOT NULL, text TEXT NOT NULL,
  category TEXT, outcome TEXT, handled_at TEXT, reported INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS directives (
  id INTEGER PRIMARY KEY, created_at TEXT NOT NULL, kind TEXT NOT NULL, value TEXT NOT NULL,
  until TEXT NOT NULL, origin TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS alerts (key TEXT PRIMARY KEY, sent_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS spend (id INTEGER PRIMARY KEY, at TEXT NOT NULL, service TEXT NOT NULL, usd REAL NOT NULL, run_id INTEGER);
CREATE TABLE IF NOT EXISTS calls (id INTEGER PRIMARY KEY, at TEXT NOT NULL, service TEXT NOT NULL, kind TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

export class Db {
  readonly sql: DatabaseSync;

  constructor(file: string) {
    this.sql = new DatabaseSync(file);
    this.sql.exec('PRAGMA journal_mode = WAL;');
    this.sql.exec(SCHEMA);
  }

  static open(dataDir: string, dry: boolean): Db {
    mkdirSync(dataDir, { recursive: true });
    return new Db(join(dataDir, dry ? 'contenu-a-blanc.sqlite' : 'contenu.sqlite'));
  }

  static memory(): Db {
    return new Db(':memory:');
  }

  all<T>(query: string, ...params: SQLInputValue[]): T[] {
    return this.sql.prepare(query).all(...params) as T[];
  }

  get<T>(query: string, ...params: SQLInputValue[]): T | undefined {
    return this.sql.prepare(query).get(...params) as T | undefined;
  }

  run(query: string, ...params: SQLInputValue[]): number {
    return Number(this.sql.prepare(query).run(...params).lastInsertRowid);
  }

  getKv<T>(key: string): T | undefined {
    const row = this.get<{ value: string }>('SELECT value FROM kv WHERE key = ?', key);
    return row ? (JSON.parse(row.value) as T) : undefined;
  }

  setKv(key: string, value: unknown): void {
    this.run('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value));
  }
}
