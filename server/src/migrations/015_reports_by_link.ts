/**
 * Migration 015 - find a report by its link alone.
 *
 * A link shared from a phone app carries no text, so it can never match the
 * (url, text) key: the reader has nothing to fingerprint. `read_by_extension`
 * marks the reports the server can serve on the link alone: those built from
 * a text the extension read on the page itself, in the reader's own tab. A
 * text pasted on the site never sets it, because a pasted text can be
 * invented and filed under a real article's or video's address. Rows written
 * before this column stay false and are never served by link alone.
 */
export const name = '015_reports_by_link';

export const sql = `
ALTER TABLE reports ADD COLUMN IF NOT EXISTS read_by_extension BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS reports_by_link_idx
  ON reports (url_hash, model, prompt_version, created_at)
  WHERE read_by_extension;
`;
