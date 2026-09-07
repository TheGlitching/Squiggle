/**
 * The five analysis stage endpoints (Phase 2c).
 *
 * The extension drives the run; the server owns the result. Each call is one
 * or two Gemini calls (5–25 s), which is what makes a whole analysis fit on a
 * serverless runtime that would time out on a single 3-minute request.
 *
 *   check         cache lookup only — a hit costs 0 LLM calls and 0 credits,
 *                 and the article's text never leaves the reader's machine
 *   audit         the article, once, in one strict-JSON call
 *   research      one factual finding, checked against evidence
 *   source-check  one link the article cites, fetched and read
 *   finalize      pure code: reconcile, rescore, cache, consume the credit
 *
 * Two invariants hold the whole thing together.
 *
 *  1. **The server never fetches the article.** Its text is always supplied by
 *     the extension, from the page the reader is already looking at, so a
 *     paywalled article is analysed exactly as far as the reader can read it
 *     (flagged as partial) and our IP never appears in a publisher's logs.
 *     The only pages the server fetches are the article's own cited sources,
 *     through the SSRF-hardened fetcher.
 *
 *  2. **A cached report is server-authored end to end.** Between stages the
 *     intermediate state lives in the `analysis_runs` row, not in the client's
 *     hands; a client names a run, a finding, a claim, and never their
 *     content. That is what stops one reader's poisoned article from planting
 *     text in the shared cache that a different reader would be served.
 */
import {
  AnalysisReport,
  buildFourchesCaudinesUserPrompt,
  computeFourchesCaudinesScore,
  FOURCHES_CAUDINES_SYSTEM_PROMPT,
  parseAndValidateLlmOutput,
  reconcileResearchedFindings,
  RESEARCHABLE_FINDING_CATEGORIES,
  researchFindings,
  safeFetchPageText,
  verifyCitedSources,
  type AnalysisInput,
  type BaseLLMClient,
  type CitedSource,
  type EvidenceSource,
  type PageFetcher,
} from '@squiggle/shared';

import type { Clock } from '../lib/clock';
import type { Db, UserRow } from '../db/types';
import { apiError, type Outcome } from '../lib/errors';
import { logEvent } from '../lib/log';
import { sanitizeReport } from '../lib/sanitize';
import { REPORT_MAX_BYTES, REPORT_TTL_MS } from '../usage/limits';
import {
  ANALYSES_GLOBAL_PER_HOUR,
  ANALYSES_PER_ACCOUNT_PER_HOUR,
  CONCURRENT_RUN_WINDOW_MS,
  HOUR_MS,
  MAX_CONCURRENT_RUNS,
} from '../usage/abuse';
import { articleUrlHash, canonicalArticleUrl } from './canonicalUrl';
import type { AuditRequest } from './schemas';
import { parseRunState, serializeRunState, type AnalysisRunState } from './runState';

/** A run is abandoned if the extension stops driving it for this long. */
export const RUN_TTL_MS = 60 * 60 * 1000;

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
}

/**
 * The page reader every stage on this server uses. It is the SSRF-hardened
 * one, never the extension's: here a "cited source" is a URL chosen by
 * whoever wrote the article, executed from inside our own network.
 */
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
 * Cache preflight. Takes the URL and nothing else — on a hit the reader gets
 * a full report without the article ever being sent anywhere.
 */
