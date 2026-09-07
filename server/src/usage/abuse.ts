/**
 * The ceilings that bound what abuse can cost us (Phase 2e).
 *
 * These are not the product's quotas — a reader's 3 trial analyses and 5 a day
 * live in the billing layer. These are the limits that stop a runaway or
 * hostile client from turning our Gemini bill into someone else's denial of
 * service, and they sit deliberately far above anything a real reader does, so
 * a legitimate user never meets one.
 *
 * On IP-based limiting specifically: an IP is a poor identity. A whole
 * office, a mobile carrier or a train's wifi share one, so a limit tight
 * enough to stop an attacker is tight enough to lock out a floor of a
 * building. The response is to put the strict limits on the identity that is
 * actually per-person — the email address for sign-in, the account for
 * analyses — and keep the per-IP limit as a loose backstop for the one case
 * where no account exists yet. Every denial is logged with its scope and, when
 * there is one, the account, so a shared IP that keeps tripping is visible
 * rather than silently locking people out.
 */

export const HOUR_MS = 60 * 60 * 1000;

/**
 * Analyses the whole service may start per hour, across every account. The
 * ceiling on one hour of a worst case: every account compromised at once
 * still cannot spend more than this.
 */
export const ANALYSES_GLOBAL_PER_HOUR = 300;

/**
 * There is no separate per-account hourly ceiling on top of these two. It
 * would never fire: one run in flight per five-minute window already bounds an
 * account to at most twelve starts an hour, and the billing quota bounds what
 * it can finish. A third limit nobody can reach is a limit nobody maintains.
 *
 * A run counts as in flight while a stage has touched it inside this window.
 * It is a window rather than "until finalized" on purpose: a reader who
 * closes the tab mid-analysis would otherwise be locked out for the run's
 * whole hour of TTL, which is a support ticket, not a security control.
 */
export const CONCURRENT_RUN_WINDOW_MS = 5 * 60 * 1000;

/** Concurrent analyses allowed per account. */
export const MAX_CONCURRENT_RUNS = 1;

/** Verify attempts one IP may make per hour against magic-link codes. */
export const MAGIC_LINK_VERIFY_PER_IP_PER_HOUR = 30;
