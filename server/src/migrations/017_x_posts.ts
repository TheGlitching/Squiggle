/**
 * Migration 017 - publications read from X.
 *
 * X bills a resource once per UTC day and asks for its content to be kept
 * current and removed on request, so a publication is kept for a day (the
 * sweep drops it after) and no longer: enough that the same link read twice
 * is paid once, not enough to become an archive. Keyed by the publication's
 * identifier; `thread_done` marks the rows of a thread that was read whole.
 */
export const name = '017_x_posts';

export const sql = `
CREATE TABLE IF NOT EXISTS x_posts (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  author_username TEXT NOT NULL,
  author_name TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  replied_to_id TEXT,
  alt_texts TEXT NOT NULL,
  thread_done BOOLEAN NOT NULL DEFAULT false,
  fetched_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS x_posts_thread_idx ON x_posts (conversation_id, author_id);
`;
