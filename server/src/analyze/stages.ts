/**
 * The five analysis stage endpoints (Phase 2c).
 *
 * The client drives the run (the extension, or the web app with a pasted
 * text); the server owns the result. Each call is one or two model calls
 * (5–25 s), which is what makes a whole analysis fit on a serverless runtime
 * that would time out on a single 3-minute request.
 *
 *   check         cache lookup only — a hit costs 0 LLM calls and 0 credits,
 *                 and the article's text never leaves the reader's machine
 *                 (only its fingerprint does)
 *   audit         the article, once, in one strict-JSON call
 *   research      one factual finding, checked against evidence
 *   source-check  one link the article cites, fetched and read
 *   finalize      pure code: reconcile, rescore, cache, consume the credit
 *
 * Two invariants hold the whole thing together.
 *
 *  1. **The server never fetches the article.** Its text is always supplied by
 *     the client: the extension reads the page the reader is already looking
 *     at, the web app sends what the reader pasted. A paywalled article is
 *     analysed exactly as far as the reader can read it (flagged as partial),
 *     an address given beside a pasted text is never requested, and our IP
 *     never appears in a publisher's logs.
 *     The only pages the server fetches are the article's own cited sources,
 *     through the SSRF-hardened fetcher.
 *
 *  2. **A cached report is server-authored end to end.** Between stages the
 *     intermediate state lives in the `analysis_runs` row, not in the client's
 *     hands; a client names a run, a finding, a claim, and never their
 *     content. That is what stops one reader's poisoned article from planting
 *     text in the shared cache that a different reader would be served.
 *
 *  3. **A cached report is only served to a reader whose page yields the same
 *     text.** The cache key is the address AND the fingerprint of the text.
 *     The server files a report under the fingerprint it computed itself from
 *     the text it was given, never one a client declared, so text invented for
 *     a real article's address lands under a key no honest reader asks for.
 */
import {
  AnalysisReport,
  articleLength,
  articleTextHash,
  articleTooLongMessage,
  AUDIT_MAX_OUTPUT_TOKENS,
  buildFourchesCaudinesUserPrompt,
  computeFourchesCaudinesScore,
  FOURCHES_CAUDINES_SYSTEM_PROMPT,
  isResearchableFinding,
  MAX_ARTICLE_CHARS,
  parseAndValidateLlmOutput,
  reconcileResearchedFindings,
  researchFindings,
  safeFetchPageText,
  sha256Hex,
  verifyCitedSources,
  type AnalysisInput,
  type BaseLLMClient,
  type CitedSource,
  type EvidenceSource,
  type PageFetcher,
} from '@squiggle/shared';

import type { Clock } from '../lib/clock';
import { METRIC_NAMES, type Db, type MetricName, type UserRow } from '../db/types';
import { entitlementOf, refusalFor, startsCountedFromDay, startsRefusal } from '../billing/quota';
import { apiError, type ApiError, type Outcome } from '../lib/errors';
import { logEvent } from '../lib/log';
import { countMetric } from '../metrics';
import { sanitizeReport } from '../lib/sanitize';
import { REPORT_MAX_BYTES, REPORT_TTL_MS } from '../usage/limits';
import { ANON_RATE_SCOPE_PREFIX, DAY_MS } from '../usage/limits';
import {
  ANALYSES_GLOBAL_PER_HOUR,
  ANON_ANALYSES_PER_DAY,
  ANON_ANALYSES_PER_IP_PER_DAY,
  CONCURRENT_RUN_WINDOW_MS,
  HOUR_MS,
  MAX_CONCURRENT_RUNS,
} from '../usage/abuse';
import { articleUrlHash, canonicalAddress, PASTED_TEXT_KEY } from './canonicalUrl';
import type { AuditRequest } from './schemas';
import { parseRunState, serializeRunState, type AnalysisRunState } from './runState';

/** A run is abandoned if the extension stops driving it for this long. */
export const RUN_TTL_MS = 60 * 60 * 1000;

