/**
 * The landing demo's data and the extension's severity logic, copied here so
 * the browser bundle stays independent of `src/`. Both halves must agree:
 * `severityToHighlightSeverity` mirrors
 * `src/adapters/findingAdapters.ts` and `SEVERITY_COLORS` mirrors
 * `src/content/shadowOverlay.ts`. Change them together.
 */

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

/** The extension's own highlight palette (`shadowOverlay.ts` theme). */
export const SEVERITY_COLORS: Record<HighlightSeverity, { color: string; tint: string }> = {
  critical: { color: '#dc2626', tint: 'rgba(239, 68, 68, 0.18)' },
  warning: { color: '#d97706', tint: 'rgba(245, 158, 11, 0.18)' },
  info: { color: '#2563eb', tint: 'rgba(59, 130, 246, 0.18)' },
  positive: { color: '#059669', tint: 'rgba(16, 185, 129, 0.18)' },
};

export function severityColor(severity: HighlightSeverity): { color: string; tint: string } {
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

export interface DemoExample {
  /** Display category, shown with the explanation once the highlight lands. */
  cat: string;
  before: string;
  mark: string;
  after: string;
  explain: string;
  severity: SeverityLevel;
  category: DemoCategory;
  verification?: DemoVerification;
}

export const DEMO_FINDINGS: DemoExample[] = [
  {
    cat: 'Robustesse factuelle',
    before: 'Selon ',
    mark: 'une étude',
    after: ', 78 % des Français seraient concernés.',
    explain: 'Étude non nommée : aucun institut, aucune méthodologie, le chiffre n’est pas vérifiable.',
    severity: 2,
    category: 'affirmation-non-etayee',
    verification: 'non-sourcee',
  },
  {
    cat: 'Solidité logique',
    before: 'Puisque les jeunes sont sur les réseaux, ',
    mark: 'ils ne lisent plus',
    after: '.',
    explain: 'Faux dilemme : l’un n’empêche pas l’autre.',
    severity: 3,
    category: 'sophisme',
    verification: 'douteuse',
  },
  {
    cat: 'Cadrage et rhétorique',
    before: 'La situation est ',
    mark: 'un désastre absolu',
    after: ', une hémorragie incontrôlée.',
    explain: 'Exagération : le lexique fait le travail des faits.',
    severity: 2,
    category: 'cadrage',
  },
  {
    cat: 'Déontologie',
    before: '',
    mark: 'Selon un expert',
    after: ', la mesure serait inévitable.',
    explain: 'Source anonyme : ni nom, ni conflit d’intérêts déclaré.',
    severity: 2,
    category: 'source-absente',
  },
  {
    cat: 'Soin de la langue',
    before: 'Les autorités ont ',
    mark: 'pris des décisions au niveau de la situation',
    after: '.',
    explain: 'Le flou de la langue trahit le flou du propos.',
    severity: 1,
    category: 'surinterpretation',
  },
];

export interface ResolvedExample extends DemoExample {
  sev: HighlightSeverity;
}

export const EXAMPLES: ResolvedExample[] = DEMO_FINDINGS.map((example) => ({
  ...example,
  sev: severityToHighlightSeverity(example.severity, example.category, example.verification),
}));

export function totalChars(example: DemoExample): number {
  return example.before.length + example.mark.length + example.after.length;
}