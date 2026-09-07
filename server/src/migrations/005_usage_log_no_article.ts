/**
 * Migration 005 — the usage ledger stops referencing the article.
 *
 * `usage_log` was designed in 002 with a `report_id`, and the first caller
 * (the finalize stage) filled it with the article's URL hash. Put together
 * with the 12-month retention that made the table a browsing history: for a
 * year, which articles each account had analysed.
 *
 * Nothing needs it. The ledger exists to answer "how many analyses has this
 * account run, and when" — for the quota and as billing evidence — and both
 * questions are answered by the row's existence and its timestamp. The
 * reference was a liability with no reader.
 *
 * Dropped rather than left unused, because a nullable column nobody fills is
 * an invitation to fill it. Forward-only, as every migration here: 002 is not
 * edited, it is amended.
 */

export const name = '005_usage_log_no_article';

export const sql = `
ALTER TABLE usage_log DROP COLUMN IF EXISTS report_id;
`;