/**
 * How much one credit can buy.
 *
 * The client drives the run, so without these the cost of an analysis is
 * whatever the client asks for: a model that returns two hundred findings, or
 * simply a client that keeps calling, would spend two hundred model calls
 * against a single credit. A long investigation raises a handful of factual
 * objections, and the engine's own per-analysis page budget is eight, so a
 * real article rarely meets either cap; one that does keeps its other
 * findings, reported as unverified.
 *
 * Together with the per-call caps below, they bound one analysis on the
 * production model to under 50 cents in the worst case, at the price of the
 * dearest hosts it is pinned to (Nebius, tried first, and Together AI, both
 * $0.30 / $1.20 per million tokens): under 45 cents when the hosts were
 * pinned, plus at most two audits of 100 000 characters answering in
 * `AUDIT_MAX_OUTPUT_TOKENS`, about 3 cents each;
 * the arithmetic is in the pull requests that set the caps and pinned the
 * hosts. About 12 cents of it is web searches, at half a cent each, which is
 * why the search count is capped per finding; they are close to half the
 * cost of a typical analysis.
 */
export const MAX_RESEARCH_CALLS_PER_RUN = 8;
export const MAX_SOURCE_CHECKS_PER_RUN = 8;

/**
 * Web searches one research call may run. The provider's search tool lets the
 * model search as often as it likes in one request (OpenRouter allows thirty),
 * and every search is billed; three is enough to confirm or refute one claim.
 */
export const MAX_SEARCHES_PER_RESEARCH = 3;

/**
 * Output ceiling on the research and cited-page calls of a run, reasoning
 * included. Without one a single answer is bounded only by the model's own
 * maximum, hundreds of thousands of tokens. A verdict is a short JSON object.
 * The audit writes the whole report and has its own, larger ceiling,
 * `AUDIT_MAX_OUTPUT_TOKENS`.
 */
export const MAX_OUTPUT_TOKENS = 4096;

/** Per-cited-page fetch timeout on the server. */
const SOURCE_FETCH_TIMEOUT_MS = 10_000;

export interface AnalyzeServices {
  db: Db;
  clock: Clock;
  /**
   * Builds the hosted LLM client. A factory rather than an instance so tests
   * inject a stub and no test can reach a real provider by accident.
   */
  llm: () => BaseLLMClient;
  /** Prompt set version; part of the cache key. */
  promptVersion: string;
  /** Injected into the cited-source fetcher (tests serve pages from memory). */
  fetchImpl?: typeof fetch;
  /** Correlation id of the request being served; logged, never derived from content. */
  requestId: string;
  /**
   * Who is asking: the extension (`install`), the web app on an account
   * (`session`), or a visitor on the web app without one (`anon`). Counted,
   * never stored with the run.
   */
  surface: 'install' | 'session' | 'anon';
}

/**
 * A visitor without an account, on the site's one free analysis a day. They
 * are known only by the SHA-256 of their IP, which keys the day's count and
 * nothing else.
 */
export interface Visitor {
  visitor: true;
  ipHash: string;
}

/** Who drives a run: an account, or a visitor without one. */
export type Reader = UserRow | Visitor;

function isVisitor(reader: Reader): reader is Visitor {
  return 'visitor' in reader;
}

/** The account a run belongs to; null for a visitor's. */
function ownerOf(reader: Reader): string | null {
  return isVisitor(reader) ? null : reader.id;
}

/** The account id for a log line; a visitor has none, and their address is never logged. */
function logIdOf(reader: Reader): string | undefined {
  return ownerOf(reader) ?? undefined;
}

const ANON_IP_SCOPE = `${ANON_RATE_SCOPE_PREFIX}ip`;
const ANON_ALL_SCOPE = `${ANON_RATE_SCOPE_PREFIX}all`;

/**
 * The page reader every stage on this server uses. It is the SSRF-hardened
 * one, never the extension's: here a "cited source" is a URL chosen by
 * whoever wrote the article, executed from inside our own network.
 */
/** Count a metric at the clock of the request being served. */
const count = (s: AnalyzeServices, name: MetricName) => countMetric(s.db, name, s.clock.now(), s.requestId);

/** Count a refusal the reader is shown, by its code, when it is one the metrics follow. */
async function countRefusal(s: AnalyzeServices, refusal: ApiError): Promise<void> {
  const name = `refused_${refusal.code}`;
  if ((METRIC_NAMES as readonly string[]).includes(name)) await count(s, name as MetricName);
}

