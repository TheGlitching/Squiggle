import { computeFourchesCaudinesScore } from './scoring';
import {
  AnalysisInput,
  AnalysisReport,
  EvidenceSource,
  FactualClaim,
  Finding,
  RawLlmAnalysisResponse,
  RawLlmAnalysisResponseSchema,
  ResearchRecord,
  TextBlock,
  WithdrawnObjection
} from './types';

/**
 * Clean and extract JSON string from raw model text (handles Markdown code fences and leading/trailing chatter)
 */
export function extractJsonFromResponse(rawText: string): string {
  let cleaned = rawText.trim();

  // Strip markdown code block if present
  const jsonBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
  const match = jsonBlockRegex.exec(cleaned);
  if (match && match[1]) {
    cleaned = match[1].trim();
  }

  // Find first { and last }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  return cleaned;
}

/**
 * Attempts to repair slightly malformed JSON (trailing commas, missing closing braces)
 */
export function repairJsonString(jsonStr: string): string {
  let res = jsonStr;
  // Remove trailing commas before } or ]
  res = res.replace(/,\s*([}\]])/g, '$1');

  // Balance unclosed quotes or brackets if incomplete
  const openBraces = (res.match(/{/g) || []).length;
  const closeBraces = (res.match(/}/g) || []).length;
  if (openBraces > closeBraces) {
    res += '}'.repeat(openBraces - closeBraces);
  }

  const openBrackets = (res.match(/\[/g) || []).length;
  const closeBrackets = (res.match(/\]/g) || []).length;
  if (openBrackets > closeBrackets) {
    res += ']'.repeat(openBrackets - closeBrackets);
  }

  return res;
}

/**
 * Normalizes and validates findings against article blocks (calculating character offsets)
 */
export function matchFindingsToBlocks(findings: Finding[], blocks: TextBlock[]): Finding[] {
  const blockMap: Record<string, TextBlock> = {};
  for (const block of blocks) {
    blockMap[block.id] = block;
  }

  return findings.map((finding) => {
    let targetBlock = blockMap[finding.blockId];
    const quote = (finding.quote || '').trim();

    // If blockId not found, try to locate quote in other blocks
    if (!targetBlock && quote.length > 5) {
      for (const b of blocks) {
        if (b.text.toLowerCase().includes(quote.toLowerCase())) {
          targetBlock = b;
          finding.blockId = b.id;
          break;
        }
      }
    }

    if (targetBlock && quote.length > 0) {
      const normalizedBlockText = targetBlock.text.toLowerCase();
      const normalizedQuote = quote.toLowerCase();
      const idx = normalizedBlockText.indexOf(normalizedQuote);

      if (idx !== -1) {
        finding.charStart = targetBlock.charStart + idx;
        finding.charEnd = finding.charStart + quote.length;
      }
    }

    return finding;
  });
}

/**
 * Categories that describe the world rather than the prose, so they carry a
 * verification state at all. `source-absente` belongs here too, even though
 * it is never externally researched (see `RESEARCHABLE_FINDING_CATEGORIES`
 * below): whether the article sourced a statement is a fact about the text
 * itself, settled once by `enforceEvidenceHonesty` against the article's own
 * citations, not something a web search could confirm or refute.
 *
 * `surinterpretation` is deliberately NOT here. It judges how far the article
 * over-reaches from its evidence ("L'été 2026 rime avec une France à sec"
 * drawn from a local report), which is a cadrage judgment about the prose's
 * scope, not a claim about the world. Asking whether the general statement
 * happens to be true elsewhere would answer a different question than whether
 * the article over-generalized - so it is treated like `cadrage`: editorial,
 * never researched, never withdrawn, always visible and always carrying its
 * full weight in the score.
 */
export const FACTUAL_FINDING_CATEGORIES: Record<string, true> = {
  'source-absente': true,
  'affirmation-non-etayee': true
};

