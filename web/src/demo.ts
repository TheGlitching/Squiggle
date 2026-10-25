/**
 * The landing demo's data and the extension's severity logic, copied here so
 * the browser bundle stays independent of `src/`. Both halves must agree:
 * `severityToHighlightSeverity` mirrors
 * `src/adapters/findingAdapters.ts` and `SEVERITY_COLORS` mirrors
 * `src/content/shadowOverlay.ts`. Change them together.
 */
import { determineScoreBand } from '../../shared/src/engine/bands';

export type DemoCategory =
  | 'sophisme'
  | 'affirmation-non-etayee'
  | 'surinterpretation'
  | 'source-absente'
  | 'cadrage'
  | 'point-fort';

export type DemoVerification = 'verifiee' | 'non-sourcee' | 'douteuse' | 'non-verifiable';
export type SeverityLevel = 1 | 2 | 3;
export type HighlightSeverity = 'critical' | 'warning' | 'info' | 'positive';

/** The extension's own highlight palette (`shadowOverlay.ts` theme). `color` fills
 * the bar and dot; `text` is the brighter AA tone for the category label on the
 * dark panel (the darker fills only clear 3:1 as text: critical 3.96, info 3.70). */
export const SEVERITY_COLORS: Record<
  HighlightSeverity,
  { color: string; tint: string; text: string }
> = {
  critical: { color: '#dc2626', tint: 'rgba(239, 68, 68, 0.18)', text: '#f87171' },
  warning: { color: '#d97706', tint: 'rgba(245, 158, 11, 0.18)', text: '#fbbf24' },
  info: { color: '#2563eb', tint: 'rgba(59, 130, 246, 0.18)', text: '#60a5fa' },
  positive: { color: '#059669', tint: 'rgba(16, 185, 129, 0.18)', text: '#34d399' },
};

export function severityColor(severity: HighlightSeverity): {
  color: string;
  tint: string;
  text: string;
} {
  return SEVERITY_COLORS[severity];
}

/**
 * Mirror of the extension's `severityToHighlightSeverity`: a strength is always
 * positive, a non-sourced or verified finding is capped at info, and only a
 * `douteuse` severity-3 finding reaches critical.
 */
export function severityToHighlightSeverity(
  severity: SeverityLevel,
  category: DemoCategory,
  verification?: DemoVerification,
): HighlightSeverity {
  if (category === 'point-fort') return 'positive';
  if (verification === 'non-sourcee' || verification === 'verifiee') return 'info';
  switch (severity) {
    case 3:
      return verification === 'non-verifiable' ? 'warning' : 'critical';
    case 2:
      return 'warning';
    default:
      return 'info';
  }
}

/** Mirror of the panel's `findingTone` (`src/ui/components/FindingCard.tsx`): a
 * finding card is toned by its severity alone, so it can differ from the page
 * highlight, which `severityToHighlightSeverity` caps by verification. */
export function findingTone(severity: SeverityLevel, category: DemoCategory): HighlightSeverity {
  if (category === 'point-fort') return 'positive';
  return severity === 3 ? 'critical' : severity === 2 ? 'warning' : 'info';
}

/** Mirror of `CATEGORY_LABELS_FR` in `src/adapters/findingAdapters.ts`. */
export const CATEGORY_LABELS: Record<DemoCategory, string> = {
  sophisme: 'Sophisme',
  'affirmation-non-etayee': 'Affirmation non étayée',
  surinterpretation: 'Surinterprétation',
  'source-absente': 'Source absente',
  cadrage: 'Cadrage',
  'point-fort': 'Point fort',
};

/** Mirror of `src/ui/components/SeverityBadge.tsx`. */
export const SEVERITY_LABELS: Record<SeverityLevel, string> = { 3: 'Critique', 2: 'Majeur', 1: 'Mineur' };

export type ScoreBand = 'solide' | 'perfectible' | 'fragile' | 'problematique';

