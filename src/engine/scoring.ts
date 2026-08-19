import {
  CategoryScore,
  Finding,
  FindingCategory,
  SCORE_DOMAINS,
  ScoreBand,
  ScoreDomainKey,
  SeverityLevel,
  VerificationState
} from './types';

export interface ScoreComputationResult {
  totalScore: number;
  scoreBand: ScoreBand;
  normalizedCategories: CategoryScore[];
  warnings: string[];
}

/**
 * Which domain a finding's category speaks to. `point-fort` is a strength, not
 * a defect, and never costs anything.
 */
const CATEGORY_TO_DOMAIN: Partial<Record<FindingCategory, ScoreDomainKey>> = {
  sophisme: 'solidite_logique',
  'affirmation-non-etayee': 'robustesse_factuelle',
  'source-absente': 'robustesse_factuelle',
  surinterpretation: 'cadrage_manipulation',
  cadrage: 'cadrage_manipulation'
};

/**
 * The share of a domain's standing marks that one defect removes, by severity.
 *
 * These are rates, deliberately not ceilings. Each defect removes a proportion
 * of what is still standing, so several defects compound smoothly and a badly
 * sourced article approaches zero on its own rather than being clamped at some
 * chosen floor. A cap would also invite the opposite failure: an article just
 * under the limit would be scored as generously as a clean one.
 */
const SEVERITY_COST: Record<SeverityLevel, number> = { 1: 0.15, 2: 0.35, 3: 0.6 };

type ScoredFinding = Pick<Finding, 'category' | 'severity'> & {
  verification?: VerificationState;
};

/**
 * How much a defect counts once the evidence has spoken.
 *
 * A defect the research proved, and an editorial one visible in the text
 * without needing any source, both count in full. A suspicion nothing could
 * confirm still counts, because a reader deserves to see doubt reflected in the
 * mark, but it cannot weigh as much as a proven fault.
 */
function evidenceWeight(finding: ScoredFinding): number {
  return finding.verification === 'unverified' ? 0.6 : 1;
}

/**
 * Calculates the 100-point composite score, coupling each domain's mark to the
 * defects the audit itself reported in that domain.
 *
 * A model asked for a mark and a list of defects will happily supply both and
 * let them disagree: it described a fabricated poll accurately in its weakness
 * note for factual robustness and still scored that domain at 9.5/20. The mark
 * is therefore not taken at face value. Every defect the audit raised removes a
 * share of the marks it just awarded in that domain, so the number it publishes
 * and the faults it found can no longer contradict each other.
 *
 * Evidence can only ever pull a mark down. Nothing here raises one, because a
 * reader has no use for a score that flatters an article the audit criticised.
 */
export function computeFourchesCaudinesScore(
  rawScores: Array<{ domain: ScoreDomainKey; score: number; strengths?: string[]; weaknesses?: string[] }>,
  findings: ScoredFinding[] = []
): ScoreComputationResult {
  const warnings: string[] = [];
  const normalizedCategories: CategoryScore[] = [];

  const scoreRecord: Partial<Record<ScoreDomainKey, number>> = {};
  const strengthsRecord: Partial<Record<ScoreDomainKey, string[]>> = {};
  const weaknessesRecord: Partial<Record<ScoreDomainKey, string[]>> = {};

  for (const item of rawScores) {
    scoreRecord[item.domain] = item.score;
    if (item.strengths) strengthsRecord[item.domain] = item.strengths;
    if (item.weaknesses) weaknessesRecord[item.domain] = item.weaknesses;
  }

  // What the audit still stands behind, grouped by the domain it speaks to.
  const retained: Partial<Record<ScoreDomainKey, number>> = {};
  for (const finding of findings) {
    if (finding.category === 'point-fort') continue;
    const domain = CATEGORY_TO_DOMAIN[finding.category];
    if (!domain) continue;
    const cost = SEVERITY_COST[finding.severity] * evidenceWeight(finding);
    retained[domain] = (retained[domain] ?? 1) * (1 - cost);
  }

  let totalScore = 0;

  for (const [key, def] of Object.entries(SCORE_DOMAINS) as Array<[ScoreDomainKey, typeof SCORE_DOMAINS[ScoreDomainKey]]>) {
    let score = scoreRecord[key];

    if (score === undefined) {
      warnings.push(`Missing score for domain ${key}, defaulting to 70% of max (${(def.weight * 0.7).toFixed(1)})`);
      score = def.weight * 0.7;
    }

    const awarded = Math.max(0, Math.min(def.weight, score));
    const finalScore = Math.round(awarded * (retained[key] ?? 1) * 10) / 10;

    totalScore += finalScore;

    normalizedCategories.push({
      domain: key,
      label: def.label,
      score: finalScore,
      maxScore: def.weight,
      strengths: strengthsRecord[key] || [],
      weaknesses: weaknessesRecord[key] || []
    });
  }

  totalScore = Math.max(0, Math.min(100, Math.round(totalScore)));

  return {
    totalScore,
    scoreBand: determineScoreBand(totalScore),
    normalizedCategories,
    warnings
  };
}

/**
 * Maps 0-100 score to Fourches Caudines score band
 */
export function determineScoreBand(score: number): ScoreBand {
  if (score >= 80) return 'solide';
  if (score >= 70) return 'perfectible';
  if (score >= 60) return 'fragile';
  return 'problematique';
}

/**
 * Explains a score band in reader-friendly French
 */
export function getScoreBandLabel(band: ScoreBand): { title: string; description: string } {
  switch (band) {
    case 'solide':
      return {
        title: 'Article solide',
        description: 'Argumentation robuste, faits vérifiables et cadrage équilibré.'
      };
    case 'perfectible':
      return {
        title: 'Article perfectible',
        description: 'Propos globalement cohérent mais comportant des nuances ou sources à consolider.'
      };
    case 'fragile':
      return {
        title: 'Article fragile',
        description: 'Faiblesses logiques, affirmations peu étayées ou angle réducteur.'
      };
    case 'problematique':
      return {
        title: 'Article problématique',
        description: 'Multiples failles de raisonnement, données non vérifiables ou cadrage trompeur.'
      };
  }
}