/**
 * The subset of `FACTUAL_FINDING_CATEGORIES` whose truth value external
 * research can actually adjudicate. `source-absente` is deliberately absent:
 * it is a sourcing observation about the text, always resolved to
 * 'non-sourcee' by `enforceEvidenceHonesty` before research ever runs, and
 * researching whether the underlying fact happens to be true elsewhere would
 * silently overwrite that sourcing observation with a truth verdict that
 * answers a different question - exactly the confusion the four-state model
 * exists to end. Shared with research.ts, which uses it to pick out exactly
 * the findings worth researching after the audit runs.
 */
export const RESEARCHABLE_FINDING_CATEGORIES: Record<string, true> = {
  'affirmation-non-etayee': true
};

/**
 * Enforces in code what the prompt cannot guarantee: a factual finding that
 * claims the article is wrong ('douteuse') but carries no evidence is
 * downgraded to 'non-verifiable' rather than published as a doubt, and a
 * 'source-absente' finding is always classified 'non-sourcee' - a sourcing
 * observation, never an accusation that the statement is unsound. When the
 * block it targets does carry a citation, that citation is attached as
 * evidence for the reader, but the finding's own explanation is never made
 * to admit the citation was not looked at: a finding that undermines its own
 * publication that way must not be published in that form. Editorial
 * findings never carry a verification state, since they judge prose, not
 * the world.
 */
export function enforceEvidenceHonesty(
  findings: Finding[],
  articleSources: Record<string, EvidenceSource[]>
): Finding[] {
  return findings.map((finding) => {
    if (!FACTUAL_FINDING_CATEGORIES[finding.category]) {
      if (finding.verification === undefined) {
        return finding;
      }
      const { verification: _verification, ...rest } = finding;
      return rest as Finding;
    }

    if (finding.category === 'source-absente') {
      const cited = articleSources[finding.blockId];
      const articleSource: EvidenceSource | undefined =
        cited && cited.length > 0 ? { ...cited[0], origin: 'article' } : undefined;
      return {
        ...finding,
        verification: 'non-sourcee',
        sources: articleSource ? [...(finding.sources || []), articleSource] : finding.sources
      };
    }

    let next: Finding = { ...finding, verification: finding.verification ?? 'non-verifiable' };

    if (next.verification === 'douteuse' && (!next.sources || next.sources.length === 0)) {
      next = { ...next, verification: 'non-verifiable' };
    }

    return next;
  });
}

/**
 * Reconciles the audit's own factual findings against the evidence gathered
 * for them by `researchFindings`, per the verification-subject invariant: a
 * claim's `verification` always describes the ARTICLE's statement (the
 * finding's `quote`), never the audit's objection to it.
 *
 *  - evidence CONFIRMS the article ('verifiee') -> the audit's objection was
 *    unfounded. The finding is withdrawn from the returned list and recorded
 *    instead as a `WithdrawnObjection`, so a real disagreement is never
 *    silently erased.
 *  - evidence CASTS DOUBT on the article ('douteuse') -> the finding stands,
 *    carrying the claim's sources and `verification: 'douteuse'`.
 *  - nothing was actually read -> the finding stands as `verification:
 *    'non-verifiable'`, an unchecked reserve rather than an established
 *    fault.
 *
 * A finding with no matching claim (editorial categories, which are never
 * researched) passes through unchanged.
 */
export function reconcileResearchedFindings(
  findings: Finding[],
  claims: FactualClaim[]
): { findings: Finding[]; withdrawn: WithdrawnObjection[] } {
  const claimByFindingId = new Map(claims.map((claim) => [claim.findingId, claim]));
  const withdrawn: WithdrawnObjection[] = [];
  const kept: Finding[] = [];

  for (const finding of findings) {
    const claim = claimByFindingId.get(finding.id);
    if (!claim) {
      kept.push(finding);
      continue;
    }

    if (claim.verification === 'verifiee') {
      withdrawn.push({
        blockId: finding.blockId,
        quote: finding.quote,
        reason: `Le constat « ${finding.label} » mettait en doute cette affirmation, mais les sources consultées confirment ce que dit l'article.`,
        sources: claim.sources
      });
      continue;
    }

    if (claim.verification === 'douteuse') {
      kept.push({ ...finding, verification: 'douteuse', sources: claim.sources });
      continue;
    }

    kept.push({ ...finding, verification: 'non-verifiable', sources: claim.sources.length > 0 ? claim.sources : finding.sources });
  }

  return { findings: kept, withdrawn };
}


