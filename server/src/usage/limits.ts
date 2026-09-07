/**
 * The retention and size policy of the shared report cache and the usage
 * ledger, as published in the product spec (§5.2). These are the numbers
 * `PRIVACY.md` will quote verbatim: change them here, not in callers.
 *
 *   - cached reports:        30-day TTL, at most REPORT_MAX_COUNT, size-capped
 *   - usage ledger rows:     12 months (who ran what, never the content)
 *   - short-lived auth rows:  purged as soon as their own TTL lapses
 */
export const DAY_MS = 24 * 60 * 60 * 1000;

/** A cached report is valid for 30 days, then it is purged. */
export const REPORT_TTL_MS = 30 * DAY_MS;

/** The whole cache holds at most this many reports (oldest evicted first). */
export const REPORT_MAX_COUNT = 500;

/** A single sanitized report may not exceed this many bytes (~256 KB). */
export const REPORT_MAX_BYTES = 256 * 1024;

/** Ledger rows are kept for 12 months, then dropped. */
export const USAGE_LOG_RETENTION_MS = 365 * DAY_MS;

/**
 * The UTC day containing the given epoch milliseconds, expressed as the
 * epoch milliseconds of that day's midnight. The daily quota is a
 * UTC-day concept on purpose: there is no timezone surface anywhere.
 */
export function utcDayOf(now: number): number {
  return Math.floor(now / DAY_MS) * DAY_MS;
}
