/**
 * Migration 014 - runs without an account.
 *
 * The site lets a visitor run one analysis a day without an account. Such a
 * run belongs to no account, so its `user_id` is NULL and its id alone names
 * it: a 128-bit random token handed only to the browser that opened it. The
 * row holds exactly what an account's run holds, and lapses on the same hour.
 */
export const name = '014_visitor_runs';

export const sql = `
ALTER TABLE analysis_runs ALTER COLUMN user_id DROP NOT NULL;
`;