function serverPageFetcher(s: AnalyzeServices): PageFetcher {
  return (url, timeoutMs) => safeFetchPageText(url, timeoutMs, { fetchImpl: s.fetchImpl });
}

function modelIdOf(client: BaseLLMClient): string {
  return `${client.getProvider()}/${client.getModel()}`;
}

// ---------------------------------------------------------------------------
// check
// ---------------------------------------------------------------------------

export interface CheckResult {
  hit: boolean;
  report?: AnalysisReport;
  cachedAt?: number;
}

/**
 * Cache preflight. Takes the URL (absent for a text pasted without one) and
 * the fingerprint of the text the reader's page yields: on a hit the reader
 * gets a full report without the article ever being sent anywhere.
 *
 * The fingerprint is the reader's own claim and is not verified, which is
 * safe: a reader who lies about it asks for a report built from a text that is
 * not theirs, and the report they are handed is only ever one the server
 * itself filed under that fingerprint.
 */
export async function analyzeCheck(
  s: AnalyzeServices,
  rawUrl: string | undefined,
  textHash: string,
): Promise<Outcome<CheckResult>> {
  const urlHash = await articleUrlHash(rawUrl);
  if (!urlHash) return apiError('invalid_url', "Cette adresse n'est pas une page web analysable.");

  const model = modelIdOf(s.llm());
  await count(s, 'check');
  const cached = await s.db.findReport(urlHash, textHash, model, s.promptVersion);
  if (!cached || cached.expiresAt <= s.clock.now()) return { ok: true, hit: false };

  logEvent({ event: 'cache_hit', requestId: s.requestId, urlHash });
  await count(s, 'cache_hit');
  // Sanitized again on the way out. It was sanitized before it was stored, so
  // this is redundant for anything this build wrote — and it is what makes
  // "no reader is ever served unsanitized text" true of rows an older build
  // wrote, without a migration.
  return {
    ok: true,
    hit: true,
    report: sanitizeReport(JSON.parse(cached.report) as AnalysisReport),
    cachedAt: cached.createdAt,
  };
}

// ---------------------------------------------------------------------------
// audit
// ---------------------------------------------------------------------------

export interface AuditResult {
  runId: string;
  report: AnalysisReport;
  /** Findings the research stage can actually test, in the order to call them. */
  researchable: string[];
}

