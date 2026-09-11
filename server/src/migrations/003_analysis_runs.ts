/**
 * Migration 003 — analysis runs (Phase 2c).
 *
 * An analysis is driven by the extension across five HTTP calls (check,
 * audit, research, source-check, finalize), so the intermediate result has to
 * survive between them. It is held HERE, server-side, and never round-tripped
 * through the client: `finalize` writes into the shared report cache that
 * every other reader will be served from, so anything a client could edit on
 * the way would be an injection channel between readers. The run row is the
 * boundary that makes the cached report server-authored by construction.
 *
 * What the row holds is exactly what the remaining stages need: the audit's
 * own output (findings, marks, summary — quotes of at most 25 words), the
 * article's cited links, and the claims and source checks accumulated so far.
 * The article's text is NOT among them: it is used by the audit call and
 * dropped when that request ends, so no table in this database ever holds it.
 *
 * `finalized_at` is the idempotence key: the UPDATE that sets it is
 * conditional on it being NULL, so two concurrent finalize calls on the same
 * run cannot both write a report or both consume a credit.
 */

export const name = '003_analysis_runs';

export const sql = `
CREATE TABLE IF NOT EXISTS analysis_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  url_hash TEXT NOT NULL,
  state JSONB NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  finalized_at BIGINT
);

CREATE INDEX IF NOT EXISTS analysis_runs_user_idx ON analysis_runs (user_id, expires_at);
CREATE INDEX IF NOT EXISTS analysis_runs_expiry_idx ON analysis_runs (expires_at);
`;
