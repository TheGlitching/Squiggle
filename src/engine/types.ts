import { z } from 'zod';

/**
 * Text block extracted from article
 */
export interface TextBlock {
  id: string;
  type: 'heading' | 'paragraph' | 'quote' | 'caption' | 'list-item';
  text: string;
  charStart: number;
}

/**
 * Input sent to the Fourches Caudines engine
 */
export interface AnalysisInput {
  url: string;
  title: string;
  author?: string;
  publishedAt?: string;
  outlet?: string;
  language: 'fr';
  blocks: TextBlock[];
}

/**
 * Fourches Caudines Criteria Block IDs
 */
export type FourchesBlockId =
  | 'scores'
  | 'summary'
  | 'surface_corrections'
  | 'substantive_improvements'
  | 'editorial_coherence'
  | 'editorial_power';

/**
 * The 10 domains of the 100-point scoring grid from Fourches Caudines
 */
export type ScoreDomainKey =
  | 'orthographe_grammaire'
  | 'clarte_lisibilite'
  | 'structure_progression'
  | 'solidite_logique'
  | 'robustesse_factuelle'
  | 'coherence_editoriale'
  | 'angle_impact'
  | 'connexion_quotidien'
  | 'preservation_voix'
  | 'format_calibrage';

export interface ScoreDomainDefinition {
  key: ScoreDomainKey;
  label: string;
  weight: number; // Max points
  description: string;
  criteria: string[];
}

export const SCORE_DOMAINS: Record<ScoreDomainKey, ScoreDomainDefinition> = {
  orthographe_grammaire: {
    key: 'orthographe_grammaire',
    label: 'Orthographe, grammaire, syntaxe, ponctuation',
    weight: 5,
    description: 'Exactitude linguistique, propreté de surface, fluidité des phrases',
    criteria: [
      'Accords grammaticaux et concordance des temps',
      'Homophones et orthographe lexicale',
      'Ponctuation et découpage des phrases',
      'Stabilité des références pronominales',
      'Typographie éditoriale'
    ]
  },
  clarte_lisibilite: {
    key: 'clarte_lisibilite',
    label: 'Clarté et lisibilité',
    weight: 10,
    description: 'Accessibilité, pédagogie, clarté du propos, maîtrise du jargon',
    criteria: [
      'Définition des notions dès leur première apparition',
      'Maîtrise et vulgarisation du jargon technique',
      'Progressivité pédagogique des explications',
      'Charge cognitive équilibrée par paragraphe'
    ]
  },
  structure_progression: {
    key: 'structure_progression',
    label: 'Structure et progression',
    weight: 10,
    description: 'Titre, introduction, enchaînements, hiérarchie, conclusion',
    criteria: [
      'Titre tendu, mémorisable et fidèle',
      'Introduction entrant immédiatement dans le sujet sans préambule scolaire',
      'Enchaînements logiques et transitions utiles',
      'Conclusion active ouvrant une perspective'
    ]
  },
  solidite_logique: {
    key: 'solidite_logique',
    label: 'Solidité logique et argumentative',
    weight: 15,
    description: 'Cohérence, nuance, qualité des inférences, résistance aux objections',
    criteria: [
      'Absence de causalités non démontrées (corrélation vs causalité)',
      'Absence de généralisations abusives et de faux dilemmes',
      'Absence d’épouvantails ou attaques ad hominem',
      'Anticipation et traitement des objections adverses prévisibles'
    ]
  },
  robustesse_factuelle: {
    key: 'robustesse_factuelle',
    label: 'Robustesse factuelle et sourcing',
    weight: 20,
    description: 'Vérifiabilité, précision, datation, contextualisation, niveau de certitude',
    criteria: [
      'Précision des chiffres, dates, noms et citations',
      'Sourcing explicite des assertions et données sensibles',
      'Contextualisation méthodologique des données chiffrées',
      'Distinction stricte entre faits vérifiés, interprétations et jugements'
    ]
  },
  coherence_editoriale: {
    key: 'coherence_editoriale',
    label: 'Cohérence éditoriale (6 axes)',
    weight: 15,
    description: 'Constructif, accrocheur, iconoclaste, narratif, accessible, éthique',
    criteria: [
      'Axe Constructif : ouvre un débouché, une solution ou un critère de discernement',
      'Axe Accrocheur : paradoxe, tension ou promesse explicite',
      'Axe Iconoclaste : angle neuf sans répéter une doxa ou contre-doxa usée',
      'Axe Narratif : fil conducteur, incarnation et tension',
      'Axe Accessible : compréhensible sans expertise préalable',
      'Axe Éthique : rigueur déontologique sans procès d’intention gratuit'
    ]
  },
  angle_impact: {
    key: 'angle_impact',
    label: 'Angle et impact éditorial',
    weight: 10,
    description: 'Originalité, intérêt, force de l’attaque, promesse tenue',
    criteria: [
      'Angle clair (démystification, éclairage, enquête, controverse, etc.)',
      'Promesse initiale tenue jusqu’au terme du texte',
      'Pertinence et fécondité éditoriale du cadrage choisi'
    ]
  },
  connexion_quotidien: {
    key: 'connexion_quotidien',
    label: 'Connexion au quotidien et utilité lecteur',
    weight: 5,
    description: 'Impact concret sur la vie du lecteur, capacité à rendre le sujet tangible',
    criteria: [
      'Réponse concrète à la question « Pourquoi cela me concerne-t-il ? »',
      'Incarnation par des situations réelles ou arbitrages tangibles'
    ]
  },
  preservation_voix: {
    key: 'preservation_voix',
    label: 'Préservation de la voix d’auteur et style',
    weight: 5,
    description: 'Conservation du style, du rythme, de l’énergie propre sans affadissement',
    criteria: [
      'Rythme vivant et précision lexicale',
      'Absence de clichés et formulations automatiques (« en conclusion », « force est de constater »)',
      'Respect du tempérament et de la tonalité propre de l’auteur'
    ]
  },
  format_calibrage: {
    key: 'format_calibrage',
    label: 'Format et calibrage',
    weight: 5,
    description: 'Respect de la longueur, densité et logique du format',
    criteria: [
      'Densité proportionnée sans longueurs ni détours creux',
      'Adéquation entre le format choisi et l’ampleur du propos'
    ]
  }
};

