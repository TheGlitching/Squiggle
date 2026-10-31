/**
 * What every step of a run is handed: the database, the secrets, the clock,
 * whether the run is a dry run, and the journal of its steps. A step that fails
 * is recorded and the run goes on: the weekly e-mail always leaves, and says
 * which step is missing.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { Paths, Secrets } from './config';
import type { Db } from './db';

export interface Step {
  name: string;
  ok: boolean;
  detail: string;
}

export interface Ctx {
  db: Db;
  secrets: Secrets;
  paths: Paths;
  /** A dry run reads everything and calls the model, but writes nothing to Postiz or GitHub. */
  dry: boolean;
  /** `--sans-courriel`: e-mails are printed instead of sent, to read a run before anyone receives it. */
  noMail: boolean;
  now: Date;
  runId: number;
  steps: Step[];
  fetch: typeof fetch;
  log: (line: string) => void;
}

/** Runs one step, records how it went, and returns its result or `undefined` when it failed. */
export async function step<T>(ctx: Ctx, name: string, fn: () => Promise<T>, detail?: (value: T) => string): Promise<T | undefined> {
  ctx.log(`- ${name}`);
  try {
    const value = await fn();
    ctx.steps.push({ name, ok: true, detail: detail ? detail(value) : 'fait' });
    return value;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.log(`  échec : ${message}`);
    ctx.steps.push({ name, ok: false, detail: message.slice(0, 300) });
    return undefined;
  }
}

/** The PAUSE file: while it exists, the routine adds nothing. The queue already in Postiz keeps going out. */
export function pauseFile(ctx: Pick<Ctx, 'paths'>): string {
  return join(ctx.paths.data, 'PAUSE');
}

export function paused(ctx: Pick<Ctx, 'paths'>): boolean {
  return existsSync(pauseFile(ctx));
}

/** A fetch that throws on a non-2xx answer, naming the service but never echoing a token. */
export async function fetchJson<T>(ctx: Pick<Ctx, 'fetch'>, service: string, url: string, init: RequestInit = {}): Promise<T> {
  const response = await ctx.fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(60_000) });
  const text = await response.text();
  if (!response.ok) throw new Error(`${service} : HTTP ${response.status} ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : null) as T;
}

/** `2026-11-02` for a date, in UTC. */
export const day = (date: Date) => date.toISOString().slice(0, 10);

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** The Monday that starts the ISO week of `date`, as `YYYY-MM-DD`: the key every week's data is filed under. */
export function weekOf(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return day(d);
}
