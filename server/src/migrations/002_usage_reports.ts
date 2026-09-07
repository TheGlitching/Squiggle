/**
 * Migration 002 — usage and the shared report cache (Phase 2b).
 *
 * Design notes:
 *  - `users` gains its Stripe identifiers here, in a separate ALTER, so the
 *    auth schema of 001 is never rewritten (forward-only).
 *  - `usage_daily` is the quota table: one row per (user, UTC day).
 *  - `usage_log` is the ledger: who ran which report and when. It never
 *    stores content, and `report_id` is deliberately NOT a foreign key —
 *    reports are purged after 30 days while ledger rows are kept for
 *    12 months, so the reference outlives its target by design.
 *  - `reports` is the shared cache: unique on (url_hash, model,
 *    prompt_version), the exact invalidation rule of the product spec.
 *    A report is only its sanitized JSON (quotes ≤ 25 words, synthesis,
 *    notes) — raw article text never lands in this table — and the
 *    CHECK enforces the per-report size cap at the database level.
 */

export const name = '002_usage_reports';

export const sql = `
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_sub_id TEXT;

CREATE TABLE IF NOT EXISTS usage_daily (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  day BIGINT NOT NULL,
  analyses INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE IF NOT EXISTS usage_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  report_id TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS usage_log_user_idx ON usage_log (user_id, created_at);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  url_hash TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  report JSONB NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0 AND size_bytes <= 262144),
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  UNIQUE (url_hash, model, prompt_version)
);

CREATE INDEX IF NOT EXISTS reports_expiry_idx ON reports (expires_at);
`;
