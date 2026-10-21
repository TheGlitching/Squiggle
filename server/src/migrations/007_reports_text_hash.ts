/**
 * Migration 007 - bind the shared report cache to the article's text.
 *
 * The cache was keyed on (url_hash, model, prompt_version), and the text a
 * report was built from comes from the client, never from the server. Any
 * account could therefore file a report made from invented text under the
 * address of a real article, and every later reader of that article would be
 * served it. The key now includes `text_hash`: the SHA-256 of the normalised
 * article text, computed by the server from the text it actually received (see
 * `articleTextHash` in the shared workspace).
 *
 * Every report already cached is deleted rather than backfilled. A row written
 * under the old key carries no proof of which text it came from, and the cache
 * is only ever a copy: the readers it would have served just run their own
 * analysis once and refill it under the new key.
 *
 * The old constraint is dropped by the name Postgres gave the inline UNIQUE in
 * migration 002.
 */

export const name = '007_reports_text_hash';

export const sql = `
DELETE FROM reports;

ALTER TABLE reports ADD COLUMN IF NOT EXISTS text_hash TEXT NOT NULL;

ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_url_hash_model_prompt_version_key;

ALTER TABLE reports ADD CONSTRAINT reports_cache_key UNIQUE (url_hash, text_hash, model, prompt_version);
`;
