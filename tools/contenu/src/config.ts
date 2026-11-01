/**
 * Everything the routine is configured with: the secrets it reads from the
 * environment (`~/contenu/.env` on the VPS, never the repository), where it
 * keeps its private data, and the constants of the strategy that only the
 * owner changes (rule 7 of the editorial line).
 */
import { homedir } from 'node:os';
import { join } from 'node:path';

export const ORIGIN = 'https://squiggle.fr';
export const REPO = 'TheGlitching/Squiggle';
export const REPO_URL = `https://github.com/${REPO}`;
export const MODEL = 'deepseek/deepseek-v4.1-flash';

/** Where the weekly report goes, and who it comes from. */
export const REPORT_TO = 'contact@squiggle.fr';
export const REPORT_FROM = 'no-reply@squiggle.fr';
export { OWNER_SENDERS, REPLY_TO } from './owners';

/** The networks connected in Postiz, by Postiz's `identifier`. */
export const NETWORKS = ['bluesky', 'mastodon', 'threads', 'facebook', 'instagram', 'x'] as const;
export type Network = (typeof NETWORKS)[number];

/** Spending caps, in dollars. The keys themselves carry the hard limits (D4); these stop the routine before them. */
export const CAPS = {
  /** OpenRouter's credit limit on the routine's key, per month. */
  openrouterMonthly: 5,
  /** A single run that costs this much is a loop, not a week's work. */
  openrouterPerRun: 0.75,
  /** X's spending cap per billing cycle. */
  xMonthly: 5,
  /** What the routine allows itself to spend reading X statistics, per month. */
  xReadsMonthly: 1,
};

/** X's prices, read on docs.x.com on 31 October 2026. */
export const X_PRICES = { post: 0.015, read: 0.005 };

/** How far ahead the queue is kept full, and when a thin queue raises an alert. */
export const RESERVE_DAYS = 28;
export const RESERVE_ALERT_DAYS = 14;

/** A merged piece of substance goes out at least this long after the e-mail that shows its posts. */
export const FRESH_NOTICE_HOURS = 48;

/** At most this many content pull requests open at once; beyond, the week proposes none. */
export const MAX_OPEN_CONTENT_PRS = 2;

/** More removals than this by the owner in a week puts the routine in draft mode (D2 b). */
export const MAX_REMOVALS_PER_WEEK = 2;

export interface Secrets {
  postizKey: string;
  postizUrl: string;
  cfToken: string;
  cfAccount: string;
  /** The KV namespace the reply Worker writes to; absent until it is set up. */
  cfRepliesNamespace?: string;
  metricsToken: string;
  openrouterKey: string;
  brevoKey: string;
  githubToken: string;
  gscCredentials: string;
  gscSite: string;
}

export interface Paths {
  /** The routine's private data: database, PAUSE file. Never in the repository. */
  data: string;
  /** The clone of the repository the routine runs from. */
  repo: string;
}

function need(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variable d’environnement manquante : ${name}`);
  return value;
}

export function secrets(): Secrets {
  return {
    postizKey: need('POSTIZ_API_KEY'),
    postizUrl: need('POSTIZ_API_URL').replace(/\/$/, ''),
    cfToken: need('CF_API_TOKEN'),
    cfAccount: need('CF_ACCOUNT_ID'),
    cfRepliesNamespace: process.env.CF_KV_REPONSES || undefined,
    metricsToken: need('SQUIGGLE_METRICS_TOKEN'),
    openrouterKey: need('OPENROUTER_API_KEY'),
    brevoKey: need('BREVO_API_KEY'),
    githubToken: need('GITHUB_TOKEN'),
    gscCredentials: need('GSC_CREDENTIALS'),
    gscSite: need('GSC_SITE'),
  };
}

export function paths(): Paths {
  return {
    data: process.env.CONTENU_DONNEES ?? join(homedir(), 'contenu', 'donnees'),
    repo: process.env.CONTENU_DEPOT ?? process.cwd(),
  };
}
