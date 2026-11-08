/**
 * Migration 018 - the accord for commercial e-mail.
 *
 * A commercial e-mail to a private person needs their prior accord, so an
 * account says when it gave it and when it took it back. Nothing is backfilled:
 * every existing account starts without an accord. A withdrawal keeps the date
 * of the accord, which is what shows that a message sent before it was allowed.
 * The sign-in rows carry the ticked box across the emailed link or the Google
 * handshake, as they carry `next_path`, until the mailbox's owner has signed in.
 *
 * `marketing_unsub_token` is the one credential kept in clear, because every
 * commercial message has to print it again, and it can do nothing but withdraw
 * this accord.
 *
 * Additive and nullable, so the previous version runs on it unchanged. To undo
 * it by hand, drop these columns and the migration's `schema_migrations` row.
 */
export const name = '018_marketing_consent';

export const sql = `
ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_consent_at BIGINT;

ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_withdrawn_at BIGINT;

ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_unsub_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS users_marketing_unsub_idx ON users (marketing_unsub_token);

ALTER TABLE magic_links ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE oauth_pending ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN NOT NULL DEFAULT false;
`;
