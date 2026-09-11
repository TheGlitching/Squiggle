/**
 * What a five-call analysis carries between its stages.
 *
 * Written only by the server (see migration 003). The one thing deliberately
 * absent is the article's text: the audit call is the only stage that needs
 * it, and it is dropped when that request ends. Everything here is either the
 * audit's own output — whose quotes the engine already caps at 25 words — or
 * links the article itself published.
 */
import type {
  AnalysisReport,
  CitedSource,
  FactualClaim,
  Finding,
  ScoreDomainKey,
  SourceCheck,
} from '@squiggle/shared';

export interface AnalysisRunState {
  /** Canonical URL of the article (already normalised; the cache key's preimage). */
  url: string;
  title: string;
  author?: string;
  outlet?: string;
  /** The extension could only read part of the page. Carried into the report. */
  partialAccess: boolean;
  /** `provider/model` that ran the audit; also part of the cache key. */
  model: string;
  promptVersion: string;
  /** Wall time of the audit call, reported in the finished report's meta. */
  auditDurationMs: number;
  /** When the run was reserved, before the audit call was made. */
  startedAt: number;
  textLengthChars: number;
  blocksCount: number;

  /** The audit's output, before research had a chance to withdraw anything. */
  summary: string;
  findings: Finding[];
  rawScores: Array<{ domain: ScoreDomainKey; score: number }>;

  /** The links the article offers as its own backing. */
  citedSources: CitedSource[];

  /** Accumulated by the research stage, one call at a time. */
  claims: FactualClaim[];
  /** Accumulated by the source-check stage, one page at a time. */
  sourceChecks: SourceCheck[];
  /** Search queries actually issued, for the report's research record. */
  queries: string[];
  /** Whether any research call actually ran (the report must never imply more). */
  researchPerformed: boolean;
  researchProvider?: string;
}

/** The audit report as it is handed back to the client, before research. */
export type AuditSnapshot = Pick<AnalysisReport, 'summary' | 'categories' | 'findings' | 'score' | 'scoreBand'>;

export function serializeRunState(state: AnalysisRunState): string {
  return JSON.stringify(state);
}

export function parseRunState(raw: string): AnalysisRunState {
  return JSON.parse(raw) as AnalysisRunState;
}
