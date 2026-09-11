/**
 * Migration 004 — billing (Phase 2d).
 *
 * The Stripe identifiers already live on `users` (added in 002). What this
 * adds is the one table billing genuinely needs beyond them: a record of the
 * webhook events already processed.
 *
 * Stripe retries a webhook until it gets a 2xx, and it does not promise to
 * deliver each event exactly once. Without this table a retried
 * `checkout.session.completed` would re-activate a cancelled plan and a
 * retried `invoice.payment_failed` would re-suspend a recovered one, both
 * silently. The primary key on Stripe's own event id makes the insert itself
 * the deduplication: a second delivery collides and is answered 200 without
 * being applied.
 */

export const name = '004_billing';

export const sql = `
CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  received_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS stripe_events_received_idx ON stripe_events (received_at);

CREATE INDEX IF NOT EXISTS users_stripe_customer_idx ON users (stripe_customer_id);
`;