export type ScoreBand = 'solide' | 'perfectible' | 'fragile' | 'problematique';

export type FindingCategory =
  | 'sophisme'
  | 'affirmation-non-etayee'
  | 'surinterpretation'
  | 'source-absente'
  | 'cadrage'
  | 'point-fort';

export type SeverityLevel = 1 | 2 | 3;

/**
 * A source backing (or refuting) a factual claim.
 *
 * `origin` records how it reached us, which the reader needs in order to weigh
 * it: `article` means the piece itself hyperlinked it, `search` means the
 * research stage found it.
 */
export interface EvidenceSource {
  title: string;
  url: string;
  /** Excerpt that carries the support, when the source gave one. */
  quote?: string;
  origin: 'article' | 'search';
}

/**
 * Whether a factual assertion was actually checked against evidence.
 *
 * `unverified` is a first-class outcome, not a failure: without it a model asked
 * to verify with no evidence to hand will invent a contradiction rather than
 * admit it could not look. Most wrong "c'est faux" verdicts are this state
 * misreported as `contradicted`.
 */
export type VerificationState = 'confirmed' | 'contradicted' | 'unverified';

/**
 * A checkable factual assertion lifted out of an audit finding, carrying the
 * result of actually researching it.
 */
export interface FactualClaim {
  id: string;
  /**
   * The audit finding this claim was researched for. The claim under test is
   * always what the article said (the finding's `quote`), never the audit's
   * objection to it, per the verification-subject invariant.
   */
  findingId?: string;
  blockId: string;
  /** Literal excerpt asserting it. */
  quote: string;
  /** The assertion, restated so it can be searched for. */
  claim: string;
  verification: VerificationState;
  sources: EvidenceSource[];
  /** Why the research landed where it did, for the reader to audit. */
  rationale?: string;
}

/**
 * A factual objection the audit raised from memory that the research stage
 * then checked against the article's own statement and found unfounded: the
 * evidence confirmed what the article said, not what the audit doubted. The
 * finding is withdrawn from `AnalysisReport.findings` rather than published as
 * a fault, and recorded here instead so the disagreement is never silently
 * erased.
 */
export interface WithdrawnObjection {
  blockId: string;
  /** The article's own statement, i.e. what was actually verified. */
  quote: string;
  reason: string;
  sources: EvidenceSource[];
}

/** What the research stage actually did, so the report can never imply more. */
export interface ResearchRecord {
  performed: boolean;
  /** Provider that ran the searches, when one did. */
  provider?: string;
  queries: string[];
  /** Present whenever research was skipped or partial; names the limitation. */
  skippedReason?: string;
  /** Audit objections evidence refuted; see `WithdrawnObjection`. */
  withdrawn: WithdrawnObjection[];
}

/**
 * An annotation / finding located in the text
 */
export interface Finding {
  id: string;
  blockId: string;
  quote: string;
  charStart?: number;
  charEnd?: number;
  category: FindingCategory;
  severity: SeverityLevel;
  label: string;
  explanation: string;
  suggestion?: string;
  confidence: number;
  /**
   * Set on findings that assert something about the world rather than about the
   * prose. Absent on purely editorial findings, where it would be meaningless.
   */
  verification?: VerificationState;
  /** Evidence actually consulted. A contradiction with none is not reported. */
  sources?: EvidenceSource[];
}

