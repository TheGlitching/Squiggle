/**
 * Migration 010 - launch metrics.
 *
 * Most launch metrics are answered by rows the server already keeps (accounts,
 * the daily usage counter, the Stripe event ledger). Two are not: how often the
 * shared cache answered, and how often a model stage failed. Both only ever
 * reached the logs, which the admin endpoint cannot query.
 *
 * `metric_counters` is the smallest thing that answers them: one row per UTC
 * day and per fixed event name, holding a number. There is no user, no article
 * and no free-text column, so the table cannot become a browsing history by
 * accident. The names are the closed set in `MetricName`.
 */

export const name = '010_metric_counters';

export const sql = `
CREATE TABLE IF NOT EXISTS metric_counters (
  day BIGINT NOT NULL,
  name TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, name)
);
`;