export async function analyzeAudit(
  s: AnalyzeServices,
  reader: Reader,
  payload: AuditRequest,
): Promise<Outcome<AuditResult>> {
  // The address is only ever a key and a line of the prompt: whatever it
  // names, this server never requests it.
  const canonical = canonicalAddress(payload.url);
  if (!canonical) return apiError('invalid_url', "Cette adresse n'est pas une page web analysable.");
  const urlHash = await sha256Hex(canonical);

  // A page that strings several articles together is refused, not truncated:
  // an analysis of the first hundred thousand characters of a home page would
  // be a verdict on something the reader never chose to read.
  const chars = articleLength(payload.blocks);
  if (chars > MAX_ARTICLE_CHARS) {
    logEvent({ event: 'payload_rejected', requestId: s.requestId, userId: logIdOf(reader), fields: ['blocks'], count: chars });
    await count(s, 'refused_article_too_long');
    return apiError('article_too_long', articleTooLongMessage(chars));
  }

  const now = s.clock.now();

  // Every ceiling is checked BEFORE the provider is called: an abusive client
  // must not be able to spend a single token proving it is abusive.
  const gate = isVisitor(reader) ? await enforceVisitorCeilings(s, reader, now) : await enforceStartCeilings(s, reader, now);
  if (!gate.ok) {
    await countRefusal(s, gate);
    return gate;
  }
  await count(s, `run_started_${s.surface}`);

  // The run row is opened BEFORE the audit call, not after it. The audit takes
  // 5-25 seconds, and a row written afterwards leaves that whole window with
  // nothing for the concurrency check to see: two audits fired together would
  // both pass the ceiling, and their two finalizes would consume two credits
  // from an account entitled to one. Opening it first makes the row itself the
  // reservation.
  const run = await s.db.createAnalysisRun({
    userId: ownerOf(reader),
    urlHash,
    state: serializeRunState(pendingState(now)),
    now,
    ttlMs: RUN_TTL_MS,
  });

  const client = s.llm();

  const input: AnalysisInput = {
    url: canonical === PASTED_TEXT_KEY ? 'non communiquée (texte collé par le lecteur)' : canonical,
    title: payload.title || 'Article sans titre',
    author: payload.author,
    outlet: payload.outlet,
    language: 'fr',
    blocks: payload.blocks,
  };

  const citedSources: CitedSource[] = payload.citedSources.map((source) => ({
    href: source.href,
    domain: source.domain,
    text: source.text,
    blockId: source.blockId,
  }));

  // The validator checks a 'source-absente' finding against the block it was
  // raised on, so the article's own links have to be reachable by block id.
  const sourcesByBlock: Record<string, EvidenceSource[]> = {};
  for (const source of citedSources) {
    if (!source.blockId) continue;
    (sourcesByBlock[source.blockId] ??= []).push({
      title: source.text || source.domain,
      url: source.href,
      origin: 'article',
    });
  }

  // An answer that comes back unreadable is asked for once more before the
  // reader sees an error: a malformed answer is rarely repeated, and a second
  // audit costs a few cents where the error costs the reader the whole run.
  let audited: AnalysisReport | undefined;
  for (let attempt = 0; attempt < 2 && !audited; attempt += 1) {
    const startedAt = Date.now();
    let completion;
    await count(s, 'audit');
    try {
      completion = await client.complete({
        systemPrompt: FOURCHES_CAUDINES_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: buildFourchesCaudinesUserPrompt(input, { citedSources, now: new Date(now) }),
          },
        ],
        temperature: 0.1,
        maxTokens: AUDIT_MAX_OUTPUT_TOKENS,
      });
    } catch {
      // Close the reservation: an audit that never produced anything must not
      // hold the account's single slot for the next five minutes. The start is
      // given back too. Hosted inference is pinned to a short list of hosts with
      // no fallback beyond it, so "none of them can serve right now" is an
      // expected outcome, and a reader retrying through it must not run out of
      // starts for runs that never began. No credit was consumed either: that happens at finalize.
      // Every audit call failure is released, a billed timeout included: the
      // hourly global ceiling bounds that, and the release can be narrowed to
      // provider refusals if timeouts ever show up in the failure counters.
      await s.db.finalizeAnalysisRun(run.id, now);
      await releaseStart(s, reader, now);
      await count(s, 'audit_failed');
      return apiError('provider_unavailable', 'Service momentanément indisponible. Réessayez dans quelques minutes.');
    }

    // The model ran out of output budget: the report is cut short. Counted on
    // its own because it is the one unreadable answer a bigger budget fixes.
    if (completion.finishReason === 'length') await count(s, 'audit_truncated');

    try {
      audited = parseAndValidateLlmOutput(completion.content, input, {
        modelName: modelIdOf(client),
        durationMs: Date.now() - startedAt,
        articleSources: sourcesByBlock,
      });
    } catch {
      await count(s, 'audit_failed');
    }
  }

  if (!audited) {
    // Our failure, not the reader's: the start is given back as for a provider
    // failure, and no credit was consumed.
    await s.db.finalizeAnalysisRun(run.id, now);
    await releaseStart(s, reader, now);
    return apiError('provider_unreadable', "La réponse du modèle n'a pas pu être lue. Réessayez.");
  }

  const state: AnalysisRunState = {
    url: canonical,
    title: input.title,
    author: payload.author,
    outlet: payload.outlet,
    partialAccess: payload.partialAccess,
    model: modelIdOf(client),
    promptVersion: s.promptVersion,
    // From the blocks the audit was just run on, not from anything the client
    // declared: this is the key the finished report will be filed under.
    textHash: await articleTextHash(payload.blocks),
    auditDurationMs: audited.meta.durationMs,
    textLengthChars: audited.meta.textLengthChars ?? 0,
    blocksCount: audited.meta.blocksCount ?? payload.blocks.length,
    summary: audited.summary,
    findings: audited.findings,
    rawScores: audited.meta.rawScores ?? [],
    citedSources,
    claims: [],
    sourceChecks: [],
    queries: [],
    researchPerformed: false,
    startedAt: now,
  };

  await s.db.updateAnalysisRunState(run.id, serializeRunState(state), now);

  logEvent({ event: 'analysis_started', requestId: s.requestId, userId: logIdOf(reader), urlHash });

  return {
    ok: true,
    runId: run.id,
    report: sanitizeReport(audited),
    researchable: researchableFindingIds(state),
  };
}

