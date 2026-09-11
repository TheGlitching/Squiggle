/**
 * Migration 006 - manual bridge codes.
 *
 * A Firefox reader cannot be navigated from the web app into the extension,
 * so the web app issues a short 8-character code that the reader types into
 * the extension. The row stores the code only as its SHA-256 digest and
 * carries the install's public key; no extension token exists until the code
 * is redeemed, so a database read never yields a usable credential.
 */

export const name = '006_bridge_codes';

export const sql = `
CREATE TABLE IF NOT EXISTS bridge_codes (
  id TEXT PRIMARY KEY,
  code_hash TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  session_hash TEXT NOT NULL,
  public_key_jwk TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  used_at BIGINT
);

CREATE INDEX IF NOT EXISTS bridge_codes_user_idx ON bridge_codes (user_id);
`;