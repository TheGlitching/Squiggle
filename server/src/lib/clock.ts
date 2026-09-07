/**
 * Time access, isolated behind a tiny interface.
 *
 * Production uses {@link systemClock}; tests use {@link ManualClock} so
 * expiry and rate-limit windows can be exercised deterministically, without
 * ever waiting in real time.
 */

export interface Clock {
  /** Current time, milliseconds since the Unix epoch. */
  now(): number;
}

/** The production clock: real system time. */
export const systemClock: Clock = {
  now: () => Date.now(),
};

/** A deterministic clock: time only moves when a test moves it. */
export class ManualClock implements Clock {
  private t: number;

  constructor(startMs = 0) {
    this.t = startMs;
  }

  now(): number {
    return this.t;
  }

  set(ms: number): void {
    this.t = ms;
  }

  advance(ms: number): void {
    this.t += ms;
  }
}