/**
 * What a run has to clear to start: the reader's own entitlement, one analysis
 * in flight per account, a ceiling on runs started per account, and an hourly
 * ceiling for the whole service. That last one is the only thing standing
 * between a mass account compromise and an unbounded model invoice.
 */
async function enforceStartCeilings(
  s: AnalyzeServices,
  user: UserRow,
  now: number,
): Promise<Outcome<Record<never, never>>> {
  // What the reader is entitled to comes first: it is the only refusal they
  // can act on, and checking it here means a reader out of credits never pays
  // for a token. The credit itself is consumed at a successful finalize, so a
  // run that dies on a provider timeout costs them nothing.
  const entitlement = await entitlementOf(s.db, user, now);
  const refusal = refusalFor(entitlement);
  if (refusal) return refusal;

  // Read-then-insert, so it is not atomic: two requests can still both read
  // zero. What the reservation below changes is the SIZE of that window —
  // milliseconds between two statements instead of the 5-25 seconds an audit
  // call takes. Closing it completely would need a unique partial index on
  // "one open run per user", which is worth doing if this ever proves to
  // matter and is not worth the schema today.
  const active = await s.db.countActiveAnalysisRuns(user.id, now - CONCURRENT_RUN_WINDOW_MS);
  if (active >= MAX_CONCURRENT_RUNS) {
    logEvent({ event: 'rate_limited', requestId: s.requestId, userId: user.id, scope: 'analyze:concurrent', count: active });
    return apiError('rate_limited', 'Une analyse est déjà en cours. Attendez qu’elle se termine.');
  }

  // A credit is only consumed at finalize, so a run abandoned after its
  // research costs us a full analysis and the reader nothing. Without a count
  // of starts, one account could keep doing that every five minutes.
  const started = await s.db.recordRunStart(user.id, now, startsCountedFromDay(entitlement));
  const tooManyStarts = startsRefusal(entitlement, started);
  if (tooManyStarts) {
    logEvent({ event: 'rate_limited', requestId: s.requestId, userId: user.id, scope: 'analyze:starts', count: started });
    return tooManyStarts;
  }

  return enforceHourlyCeiling(s, now);
}

/** The hourly ceiling for the whole service, accounts and visitors together. */
async function enforceHourlyCeiling(s: AnalyzeServices, now: number): Promise<Outcome<Record<never, never>>> {
  const global = await s.db.recordAndCheckRate({
    scope: 'analyze:global',
    key: 'all',
    limit: ANALYSES_GLOBAL_PER_HOUR,
    windowMs: HOUR_MS,
    now,
  });
  if (!global.allowed) {
    logEvent({ event: 'rate_limited', requestId: s.requestId, scope: 'analyze:global', count: global.count });
    return apiError('rate_limited', 'Le service est momentanément saturé. Réessayez dans un moment.');
  }
  return { ok: true };
}

/**
 * What a visitor's run has to clear: their one analysis of the day, the
 * site's daily allowance for every visitor together, and the hourly ceiling
 * accounts meet too. A use is counted when the run starts, since that is when
 * it costs; a ceiling met further down gives back the ones counted above it,
 * so a visitor turned away by the site's allowance keeps their own for later.
 */
