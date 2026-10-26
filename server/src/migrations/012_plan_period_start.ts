/**
 * Migration 012 - the start of the paid period.
 *
 * A subscription's allowance is counted over its Stripe billing period (see
 * `billing/quota.ts`), so the period's start is stored beside its end
 * (`plan_expires_at`). Like the end, it is only ever written by the Stripe
 * webhook. Existing rows start at NULL, which the quota reads as "the last 30
 * days" until the next subscription event records the real start.
 */
export const name = '012_plan_period_start';

export const sql = `
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_period_start BIGINT;
`;
