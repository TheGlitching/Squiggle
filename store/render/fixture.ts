/**
 * The report the store screenshots show: the site's own example article
 * (`web/src/demo.ts`), as the engine would hand it to the panel. Built from the
 * demo rather than typed again, so the listing and squiggle.fr describe the
 * same reading of the same article.
 */
import { SCORE_DOMAINS, type AnalysisResult, type Finding, type ScoreDomainKey } from '@squiggle/shared';
import { determineScoreBand } from '../../shared/src/engine/bands';
import { DEMO_FINDINGS, HERO_ARTICLE, HERO_REPORT } from '../../web/src/demo';

/** The article's paragraphs as plain text, each finding's sentence in place. */
export const ARTICLE_PARAGRAPHS: string[] = HERO_ARTICLE.paragraphs.map((parts) =>
  parts
    .map((part) => {
      if (typeof part === 'string') return part;
      const f = DEMO_FINDINGS[part];
      return `${f.before}${f.mark}${f.after}`;
    })
    .join(''),
);

export const ARTICLE_TITLE = HERO_ARTICLE.title;

/** The one source the research stage read for the figure it put in doubt. */
const CNL = {
  title: 'Les jeunes Français et la lecture - Centre national du livre',
  url: 'https://centrenationaldulivre.fr/',
  quote: 'La lecture recule chez les jeunes, mais une majorité dit encore lire pour son plaisir.',
  origin: 'search' as const,
};

export const FINDINGS: Finding[] = DEMO_FINDINGS.map((f, i) => ({
  id: `f${i + 1}`,
  blockId: '',
  quote: f.mark,
  category: f.category,
  severity: f.severity,
  label: f.label,
  explanation: f.detail,
  confidence: 0.9,
  ...(f.verification ? { verification: f.verification } : {}),
  sources: f.verification === 'douteuse' ? [CNL] : [],
}));

const DOMAIN_NOTES: Record<ScoreDomainKey, { strengths: string[]; weaknesses: string[] }> = {
  robustesse_factuelle: {
    strengths: ['Le sujet repose sur un recul réel, documenté ailleurs.'],
    weaknesses: ['Une étude citée sans institut ni date.', 'Un chiffre que les sources ne confirment pas.'],
  },
  solidite_logique: {
    strengths: ['La conclusion est nuancée par des témoins de terrain.'],
    weaknesses: ['Un faux dilemme entre réseaux et lecture.'],
  },
  cadrage_manipulation: {
    strengths: [],
    weaknesses: ['Un lexique qui dramatise sans mesurer.', 'Un expert invoqué sans être nommé.'],
  },
  deontologie: { strengths: ['Le texte est présenté comme une tribune.'], weaknesses: [] },
  orthographe_grammaire: { strengths: ['Langue claire et correcte.'], weaknesses: [] },
};

const DOMAIN_KEYS = Object.keys(SCORE_DOMAINS) as ScoreDomainKey[];
const SCORE = HERO_REPORT.marks.reduce((sum, mark) => sum + mark, 0);

export const REPORT: AnalysisResult = {
  schemaVersion: 1,
  score: SCORE,
  scoreBand: determineScoreBand(SCORE),
  summary: HERO_REPORT.summary,
  categories: DOMAIN_KEYS.map((domain, i) => ({
    domain,
    label: SCORE_DOMAINS[domain].label,
    score: HERO_REPORT.marks[i],
    maxScore: SCORE_DOMAINS[domain].weight,
    ...DOMAIN_NOTES[domain],
  })),
  findings: FINDINGS,
  claims: [
    {
      id: 'c1',
      findingId: 'f4',
      blockId: '',
      quote: DEMO_FINDINGS[3].mark,
      claim: 'Neuf adolescents sur dix ne lisent plus de livre en dehors des cours.',
      verification: 'douteuse',
      sources: [CNL],
      rationale: DEMO_FINDINGS[3].detail,
    },
  ],
  research: {
    performed: true,
    queries: ['adolescents lecture loisir enquête', 'Centre national du livre jeunes lecture', 'part des jeunes qui lisent'],
    withdrawn: [],
  },
  // No model name: the listing never names one, and an empty model is what
  // makes the panel's footer say "Analyse assistée par IA".
  meta: { model: '', promptVersion: 'store', analyzedAt: '2026-10-26T09:00:00.000Z', durationMs: 74_000 },
};