async function enforceVisitorCeilings(
  s: AnalyzeServices,
  visitor: Visitor,
  now: number,
): Promise<Outcome<Record<never, never>>> {
  const own = await s.db.recordAndCheckRate({
    scope: ANON_IP_SCOPE,
    key: visitor.ipHash,
    limit: ANON_ANALYSES_PER_IP_PER_DAY,
    windowMs: DAY_MS,
    now,
  });
  if (!own.allowed) {
    logEvent({ event: 'rate_limited', requestId: s.requestId, scope: ANON_IP_SCOPE, count: own.count });
    return apiError(
      'anon_used',
      'Votre analyse sans compte du jour est faite. Créez un compte gratuit pour analyser ce texte : 3 analyses offertes.',
    );
  }

  const all = await s.db.recordAndCheckRate({
    scope: ANON_ALL_SCOPE,
    key: 'all',
    limit: ANON_ANALYSES_PER_DAY,
    windowMs: DAY_MS,
    now,
  });
  if (!all.allowed) {
    await s.db.releaseRate({ scope: ANON_IP_SCOPE, key: visitor.ipHash, windowMs: DAY_MS, now });
    logEvent({ event: 'rate_limited', requestId: s.requestId, scope: ANON_ALL_SCOPE, count: all.count });
    return apiError(
      'anon_closed',
      'Les analyses sans compte de la journée sont toutes faites. Créez un compte gratuit pour analyser ce texte : 3 analyses offertes.',
    );
  }

  const hourly = await enforceHourlyCeiling(s, now);
  if (!hourly.ok) await releaseVisitorStart(s, visitor, now);
  return hourly;
}

/**
 * Give back a start the provider never served: an account's start, or the
 * visitor's analysis of the day and its place in the site's allowance.
 */
async function releaseStart(s: AnalyzeServices, reader: Reader, now: number): Promise<void> {
  if (isVisitor(reader)) await releaseVisitorStart(s, reader, now);
  else await s.db.releaseRunStart(reader.id, now);
}

async function releaseVisitorStart(s: AnalyzeServices, visitor: Visitor, now: number): Promise<void> {
  await s.db.releaseRate({ scope: ANON_IP_SCOPE, key: visitor.ipHash, windowMs: DAY_MS, now });
  await s.db.releaseRate({ scope: ANON_ALL_SCOPE, key: 'all', windowMs: DAY_MS, now });
}

/**
 * Which findings the research stage would actually act on, read from the
 * engine's own list rather than a copy of it: the client loops over exactly
 * this, so it never pays for a call the engine would skip, and the two can
 * never drift.
 */
function researchableFindingIds(state: AnalysisRunState): string[] {
  return state.findings
    .filter(isResearchableFinding)
    .map((finding) => finding.id)
    .slice(0, MAX_RESEARCH_CALLS_PER_RUN);
}

// ---------------------------------------------------------------------------
// run lookup shared by the stages that need one
// ---------------------------------------------------------------------------

async function loadRun(
  s: AnalyzeServices,
  reader: Reader,
  runId: string,
): Promise<Outcome<{ state: AnalysisRunState; urlHash: string; finalized: boolean }>> {
  const run = await s.db.getAnalysisRun(runId);
  // One error for "unknown", "someone else's" and "expired": a client that
  // guesses run ids learns nothing from which of the three it hit. An account
  // never reaches a visitor's run, nor a visitor an account's.
  if (!run || run.userId !== ownerOf(reader) || run.expiresAt <= s.clock.now()) {
    return apiError('run_not_found', "Cette analyse n'est plus en cours. Relancez-la.");
  }
  return { ok: true, state: parseRunState(run.state), urlHash: run.urlHash, finalized: run.finalizedAt !== null };
}

// ---------------------------------------------------------------------------
// research
// ---------------------------------------------------------------------------