export interface ParseLlmOutputOptions {
  modelName?: string;
  durationMs?: number;
  /** Factual claims already researched upstream, used when the model response carries none of its own. */
  claims?: FactualClaim[];
  /** What the research stage actually did; defaults to "no research ran" so the report never implies more. */
  research?: ResearchRecord;
  /** The article's own hyperlinked sources, keyed by blockId, so 'source-absente' can be checked against reality. */
  articleSources?: Record<string, EvidenceSource[]>;
}


/**
 * Validates, repairs and constructs full AnalysisReport from raw LLM text output
 */
export function parseAndValidateLlmOutput(
  rawText: string,
  input: AnalysisInput,
  options: ParseLlmOutputOptions = {}
): AnalysisReport {
  const jsonStr = extractJsonFromResponse(rawText);
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(jsonStr);
  } catch {
    // Attempt repair
    const repaired = repairJsonString(jsonStr);
    try {
      parsedJson = JSON.parse(repaired);
    } catch (secondErr) {
      throw new Error(`Failed to parse LLM response as JSON: ${(secondErr as Error).message}\nRaw: ${rawText.slice(0, 300)}`);
    }
  }

  // Validate with Zod schema
  const validationResult = RawLlmAnalysisResponseSchema.safeParse(parsedJson);

  let rawData: RawLlmAnalysisResponse;
  if (!validationResult.success) {
    // Fallback attempt: if partial valid data exists
    if (typeof parsedJson === 'object' && parsedJson !== null) {
      const candidate = parsedJson as Record<string, unknown>;
      const scoresParsed = Array.isArray(candidate.scores) ? candidate.scores : [];
      const findingsParsed = Array.isArray(candidate.findings) ? candidate.findings : [];

      rawData = {
        summary: typeof candidate.summary === 'string' ? candidate.summary : 'Analyse effectuée avec réserves.',
        scores: scoresParsed as RawLlmAnalysisResponse['scores'],
        findings: findingsParsed as RawLlmAnalysisResponse['findings'],
        claims: []
      };
    } else {
      throw new Error(`Invalid Fourches Caudines LLM response structure: ${validationResult.error.message}`);
    }
  } else {
    rawData = validationResult.data;
  }

  // Anchor findings to text blocks, then downgrade any that assert more than they can back up
  const matchedFindings = enforceEvidenceHonesty(
    matchFindingsToBlocks(rawData.findings, input.blocks),
    options.articleSources || {}
  );

  const claims = rawData.claims.length > 0 ? rawData.claims : options.claims || [];
  const research: ResearchRecord = options.research || {
    performed: false,
    queries: [],
    skippedReason: "Aucune étape de recherche n'a été exécutée avant la validation de cette analyse.",
    withdrawn: []
  };

  // Compute composite score and normalized categories, enforcing the scoring
  // anchors against the findings actually published to the reader.
  const scoreResult = computeFourchesCaudinesScore(
    rawData.scores,
    matchedFindings
  );

  const report: AnalysisReport = {
    schemaVersion: 1,
    score: scoreResult.totalScore,
    scoreBand: scoreResult.scoreBand,
    summary: rawData.summary,
    categories: scoreResult.normalizedCategories,
    findings: matchedFindings,
    claims,
    research,
    meta: {
      model: options.modelName || 'llm-byok',
      promptVersion: '1.0.0-fourches-caudines',
      analyzedAt: new Date().toISOString(),
      durationMs: options.durationMs || 0,
      textLengthChars: input.blocks.reduce((acc, b) => acc + b.text.length, 0),
      blocksCount: input.blocks.length,
      // The model's raw per-domain marks, before any defect reduction. The
      // pipeline recomputes the composite score against the reconciled findings
      // (research may withdraw objectives), and can only do so from the
      // unreduced marks - a reduced category score cannot be un-reduced. This
      // field is engine plumbing, not reader-facing.
      rawScores: rawData.scores
    }
  };

  return report;
}
