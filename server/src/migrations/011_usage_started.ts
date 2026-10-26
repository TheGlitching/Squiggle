/**
 * Migration 011 - runs started.
 *
 * Runs started per account and day, beside the analyses finished. A credit is
 * only consumed at finalize, so this is what bounds the runs an account opens
 * and never finishes (see `startsRefusal` in billing/quota.ts). Existing rows
 * start at zero: nothing before this migration was counted.
 */
export const name = '011_usage_started';

export const sql = `
ALTER TABLE usage_daily ADD COLUMN IF NOT EXISTS started INTEGER NOT NULL DEFAULT 0;
`;
