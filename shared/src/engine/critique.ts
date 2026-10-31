/**
 * The critique: one more call, right after the audit, that keeps, recalibrates
 * or withdraws each of its findings before anything is researched or shown.
 *
 * The audit is the only judgement in the run: research can only settle an
 * `affirmation-non-etayee`, so a wrong `cadrage`, `sophisme` or `source-absente`
 * otherwise reaches the reader as written. A second reading of the findings
 * against the text catches what the audit's relevance rules still let through.
 *
 * It can only make the report better or leave it as it was: a call that fails
 * or answers something unreadable returns the audit untouched, and a finding it
 * adds is published only if its quote is found in the text.
 */
import { BaseLLMClient } from '../client/base';
import { CRITIQUE_SYSTEM_PROMPT, buildCritiqueUserPrompt } from './prompts';
import { computeFourchesCaudinesScore } from './scoring';
import { AnalysisInput, AnalysisReport, EvidenceSource, Finding, FindingSchema } from './types';
import { enforceEvidenceHonesty, extractJsonFromResponse, matchFindingsToBlocks } from './validator';
import { isShortMessage } from './message';

/** Output ceiling of the critique, reasoning included: a verdict per finding is a short JSON list. */
export const CRITIQUE_MAX_OUTPUT_TOKENS = 8000;

interface CritiqueDecision {
  n?: unknown;
  action?: unknown;
  severity?: unknown;
}

/**
 * Whether this report gets a critique. A short message is read under its own
 * questions, whose signs of caution (an anonymous source, a call to forward)
 * are exactly what the article rules would withdraw. A report without a single
 * negative finding has nothing to withdraw.
 */
export function needsCritique(input: Pick<AnalysisInput, 'url' | 'blocks'>, report: Pick<AnalysisReport, 'findings'>): boolean {
  return !isShortMessage(input) && report.findings.some((f) => f.category !== 'point-fort');
}

/** Applies the critique's answer to the audit's findings. Null when the answer is unreadable. */
export function applyCritique(
  raw: string,
  findings: Finding[],
  input: AnalysisInput,
  articleSources: Record<string, EvidenceSource[]> = {}
): Finding[] | null {
  let parsed: { decisions?: unknown; ajouts?: unknown };
  try {
    parsed = JSON.parse(extractJsonFromResponse(raw));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.decisions)) return null;

  const byN = new Map<number, CritiqueDecision>();
  for (const d of parsed.decisions as CritiqueDecision[]) {
    if (d && typeof d.n === 'number') byN.set(d.n, d);
  }

  const kept = findings.flatMap((finding, i): Finding[] => {
    const decision = byN.get(i + 1);
    if (!decision || finding.category === 'point-fort') return [finding];
    if (decision.action === 'retirer') return [];
    if (decision.action === 'ajuster' && (decision.severity === 1 || decision.severity === 2 || decision.severity === 3)) {
      return [{ ...finding, severity: decision.severity }];
    }
    return [finding];
  });

  const candidates = (Array.isArray(parsed.ajouts) ? parsed.ajouts : []).flatMap((a): Finding[] => {
    const p = FindingSchema.safeParse({ ...(a as object), confidence: 0.8 });
    return p.success && p.data.category !== 'point-fort' ? [p.data] : [];
  });
  // An added finding is the critique's own words about the text: one whose
  // quote is not in the text is not published.
  const added = enforceEvidenceHonesty(
    matchFindingsToBlocks(candidates, input.blocks).filter((f) => typeof f.charStart === 'number'),
    articleSources
  );

  return [...kept, ...added];
}

/**
 * Runs the critique over an audited report and returns the report the reader
 * should get: findings kept, recalibrated, withdrawn or added, and the score
 * recomputed from the model's raw marks against them.
 */
export async function critiqueReport(params: {
  client: BaseLLMClient;
  input: AnalysisInput;
  report: AnalysisReport;
  citedSources?: ReadonlyArray<{ href: string; text: string; blockId?: string }>;
  articleSources?: Record<string, EvidenceSource[]>;
  abortSignal?: AbortSignal;
}): Promise<AnalysisReport> {
  const { client, input, report } = params;
  if (!needsCritique(input, report)) return report;

  let content: string;
  try {
    const response = await client.complete({
      systemPrompt: CRITIQUE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildCritiqueUserPrompt(input, report.findings, params.citedSources) }],
      temperature: 0.1,
      maxTokens: CRITIQUE_MAX_OUTPUT_TOKENS,
      abortSignal: params.abortSignal,
    });
    content = response.content;
  } catch (err) {
    // A reader who cancelled stops here; any other failure leaves the audit as it was.
    if (params.abortSignal?.aborted) throw err;
    return report;
  }

  const findings = applyCritique(content, report.findings, input, params.articleSources);
  if (!findings) return report;

  const score = computeFourchesCaudinesScore(report.meta.rawScores ?? [], findings);
  return {
    ...report,
    findings,
    score: score.totalScore,
    scoreBand: score.scoreBand,
    categories: score.normalizedCategories,
  };
}
