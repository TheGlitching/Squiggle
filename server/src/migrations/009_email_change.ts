/**
 * Migration 009 - email change.
 *
 * Changing the address on an account is confirmed with a code sent to the NEW
 * address, which is the same shape as a login code. Rather than a second table
 * for it, the `magic_links` row gains the account it was issued for: a row with
 * `change_user_id` set can only confirm that account's change, and a row
 * without it can only log in. The two are never interchangeable (see
 * `verifyMagicLink` and `confirmEmailChange`).
 *
 * The reference cascades, so deleting an account takes its pending change
 * codes with it.
 */

export const name = '009_email_change';

export const sql = `
ALTER TABLE magic_links ADD COLUMN IF NOT EXISTS change_user_id TEXT REFERENCES users (id) ON DELETE CASCADE;
`;
