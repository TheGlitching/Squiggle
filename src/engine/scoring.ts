import {
  CategoryScore,
  SCORE_DOMAINS,
  ScoreBand,
  ScoreDomainKey
} from './types';

export interface ScoreComputationResult {
  totalScore: number;
  scoreBand: ScoreBand;
  normalizedCategories: CategoryScore[];
  warnings: string[];
}

/**
 * Calculates the 100-point composite score according to the Fourches Caudines grid
 */
export function computeFourchesCaudinesScore(
  rawScores: Array<{ domain: ScoreDomainKey; score: number; strengths?: string[]; weaknesses?: string[] }>
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

  let totalScore = 0;

  // Process each of the 10 standard domains
  for (const [key, def] of Object.entries(SCORE_DOMAINS) as Array<[ScoreDomainKey, typeof SCORE_DOMAINS[ScoreDomainKey]]>) {
    let score = scoreRecord[key];

    if (score === undefined) {
      warnings.push(`Missing score for domain ${key}, defaulting to 70% of max (${(def.weight * 0.7).toFixed(1)})`);
      score = def.weight * 0.7;
    }

    // Clamp score between 0 and max weight
    const clampedScore = Math.max(0, Math.min(def.weight, Math.round(score * 10) / 10));
    totalScore += clampedScore;

    normalizedCategories.push({
      domain: key,
      label: def.label,
      score: clampedScore,
      maxScore: def.weight,
      strengths: strengthsRecord[key] || [],
      weaknesses: weaknessesRecord[key] || []
    });
  }

  // Round total score to integer 0-100
  totalScore = Math.max(0, Math.min(100, Math.round(totalScore)));

  // Determine score band
  const scoreBand = determineScoreBand(totalScore);

  return {
    totalScore,
    scoreBand,
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