export async function analyzeCheck(s: AnalyzeServices, rawUrl: string): Promise<Outcome<CheckResult>> {
  const urlHash = await articleUrlHash(rawUrl);
  if (!urlHash) return apiError('invalid_url', "Cette adresse n'est pas une page web analysable.");

  const model = modelIdOf(s.llm());
  const cached = await s.db.findReport(urlHash, model, s.promptVersion);
  if (!cached || cached.expiresAt <= s.clock.now()) return { ok: true, hit: false };

  logEvent({ event: 'cache_hit', requestId: s.requestId, urlHash });
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
  user: UserRow,
  payload: AuditRequest,
): Promise<Outcome<AuditResult>> {
  const canonical = canonicalArticleUrl(payload.url);
  if (!canonical) return apiError('invalid_url', "Cette adresse n'est pas une page web analysable.");
  const urlHash = await articleUrlHash(canonical);
  if (!urlHash) return apiError('invalid_url', "Cette adresse n'est pas une page web analysable.");

  const now = s.clock.now();

  // Every ceiling is checked BEFORE the provider is called: an abusive client
  // must not be able to spend a single token proving it is abusive.
  const gate = await enforceStartCeilings(s, user, now);
  if (!gate.ok) return gate;

  const client = s.llm();

  const input: AnalysisInput = {
    url: canonical,
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

  const startedAt = Date.now();
  let raw: string;
  try {
    const completion = await client.complete({
      systemPrompt: FOURCHES_CAUDINES_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: buildFourchesCaudinesUserPrompt(input, { citedSources, now: new Date(now) }),
        },
      ],
      temperature: 0.1,
      maxTokens: 4096,
    });
    raw = completion.content;
  } catch {
    return apiError('provider_unavailable', "Le modèle n'a pas répondu. Réessayez dans un instant.");
  }

  let audited: AnalysisReport;
  try {
    audited = parseAndValidateLlmOutput(raw, input, {
      modelName: modelIdOf(client),
      durationMs: Date.now() - startedAt,
      articleSources: sourcesByBlock,
    });
  } catch {
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
  };

  const run = await s.db.createAnalysisRun({
    userId: user.id,
    urlHash,
    state: serializeRunState(state),
    now,
    ttlMs: RUN_TTL_MS,
  });

  logEvent({ event: 'analysis_started', requestId: s.requestId, userId: user.id, urlHash });

  return {
    ok: true,
    runId: run.id,
    report: sanitizeReport(audited),
    researchable: researchableFindingIds(state),
  };
}

/**
 * The three ceilings a run has to clear to start: one analysis in flight per
 * account, an hourly per-account ceiling, and an hourly ceiling for the whole
 * service. The last one is the only thing standing between a mass account
 * compromise and an unbounded Gemini invoice.
 */
