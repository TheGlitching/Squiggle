/**
 * The example a reader can open without an account: the landing's sample
 * article and a full report on it, written in advance. Nothing here calls the
 * server or spends an analysis. The report is built from the same findings as
 * the hero (`demo.ts`), and `example.test.ts` holds it to what the engine
 * would produce: the score its findings allow, the band of that score, a
 * strength above 50, each quote found in the text.
 */
import { SCORE_DOMAINS, type AnalysisReport, type Finding, type ScoreDomainKey } from '../../shared/src/engine/types';
import { EXAMPLES, HERO_ARTICLE, HERO_REPORT, scoreBand } from './demo';
import { blocksFromPaste, type PastedArticle } from './paste';

/** A paragraph of the sample article, as plain text. */
function paragraphText(parts: Array<string | number>): string {
  return parts
    .map((part) => (typeof part === 'number' ? `${EXAMPLES[part].before}${EXAMPLES[part].mark}${EXAMPLES[part].after}` : part))
    .join('');
}

export const EXAMPLE_ARTICLE: PastedArticle = {
  title: HERO_ARTICLE.title.replace(/ /g, ' '),
  source: '',
  text: HERO_ARTICLE.paragraphs.map(paragraphText).join('\n\n'),
};

export const EXAMPLE_BLOCKS = blocksFromPaste(EXAMPLE_ARTICLE);

/** The sources the doubted claim was checked against. */
const SOURCES = [
  {
    title: 'Les jeunes Français et la lecture (Centre national du livre, 2026)',
    url: 'https://centrenationaldulivre.fr/sites/default/files/2026-04/%C3%89tude%202026%20-%20Les%20jeunes%20Fran%C3%A7ais%20et%20la%20lecture%20-%20Communiqu%C3%A9%20de%20presse.pdf',
    origin: 'search' as const,
  },
  {
    title: 'La lecture en perte de vitesse chez les jeunes (ministère de la Culture)',
    url: 'https://www.culture.gouv.fr/actualites/La-lecture-en-perte-de-vitesse-chez-les-jeunes',
    origin: 'search' as const,
  },
];

const DOMAIN_KEYS = Object.keys(SCORE_DOMAINS) as ScoreDomainKey[];

function blockOf(quote: string): string {
  return EXAMPLE_BLOCKS.find((block) => block.text.includes(quote))?.id ?? EXAMPLE_BLOCKS[0].id;
}

const FINDINGS: Finding[] = EXAMPLES.map((example, index) => ({
  id: `exemple-${index + 1}`,
  blockId: blockOf(example.mark),
  quote: example.mark,
  category: example.category,
  severity: example.severity,
  label: example.label,
  explanation: example.detail,
  confidence: 0.8,
  ...(example.verification ? { verification: example.verification } : {}),
  ...(example.verification === 'douteuse' ? { sources: SOURCES } : {}),
}));

const SCORE = HERO_REPORT.marks.reduce((sum, mark) => sum + mark, 0);
const DOUBTED = FINDINGS.find((finding) => finding.verification === 'douteuse');

export const EXAMPLE_REPORT: AnalysisReport = {
  schemaVersion: 1,
  score: SCORE,
  scoreBand: scoreBand(SCORE),
  summary: HERO_REPORT.summary,
  categories: DOMAIN_KEYS.map((domain, index) => ({
    domain,
    label: SCORE_DOMAINS[domain].label,
    score: HERO_REPORT.marks[index],
    maxScore: SCORE_DOMAINS[domain].weight,
    strengths: [],
    weaknesses: [],
  })),
  findings: FINDINGS,
  claims: DOUBTED
    ? [
        {
          id: 'affirmation-1',
          findingId: DOUBTED.id,
          blockId: DOUBTED.blockId,
          quote: DOUBTED.quote,
          claim: 'Neuf adolescents sur dix ne lisent plus de livre en dehors des cours.',
          verification: 'douteuse',
          sources: SOURCES,
        },
      ]
    : [],
  research: {
    performed: true,
    queries: [
      'part des adolescents qui lisent pour le plaisir',
      'enquête Centre national du livre jeunes lecture',
      'lecture loisir adolescents recul',
    ],
    withdrawn: [],
  },
  meta: {
    model: 'exemple',
    promptVersion: '1.0.0',
    analyzedAt: '2026-10-25T00:00:00.000Z',
    durationMs: 0,
    textLengthChars: EXAMPLE_ARTICLE.text.length,
    blocksCount: EXAMPLE_BLOCKS.length,
  },
};