/**
 * Detailed score per category/domain
 */
export interface CategoryScore {
  domain: ScoreDomainKey;
  label: string;
  score: number;
  maxScore: number;
  strengths: string[];
  weaknesses: string[];
}

/**
 * 6 editorial axes compliance check
 */
export interface EditorialAxesCheck {
  constructif: boolean;
  accrocheur: boolean;
  iconoclaste: boolean;
  narratif: boolean;
  accessible: boolean;
  ethique: boolean;
  notes?: string;
}

/**
 * Full Fourches Caudines Analysis Report
 */
export interface AnalysisReport {
  schemaVersion: number;
  score: number; // 0-100
  scoreBand: ScoreBand;
  summary: string;
  categories: CategoryScore[];
  findings: Finding[];
  editorialAxes: EditorialAxesCheck;
  /** Factual assertions actually researched, with their evidence. */
  claims: FactualClaim[];
  /** What research ran. Never optional: silence here would read as "checked". */
  research: ResearchRecord;
  meta: {
    model: string;
    promptVersion: string;
    analyzedAt: string;
    durationMs: number;
    textLengthChars?: number;
    blocksCount?: number;
  };
}

export type AnalysisResult = AnalysisReport;
export type PipelineStatus = 'idle' | 'extracting' | 'analyzing' | 'complete' | 'error';
export interface PipelineProgressEvent {
  step: string;
  progress: number;
  message?: string;
}

/**
 * Zod Schemas for LLM Output Validation & Parsing
 */

export const FindingCategorySchema = z.enum([
  'sophisme',
  'affirmation-non-etayee',
  'surinterpretation',
  'source-absente',
  'cadrage',
  'point-fort'
]);
export const EvidenceSourceSchema = z.object({
  title: z.string().default(''),
  url: z.string().url(),
  quote: z.string().optional(),
  origin: z.enum(['article', 'search']).default('search')
});

export const VerificationStateSchema = z.enum(['confirmed', 'contradicted', 'unverified']);

/**
 * Note the default: a model that omits the field has told us nothing about
 * whether it checked, and `unverified` is the only reading of nothing.
 */
export const FactualClaimSchema = z.object({
  id: z.string().default(() => `c_${Math.random().toString(36).slice(2, 9)}`),
  findingId: z.string().optional(),
  blockId: z.string().default(''),
  quote: z.string().default(''),
  claim: z.string().min(1),
  verification: VerificationStateSchema.default('unverified'),
  sources: z.array(EvidenceSourceSchema).default([]),
  rationale: z.string().optional()
});

export const SeverityLevelSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

export const FindingSchema = z.object({
  id: z.string().default(() => `f_${Math.random().toString(36).slice(2, 9)}`),
  blockId: z.string(),
  quote: z.string().min(1),
  charStart: z.number().optional(),
  charEnd: z.number().optional(),
  category: FindingCategorySchema,
  severity: SeverityLevelSchema.default(2),
  label: z.string().min(1),
  explanation: z.string().min(1),
  suggestion: z.string().optional(),
  confidence: z.number().min(0).max(1).default(0.9),
  verification: VerificationStateSchema.optional(),
  sources: z.array(EvidenceSourceSchema).default([])
});

export const CategoryScoreSchema = z.object({
  domain: z.enum([
    'orthographe_grammaire',
    'clarte_lisibilite',
    'structure_progression',
    'solidite_logique',
    'robustesse_factuelle',
    'coherence_editoriale',
    'angle_impact',
    'connexion_quotidien',
    'preservation_voix',
    'format_calibrage'
  ]),
  score: z.number().min(0),
  maxScore: z.number().optional(),
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([])
});

export const EditorialAxesCheckSchema = z.object({
  constructif: z.boolean().default(true),
  accrocheur: z.boolean().default(true),
  iconoclaste: z.boolean().default(true),
  narratif: z.boolean().default(true),
  accessible: z.boolean().default(true),
  ethique: z.boolean().default(true),
  notes: z.string().optional()
});


export const RawLlmAnalysisResponseSchema = z.object({
  summary: z.string().min(1),
  scores: z.array(CategoryScoreSchema).min(1),
  findings: z.array(FindingSchema).default([]),
  claims: z.array(FactualClaimSchema).default([]),
  editorialAxes: EditorialAxesCheckSchema.default({
    constructif: true,
    accrocheur: true,
    iconoclaste: true,
    narratif: true,
    accessible: true,
    ethique: true
  })
});

export type RawLlmAnalysisResponse = z.infer<typeof RawLlmAnalysisResponseSchema>;
