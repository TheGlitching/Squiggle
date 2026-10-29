/**
 * Migration 016 - the analysis without an account, once per visitor.
 *
 * The site used to offer a visitor one analysis a day, counted in an
 * `anon:ip` rate window that closed at midnight UTC. It is now one in all:
 * the fingerprint of the visitor's address is kept, with the time of their
 * analysis, until `VISITOR_USE_RETENTION_MS` has passed since it. A table of
 * its own, because a rate window is aligned on its own length: a window of
 * that length would give a second analysis to whoever used theirs on its
 * last day. Today's windows are carried over, so the change opens no second
 * analysis to a visitor who already had theirs today.
 */
export const name = '016_visitor_uses';

export const sql = `
CREATE TABLE IF NOT EXISTS visitor_uses (
  ip_hash TEXT PRIMARY KEY,
  used_at BIGINT NOT NULL
);

INSERT INTO visitor_uses (ip_hash, used_at)
  SELECT key, MAX(window_start) FROM rate_limits WHERE scope = 'anon:ip' AND count > 0 GROUP BY key
  ON CONFLICT (ip_hash) DO NOTHING;
`;