/** The engine's own thresholds, from the module that keeps them apart from its schema library. */
export const scoreBand: (score: number) => ScoreBand = determineScoreBand;

/** The band titles of `getScoreBandLabel`, and the severity tone the panel's
 * `getScoreBandColor` paints each band with. */
export const SCORE_BANDS: Record<ScoreBand, { title: string; tone: HighlightSeverity }> = {
  solide: { title: 'Article solide', tone: 'positive' },
  perfectible: { title: 'Article perfectible', tone: 'info' },
  fragile: { title: 'Article fragile', tone: 'warning' },
  problematique: { title: 'Article problématique', tone: 'critical' },
};

/** The five domains of the grid. A test pins these to the engine's own definitions. */
export const DOMAINS = [
  ['Robustesse factuelle et sourcing', 35, 'Les chiffres, les dates et les citations sont-ils précis, sourcés, vérifiables\u00a0?'],
  ['Solidité logique et argumentative', 25, 'Les conclusions découlent-elles des faits, ou d’un saut de raisonnement\u00a0?'],
  ['Cadrage et procédés rhétoriques', 25, 'Le titre, les mots choisis et la mise en scène orientent-ils le jugement sans preuve\u00a0?'],
  ['Déontologie et transparence', 10, 'Les sources sont-elles nommées, les intérêts signalés, le fait distingué du commentaire\u00a0?'],
  ['Soin de la langue', 5, 'Orthographe et grammaire, comme indice de rigueur.'],
] as const;

export interface DemoExample {
  /** The domain the finding scores in, as a reader would name it. */
  cat: string;
  before: string;
  mark: string;
  after: string;
  /** The finding card's title and body, as the hero shows them. */
  label: string;
  detail: string;
  severity: SeverityLevel;
  category: DemoCategory;
  verification?: DemoVerification;
}

/**
 * Each example is a finding the engine can produce as shown: its category scores
 * in the domain named by `cat`, a sophism or a framing remark carries no
 * verification state, a missing source is always "non sourcée", and only an
 * unsupported claim is looked up, here to be put in doubt by what the sources
 * say. `demo.test.ts` checks all of it against the engine.
 */
export const DEMO_FINDINGS: DemoExample[] = [
  {
    cat: 'Robustesse factuelle',
    before: 'Selon ',
    mark: 'une étude',
    after: ', 78\u00a0% des Français seraient concernés.',
    label: 'Étude non nommée',
    detail: 'Aucun institut, aucune date, aucune méthodologie : le chiffre est présenté comme établi, mais le lecteur ne peut pas le retrouver.',
    severity: 2,
    category: 'source-absente',
    verification: 'non-sourcee',
  },
  {
    cat: 'Solidité logique',
    before: 'Puisque les jeunes sont sur les réseaux, ',
    mark: 'ils ne lisent plus',
    after: '.',
    label: 'Faux dilemme',
    detail: 'Être sur les réseaux n’empêche pas de lire : l’article oppose deux pratiques que rien ne rend exclusives.',
    severity: 2,
    category: 'sophisme',
  },
  {
    cat: 'Cadrage et rhétorique',
    before: 'La situation est ',
    mark: 'un désastre absolu',
    after: ', une hémorragie incontrôlée.',
    label: 'Exagération',
    detail: 'Le lexique fait le travail des faits : aucun chiffre ne vient mesurer ce « désastre ».',
    severity: 2,
    category: 'cadrage',
  },
  {
    cat: 'Robustesse factuelle',
    before: '',
    mark: 'Neuf adolescents sur dix n’ouvrent plus un livre',
    after: ' en dehors des cours.',
    label: 'Chiffre mis en doute',
    detail: 'Les enquêtes consultées mesurent un recul, mais la plupart des adolescents lisent encore pour leur plaisir : rien n’y appuie «\u00a0neuf sur dix\u00a0».',
    severity: 2,
    category: 'affirmation-non-etayee',
    verification: 'douteuse',
  },
  {
    cat: 'Cadrage et rhétorique',
    before: '',
    mark: 'Selon un expert',
    after: ', le mouvement serait irréversible.',
    label: 'Autorité non nommée',
    detail: 'Ni nom, ni fonction, ni conflit d’intérêts déclaré : impossible de savoir qui parle, ni à quel titre.',
    severity: 1,
    category: 'cadrage',
  },
];

