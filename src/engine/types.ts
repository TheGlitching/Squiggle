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
 * 8 Fourches Caudines Criteria Block IDs
 */
export type FourchesBlockId =
  | 'verdict'
  | 'scores'
  | 'summary'
  | 'surface_corrections'
  | 'substantive_improvements'
  | 'editorial_coherence'
  | 'editorial_power'
  | 'prioritized_revision_plan';

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

/**
 * Editorial verdict levels
 */
export type EditorialVerdict =
  | 'publier'
  | 'publier_apres_corrections_mineures'
  | 'reviser_avant_publication'
  | 'bloquer';

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
 * Block 8: Prioritized Revision Plan
 */
export interface RevisionItem {
  id: string;
  problem: string;
  reason: string;
  action: string;
  blockId?: string;
  quote?: string;
}

export interface PrioritizedRevisionPlan {
  priority1_blocking: RevisionItem[];
  priority2_major: RevisionItem[];
  priority3_editorial_optimizations: RevisionItem[];
}

/**
 * Full 8-Block Fourches Caudines Analysis Report
 */
export interface AnalysisReport {
  schemaVersion: number;
  score: number; // 0-100
  scoreBand: ScoreBand;
  verdict: EditorialVerdict;
  summary: string;
  categories: CategoryScore[];
  findings: Finding[];
  editorialAxes: EditorialAxesCheck;
  revisionPlan: PrioritizedRevisionPlan;
  editorialOptimizations?: {
    title?: string;
    hook?: string;
    angle?: string;
    narration?: string;
    conclusion?: string;
  };
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
  confidence: z.number().min(0).max(1).default(0.9)
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

export const EditorialVerdictSchema = z.enum([
  'publier',
  'publier_apres_corrections_mineures',
  'reviser_avant_publication',
  'bloquer'
]);

export const EditorialAxesCheckSchema = z.object({
  constructif: z.boolean().default(true),
  accrocheur: z.boolean().default(true),
  iconoclaste: z.boolean().default(true),
  narratif: z.boolean().default(true),
  accessible: z.boolean().default(true),
  ethique: z.boolean().default(true),
  notes: z.string().optional()
});

export const RevisionItemSchema = z.object({
  id: z.string().default(() => `rev_${Math.random().toString(36).slice(2, 9)}`),
  problem: z.string().min(1),
  reason: z.string().min(1),
  action: z.string().min(1),
  blockId: z.string().optional(),
  quote: z.string().optional()
});

export const PrioritizedRevisionPlanSchema = z.object({
  priority1_blocking: z.array(RevisionItemSchema).default([]),
  priority2_major: z.array(RevisionItemSchema).default([]),
  priority3_editorial_optimizations: z.array(RevisionItemSchema).default([])
});

export const RawLlmAnalysisResponseSchema = z.object({
  verdict: EditorialVerdictSchema.default('reviser_avant_publication'),
  summary: z.string().min(1),
  scores: z.array(CategoryScoreSchema).min(1),
  findings: z.array(FindingSchema).default([]),
  editorialAxes: EditorialAxesCheckSchema.default({
    constructif: true,
    accrocheur: true,
    iconoclaste: true,
    narratif: true,
    accessible: true,
    ethique: true
  }),
  revisionPlan: PrioritizedRevisionPlanSchema.default({
    priority1_blocking: [],
    priority2_major: [],
    priority3_editorial_optimizations: []
  }),
  editorialOptimizations: z
    .object({
      title: z.string().optional(),
      hook: z.string().optional(),
      angle: z.string().optional(),
      narration: z.string().optional(),
      conclusion: z.string().optional()
    })
    .optional()
});

export type RawLlmAnalysisResponse = z.infer<typeof RawLlmAnalysisResponseSchema>;
