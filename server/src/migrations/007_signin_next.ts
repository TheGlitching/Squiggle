/**
 * Migration 007 - the destination of a sign-in.
 *
 * The extension bridge sends a signed-out reader to sign in and expects them
 * back on the bridge page. Both the Google handshake and the emailed link
 * cross a hop that drops the page's own URL, so the destination is stored
 * with the row instead. It holds an already-sanitised internal path (see
 * auth/next.ts) or NULL, meaning the account page.
 */

export const name = '007_signin_next';

export const sql = `
ALTER TABLE magic_links ADD COLUMN IF NOT EXISTS next_path TEXT;

ALTER TABLE oauth_pending ADD COLUMN IF NOT EXISTS next_path TEXT;
`;