export interface ResolvedExample extends DemoExample {
  sev: HighlightSeverity;
}

export const EXAMPLES: ResolvedExample[] = DEMO_FINDINGS.map((example) => ({
  ...example,
  sev: severityToHighlightSeverity(example.severity, example.category, example.verification),
}));

/**
 * The four states a factual assertion can land in, as the landing explains them.
 * The labels and the tone mirror `src/ui/components/VerificationBadge.tsx`; a
 * test reads that file so the two cannot drift apart unnoticed.
 */
export const VERIFICATION_STATES: Array<{
  state: DemoVerification;
  label: string;
  hint: string;
  chip: string;
}> = [
  {
    state: 'verifiee',
    label: 'Vérifiée',
    hint: 'Les sources consultées confirment ce point de l’article.',
    chip: 'border-[#059669]/50 bg-[#059669]/15 text-[#34d399]',
  },
  {
    state: 'non-sourcee',
    label: 'Non sourcée dans l’article',
    hint: 'Vérifiable, mais l’article ne cite rien à l’appui : une remarque sur son sourcing, pas un doute sur son exactitude.',
    chip: 'border-border bg-[#121215] text-muted',
  },
  {
    state: 'douteuse',
    label: 'Douteuse',
    hint: 'Les sources consultées mettent ce point en doute.',
    chip: 'border-[#dc2626]/50 bg-[#dc2626]/15 text-[#f87171]',
  },
  {
    state: 'non-verifiable',
    label: 'Non vérifiable telle qu’écrite',
    hint: 'Telle qu’elle est formulée, l’affirmation ne peut pas être confrontée à des sources : elle n’est ni établie ni contredite.',
    chip: 'border-dashed border-[#d97706]/50 bg-surface text-[#fbbf24]',
  },
];

/**
 * The sample article and report the hero shows. A paragraph mixes plain text
 * with indexes into `EXAMPLES`, each rendered as its sentence with the passage
 * highlighted, so the page and the panel describe the same five findings.
 */
export const HERO_ARTICLE: { title: string; byline: string; paragraphs: Array<Array<string | number>> } = {
  title: 'Lecture\u00a0: une génération perdue\u00a0?',
  byline: 'Tribune',
  paragraphs: [
    ['La lecture recule chez les adolescents, et le constat inquiète. ', 0, ' ', 1],
    [2, ' ', 3, ' ', 4],
    [
      'Dans les médiathèques, pourtant, bibliothécaires et enseignants décrivent des lecteurs qui ont changé de supports plus que de goûts. Les mangas, les romans publiés en ligne et les clubs de lecture attirent des adolescents que les listes scolaires ne retiennent plus.',
    ],
  ],
};

export const HERO_REPORT = {
  /** Marks per domain, in the grid's order; they sum to the score. Each stays
   * under what the engine leaves of its domain once the findings above are
   * counted, which `demo.test.ts` computes with the engine's own scoring. */
  marks: [20, 15.5, 13, 8, 4.5],
  summary:
    'L’article part d’un vrai sujet, mais son chiffre central ne renvoie à aucune étude identifiable et les sources mettent en doute l’ampleur du recul annoncé. La fin, plus nuancée, redresse en partie l’ensemble.',
  research: '1 affirmation sur 1 confrontée à une source, 3 recherches menées.',
  claims: '1 douteuse',
  /** The finding selected before the reader picks one: the claim the sources put in doubt. */
  selected: 3,
};

/** The panel prints marks the French way: `6,5`, not `6.5`. */
export function formatPoints(value: number): string {
  return value.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
}
