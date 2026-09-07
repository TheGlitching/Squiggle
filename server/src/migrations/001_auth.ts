/**
 * Migration 001 — the authentication schema (Phase 2a).
 *
 * Design notes:
 *  - Every timestamp is a BIGINT of epoch milliseconds. We deliberately avoid
 *    `timestamptz`: the round-trip is a plain number, there is no timezone
 *    surface anywhere, and comparisons in code are trivial.
 *  - Secrets that leave the server (extension tokens, web session tokens,
 *    magic-link codes) are stored only as their SHA-256 hex digest. The raw
 *    value exists at most once, in the response that created it.
 *  - Nullable UNIQUE columns (`users.email`, `users.google_sub`) stay
 *    constraint-safe: Postgres treats distinct NULLs as non-conflicting, so
 *    many account-less or email-less rows can coexist.
 */

export const name = '001_auth';

export const sql = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  google_sub TEXT UNIQUE,
  plan TEXT NOT NULL DEFAULT 'none',
  plan_expires_at BIGINT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS extension_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  public_key_jwk TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS extension_keys_user_idx ON extension_keys (user_id);

CREATE TABLE IF NOT EXISTS tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  key_id TEXT NOT NULL REFERENCES extension_keys (id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  revoked_at BIGINT
);

CREATE INDEX IF NOT EXISTS tokens_user_idx ON tokens (user_id);

CREATE TABLE IF NOT EXISTS magic_links (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT UNIQUE NOT NULL,
  ip TEXT,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  used_at BIGINT
);

CREATE TABLE IF NOT EXISTS web_sessions (
  id TEXT PRIMARY KEY,
  session_hash TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  revoked_at BIGINT
);

CREATE TABLE IF NOT EXISTS nonces (
  nonce TEXT PRIMARY KEY,
  key_id TEXT NOT NULL,
  expires_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS nonces_expiry_idx ON nonces (expires_at);

CREATE TABLE IF NOT EXISTS oauth_pending (
  state TEXT PRIMARY KEY,
  code_verifier TEXT NOT NULL,
  nonce TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limits (
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  window_start BIGINT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (scope, key, window_start)
);
`;
