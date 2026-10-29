/**
 * The retention and size policy of the shared report cache and the usage
 * ledger, as published in the product spec (§5.2). These are the numbers
 * `PRIVACY.md` will quote verbatim: change them here, not in callers.
 *
 *   - cached reports:        30-day TTL, at most REPORT_MAX_COUNT, size-capped
 *   - usage ledger rows:     12 months (who ran what, never the content)
 *   - short-lived auth rows:  purged as soon as their own TTL lapses
 *   - rate-limit windows:     purged once their hour has closed
 */
export const DAY_MS = 24 * 60 * 60 * 1000;

export const WEEK_MS = 7 * DAY_MS;

/** A cached report is valid for 30 days, then it is purged. */
export const REPORT_TTL_MS = 30 * DAY_MS;

/** The whole cache holds at most this many reports (oldest evicted first). */
export const REPORT_MAX_COUNT = 500;

/** A single sanitized report may not exceed this many bytes (~256 KB). */
export const REPORT_MAX_BYTES = 256 * 1024;

/** Ledger rows are kept for 12 months, then dropped. */
export const USAGE_LOG_RETENTION_MS = 365 * DAY_MS;

/**
 * The rate-limit window every caller counts in, except the analysis without
 * an account. A window row names an IP or an address in clear, so the hourly
 * sweep drops it once it closes. A longer window must be swept on its own, or
 * its count resets early.
 */
export const RATE_WINDOW_MS = 60 * 60 * 1000;

/**
 * The site's allowance for every visitor together counts per UTC day, under
 * this prefix. It names no one (its key is `all`), and the sweep drops a
 * row once its day has closed.
 */
export const ANON_RATE_SCOPE_PREFIX = 'anon:';

/**
 * How long the fingerprint of a visitor's address is kept after their one
 * analysis without an account: the SHA-256 of the IP, never the IP, and the
 * time of the analysis, nothing else. A refused attempt does not extend it.
 *
 * The rule is one analysis in all, and only a fingerprint kept forever would
 * hold it to the letter. Ninety days is the shortest that still holds it in
 * practice: at thirty, a monthly reader would have a free analysis at every
 * visit and never need an account, which is the hole this closes. Past a few
 * months an address is a poor witness anyway (a box restarts, a phone changes
 * network, a carrier hands the address to someone else), so keeping it longer
 * would mostly refuse someone who never had one. `PRIVACY.md` quotes it.
 */
export const VISITOR_USE_RETENTION_MS = 90 * DAY_MS;

/**
 * The cron trigger (`wrangler.jsonc`) that runs the daily report sweep; any
 * other trigger runs the hourly one. It lives here, not in `index.ts`, because
 * the Workers runtime reads every named export of the entry module as an
 * entrypoint and refuses to start on one that is not a function.
 */
export const DAILY_CRON = '17 3 * * *';

/**
 * The UTC day containing the given epoch milliseconds, expressed as the
 * epoch milliseconds of that day's midnight. The daily quota is a
 * UTC-day concept on purpose: there is no timezone surface anywhere.
 */
export function utcDayOf(now: number): number {
  return Math.floor(now / DAY_MS) * DAY_MS;
}
