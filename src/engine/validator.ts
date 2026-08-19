import { computeFourchesCaudinesScore } from './scoring';
import {
  AnalysisInput,
  AnalysisReport,
  Finding,
  RawLlmAnalysisResponse,
  RawLlmAnalysisResponseSchema,
  TextBlock
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

export interface ParseLlmOutputOptions {
  modelName?: string;
  durationMs?: number;
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
        verdict: 'reviser_avant_publication',
        summary: typeof candidate.summary === 'string' ? candidate.summary : 'Analyse effectuée avec réserves.',
        scores: scoresParsed as RawLlmAnalysisResponse['scores'],
        findings: findingsParsed as RawLlmAnalysisResponse['findings'],
        editorialAxes: {
          constructif: true,
          accrocheur: true,
          iconoclaste: false,
          narratif: true,
          accessible: true,
          ethique: true
        },
        revisionPlan: {
          priority1_blocking: [],
          priority2_major: [],
          priority3_editorial_optimizations: []
        }
      };
    } else {
      throw new Error(`Invalid Fourches Caudines LLM response structure: ${validationResult.error.message}`);
    }
  } else {
    rawData = validationResult.data;
  }

  // Anchor and match findings to text blocks
  const matchedFindings = matchFindingsToBlocks(rawData.findings, input.blocks);

  // Compute composite score and normalized categories
  const scoreResult = computeFourchesCaudinesScore(
    rawData.scores,
    matchedFindings,
    rawData.revisionPlan
  );

  const report: AnalysisReport = {
    schemaVersion: 1,
    score: scoreResult.totalScore,
    scoreBand: scoreResult.scoreBand,
    verdict: scoreResult.verdict,
    summary: rawData.summary,
    categories: scoreResult.normalizedCategories,
    findings: matchedFindings,
    editorialAxes: rawData.editorialAxes,
    revisionPlan: rawData.revisionPlan,
    editorialOptimizations: rawData.editorialOptimizations,
    meta: {
      model: options.modelName || 'llm-byok',
      promptVersion: '1.0.0-fourches-caudines',
      analyzedAt: new Date().toISOString(),
      durationMs: options.durationMs || 0,
      textLengthChars: input.blocks.reduce((acc, b) => acc + b.text.length, 0),
      blocksCount: input.blocks.length
    }
  };

  return report;
}