export async function analyzeResearch(
  s: AnalyzeServices,
  reader: Reader,
  payload: { runId: string; findingId: string },
): Promise<Outcome<{ claim: AnalysisRunState['claims'][number] | null }>> {
  const loaded = await loadRun(s, reader, payload.runId);
  if (!loaded.ok) return loaded;
  const { state } = loaded;

  if (loaded.finalized) {
    // The credit for this run has already been consumed. Left open, this stage
    // would keep buying provider calls against a run that is already paid for.
    return apiError('run_already_finalized', 'Cette analyse est déjà terminée.');
  }

  const finding = state.findings.find((f) => f.id === payload.findingId);
  if (!finding) return apiError('not_found', 'Ce constat ne fait pas partie de cette analyse.');

  if (state.claims.length >= MAX_RESEARCH_CALLS_PER_RUN) {
    return apiError('rate_limited', 'Cette analyse a atteint son nombre de vérifications.');
  }

  // Already researched: return what we have rather than paying twice.
  const existing = state.claims.find((claim) => claim.findingId === finding.id);
  if (existing) return { ok: true, claim: existing };

  const client = s.llm();
  let result;
  await count(s, 'research');
  try {
    result = await researchFindings({
      client,
      // The article's text is gone by now, and this stage does not read it:
      // it tests the finding's own quote against evidence.
      input: { url: state.url, title: state.title, language: 'fr', blocks: [] },
      findings: [finding],
      citedSources: state.citedSources,
      now: new Date(s.clock.now()),
      maxSearches: MAX_SEARCHES_PER_RESEARCH,
      maxTokens: MAX_OUTPUT_TOKENS,
      fetchPage: serverPageFetcher(s),
      fetchTimeoutMs: SOURCE_FETCH_TIMEOUT_MS,
    });
  } catch {
    // A failed research call degrades one finding, never the run: the client
    // moves on to the next one and the report says the claim is unverified.
    await count(s, 'research_failed');
    return apiError('provider_unavailable', "La vérification de ce constat n'a pas abouti.");
  }

  state.researchPerformed = state.researchPerformed || result.research.performed;
  state.researchProvider = result.research.provider ?? state.researchProvider;
  state.queries.push(...result.research.queries);
  const claim = result.claims[0] ?? null;
  if (claim) state.claims.push(claim);

  await s.db.updateAnalysisRunState(payload.runId, serializeRunState(state), s.clock.now());
  return { ok: true, claim };
}

// ---------------------------------------------------------------------------
// source-check
// ---------------------------------------------------------------------------

export async function analyzeSourceCheck(
  s: AnalyzeServices,
  reader: Reader,
  payload: { runId: string; claimId: string; sourceUrl: string },
): Promise<Outcome<{ check: AnalysisRunState['sourceChecks'][number] | null }>> {
  const loaded = await loadRun(s, reader, payload.runId);
  if (!loaded.ok) return loaded;
  const { state } = loaded;

  if (loaded.finalized) {
    return apiError('run_already_finalized', 'Cette analyse est déjà terminée.');
  }

  const claim = state.claims.find((c) => c.id === payload.claimId);
  if (!claim) return apiError('not_found', "Cette affirmation ne fait pas partie de cette analyse.");

  if (state.sourceChecks.length >= MAX_SOURCE_CHECKS_PER_RUN) {
    return apiError('rate_limited', 'Cette analyse a atteint son nombre de sources lues.');
  }

  // The URL must be one the ARTICLE cited, as recorded at audit time. A URL a
  // client invents is refused here, before any fetch: this endpoint reads the
  // article's sources, it is not a fetch proxy.
  const source = state.citedSources.find((candidate) => candidate.href === payload.sourceUrl);
  if (!source) return apiError('not_found', "Ce lien ne fait pas partie des sources citées par l'article.");

  const already = state.sourceChecks.find((check) => check.claimId === claim.id && check.url === source.href);
  if (already) return { ok: true, check: already };

  const client = s.llm();
  let result;
  await count(s, 'source_check');
  try {
    result = await verifyCitedSources({
      client,
      claims: [claim],
      // Pinned to the claim's block so the engine pairs this exact page with
      // this exact claim, whatever the article's own block attribution was.
      citedSources: [{ ...source, blockId: claim.blockId }],
      now: new Date(s.clock.now()),
      maxPages: 1,
      maxTokens: MAX_OUTPUT_TOKENS,
      fetchTimeoutMs: SOURCE_FETCH_TIMEOUT_MS,
      fetchPage: serverPageFetcher(s),
    });
  } catch {
    await count(s, 'source_check_failed');
    return apiError('provider_unavailable', "La lecture de cette source n'a pas abouti.");
  }

  const check = result.checks[0] ?? null;
  if (check) state.sourceChecks.push(check);
  // The engine re-rates the claim against what the page actually said.
  const reconciled = result.claims[0];
  if (reconciled) {
    state.claims = state.claims.map((c) => (c.id === reconciled.id ? reconciled : c));
  }

  await s.db.updateAnalysisRunState(payload.runId, serializeRunState(state), s.clock.now());
  return { ok: true, check };
}

