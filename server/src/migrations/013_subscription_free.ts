/**
 * Migration 013 - free subscriptions.
 *
 * A 100 % promotion code completes a checkout with nothing to pay, and until
 * now that account counted as a paying subscriber in the metrics. The webhook
 * records here whether the last checkout or invoice of the subscription came to
 * zero, so the metrics can tell paid from free. It never decides a plan.
 * Existing rows start as paid: nothing before this migration was recorded.
 */
export const name = '013_subscription_free';

export const sql = `
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_free BOOLEAN NOT NULL DEFAULT false;
`;