async function enforceStartCeilings(
  s: AnalyzeServices,
  user: UserRow,
  now: number,
): Promise<Outcome<Record<never, never>>> {
  const active = await s.db.countActiveAnalysisRuns(user.id, now - CONCURRENT_RUN_WINDOW_MS);
  if (active >= MAX_CONCURRENT_RUNS) {
    logEvent({ event: 'rate_limited', requestId: s.requestId, userId: user.id, scope: 'analyze:concurrent', count: active });
    return apiError('rate_limited', 'Une analyse est déjà en cours. Attendez qu’elle se termine.');
  }

  const perAccount = await s.db.recordAndCheckRate({
    scope: 'analyze:account',
    key: user.id,
    limit: ANALYSES_PER_ACCOUNT_PER_HOUR,
    windowMs: HOUR_MS,
    now,
  });
  if (!perAccount.allowed) {
    logEvent({ event: 'rate_limited', requestId: s.requestId, userId: user.id, scope: 'analyze:account', count: perAccount.count });
    return apiError('rate_limited', 'Trop d’analyses lancées récemment. Réessayez dans un moment.');
  }

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
 * Which findings the research stage would actually act on, read from the
 * engine's own list rather than a copy of it: the client loops over exactly
 * this, so it never pays for a call the engine would skip, and the two can
 * never drift.
 */
function researchableFindingIds(state: AnalysisRunState): string[] {
  return state.findings
    .filter((finding) => RESEARCHABLE_FINDING_CATEGORIES[finding.category])
    .map((finding) => finding.id);
}

// ---------------------------------------------------------------------------
// run lookup shared by the stages that need one
// ---------------------------------------------------------------------------

async function loadRun(
  s: AnalyzeServices,
  user: UserRow,
  runId: string,
): Promise<Outcome<{ state: AnalysisRunState; urlHash: string; finalized: boolean }>> {
  const run = await s.db.getAnalysisRun(runId);
  // One error for "unknown", "someone else's" and "expired": a client that
  // guesses run ids learns nothing from which of the three it hit.
  if (!run || run.userId !== user.id || run.expiresAt <= s.clock.now()) {
    return apiError('run_not_found', "Cette analyse n'est plus en cours. Relancez-la.");
  }
  return { ok: true, state: parseRunState(run.state), urlHash: run.urlHash, finalized: run.finalizedAt !== null };
}

// ---------------------------------------------------------------------------
// research
// ---------------------------------------------------------------------------

export async function analyzeResearch(
  s: AnalyzeServices,
  user: UserRow,
  payload: { runId: string; findingId: string },
): Promise<Outcome<{ claim: AnalysisRunState['claims'][number] | null }>> {
  const loaded = await loadRun(s, user, payload.runId);
  if (!loaded.ok) return loaded;
  const { state } = loaded;

  const finding = state.findings.find((f) => f.id === payload.findingId);
  if (!finding) return apiError('not_found', 'Ce constat ne fait pas partie de cette analyse.');

  // Already researched: return what we have rather than paying twice.
  const existing = state.claims.find((claim) => claim.findingId === finding.id);
  if (existing) return { ok: true, claim: existing };

  const client = s.llm();
  let result;
  try {
    result = await researchFindings({
      client,
      // The article's text is gone by now, and this stage does not read it:
      // it tests the finding's own quote against evidence.
      input: { url: state.url, title: state.title, language: 'fr', blocks: [] },
      findings: [finding],
      citedSources: state.citedSources,
      now: new Date(s.clock.now()),
      fetchPage: serverPageFetcher(s),
      fetchTimeoutMs: SOURCE_FETCH_TIMEOUT_MS,
    });
  } catch {
    // A failed research call degrades one finding, never the run: the client
    // moves on to the next one and the report says the claim is unverified.
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
  user: UserRow,
  payload: { runId: string; claimId: string; sourceUrl: string },
): Promise<Outcome<{ check: AnalysisRunState['sourceChecks'][number] | null }>> {
  const loaded = await loadRun(s, user, payload.runId);
  if (!loaded.ok) return loaded;
  const { state } = loaded;

  const claim = state.claims.find((c) => c.id === payload.claimId);
  if (!claim) return apiError('not_found', "Cette affirmation ne fait pas partie de cette analyse.");

  // The URL must be one the ARTICLE cited, as recorded at audit time. A URL a
  // client invents is refused here, before any fetch: this endpoint reads the
  // article's sources, it is not a fetch proxy.
  const source = state.citedSources.find((candidate) => candidate.href === payload.sourceUrl);
  if (!source) return apiError('not_found', "Ce lien ne fait pas partie des sources citées par l'article.");

  const already = state.sourceChecks.find((check) => check.claimId === claim.id && check.url === source.href);
  if (already) return { ok: true, check: already };

  const client = s.llm();
  let result;
  try {
    result = await verifyCitedSources({
      client,
      claims: [claim],
      // Pinned to the claim's block so the engine pairs this exact page with
      // this exact claim, whatever the article's own block attribution was.
      citedSources: [{ ...source, blockId: claim.blockId }],
      now: new Date(s.clock.now()),
      maxPages: 1,
      fetchTimeoutMs: SOURCE_FETCH_TIMEOUT_MS,
      fetchPage: serverPageFetcher(s),
    });
  } catch {
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
  user: UserRow,
  payload: { runId: string },
): Promise<Outcome<FinalizeResult>> {
  const loaded = await loadRun(s, user, payload.runId);
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
  if (sizeBytes <= REPORT_MAX_BYTES) {
    try {
      await s.db.createReport({
        urlHash,
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

  await s.db.recordAnalysis({ userId: user.id, reportId: urlHash, now });
  logEvent({ event: 'analysis_finalized', requestId: s.requestId, userId: user.id, urlHash });

  return { ok: true, report, cached };
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