// ---------------------------------------------------------------------------
// finalize
// ---------------------------------------------------------------------------

export interface FinalizeResult {
  report: AnalysisReport;
  /** True when this call wrote the report into the shared cache. */
  cached: boolean;
}

/**
 * Pure code: no LLM call, so it cannot fail for a reason the reader would have
 * to pay for. It reconciles the audit's objections against what research
 * found, rescores against what survives, writes the shared cache, and only
 * then consumes the credit.
 */
export async function analyzeFinalize(
  s: AnalyzeServices,
  reader: Reader,
  payload: { runId: string },
): Promise<Outcome<FinalizeResult>> {
  const loaded = await loadRun(s, reader, payload.runId);
  if (!loaded.ok) return loaded;
  const { state, urlHash } = loaded;

  const now = s.clock.now();
  // Atomic and once: a replayed finalize finds the run already closed and
  // neither writes a second report nor consumes a second credit.
  if (!(await s.db.finalizeAnalysisRun(payload.runId, now))) {
    return apiError('run_already_finalized', 'Cette analyse est déjà terminée.');
  }

  // Sanitized once, here, before it is either cached or returned: the cached
  // bytes and the bytes this reader sees are the same sanitized report.
  const report = sanitizeReport(buildReport(state, now));

  const serialized = JSON.stringify(report);
  const sizeBytes = new TextEncoder().encode(serialized).length;
  let cached = false;
  // A run opened before runs recorded a text fingerprint has nothing to file
  // its report under. It is still this reader's result; it is just not shared.
  if (sizeBytes <= REPORT_MAX_BYTES && state.textHash) {
    try {
      await s.db.createReport({
        urlHash,
        textHash: state.textHash,
        model: state.model,
        promptVersion: state.promptVersion,
        report: serialized,
        sizeBytes,
        now,
        ttlMs: REPORT_TTL_MS,
      });
      cached = true;
    } catch {
      // Another reader finalised the same article first. Their report is
      // already in the cache; ours is still this reader's own result.
      cached = false;
    }
  }

  // The ledger records that an analysis happened, not which article it was.
  // A visitor has no ledger: their day's analysis was counted at its start.
  if (!isVisitor(reader)) await s.db.recordAnalysis({ userId: reader.id, now });
  await count(s, `finalize_${s.surface}`);
  logEvent({ event: 'analysis_finalized', requestId: s.requestId, userId: logIdOf(reader), urlHash });

  return { ok: true, report, cached };
}

/**
 * The state a run holds between being reserved and the audit answering. It
 * exists so the reservation can be written before the provider is called; no
 * stage other than the audit ever sees it.
 */
function pendingState(now: number): AnalysisRunState {
  return {
    url: '',
    title: '',
    partialAccess: false,
    model: '',
    promptVersion: '',
    textHash: '',
    auditDurationMs: 0,
    textLengthChars: 0,
    blocksCount: 0,
    summary: '',
    findings: [],
    rawScores: [],
    citedSources: [],
    claims: [],
    sourceChecks: [],
    queries: [],
    researchPerformed: false,
    startedAt: now,
  };
}

/** Reconcile, rescore and assemble — the same arithmetic the BYOK pipeline does. */
function buildReport(state: AnalysisRunState, now: number): AnalysisReport {
  const { findings, withdrawn } = reconcileResearchedFindings(state.findings, state.claims);
  const score = computeFourchesCaudinesScore(state.rawScores, findings);

  return {
    schemaVersion: 1,
    score: score.totalScore,
    scoreBand: score.scoreBand,
    summary: state.summary,
    categories: score.normalizedCategories,
    findings,
    claims: state.claims,
    research: {
      performed: state.researchPerformed,
      provider: state.researchProvider,
      queries: state.queries,
      withdrawn,
      sourceChecks: state.sourceChecks,
      skippedReason: state.researchPerformed
        ? undefined
        : "Aucun constat factuel de l'audit n'a pu être vérifié.",
    },
    meta: {
      model: state.model,
      promptVersion: state.promptVersion,
      analyzedAt: new Date(now).toISOString(),
      durationMs: state.auditDurationMs,
      textLengthChars: state.textLengthChars,
      blocksCount: state.blocksCount,
    },
  };
}
