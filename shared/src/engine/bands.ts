/**
 * The four score bands and how they read. Apart from the scoring arithmetic
 * and with no runtime import, so the web app can name a band without pulling
 * the engine's validation schemas into its bundle. `scoring.ts` re-exports it.
 */
import type { ScoreBand } from './types';

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
 * Explains a score band in reader-friendly French. The title names what was
 * judged: a video's transcript is not an article. Every band's adjective is
 * the same in either gender, so only the noun changes.
 */
export function getScoreBandLabel(
  band: ScoreBand,
  subject: 'article' | 'video' = 'article'
): { title: string; description: string } {
  const noun = subject === 'video' ? 'Vidéo' : 'Article';
  switch (band) {
    case 'solide':
      return {
        title: `${noun} solide`,
        description: 'Argumentation robuste, faits vérifiables et cadrage équilibré.'
      };
    case 'perfectible':
      return {
        title: `${noun} perfectible`,
        description: 'Propos globalement cohérent mais comportant des nuances ou sources à consolider.'
      };
    case 'fragile':
      return {
        title: `${noun} fragile`,
        description: 'Faiblesses logiques, affirmations peu étayées ou angle réducteur.'
      };
    case 'problematique':
      return {
        title: `${noun} problématique`,
        description: 'Multiples failles de raisonnement, données non vérifiables ou cadrage trompeur.'
      };
  }
}
