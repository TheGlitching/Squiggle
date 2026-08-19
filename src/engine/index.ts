export * from './scoring';
export * from './prompts';
export * from './validator';

// `PipelineProgressEvent` was declared in BOTH types.ts and pipeline.ts, so a
// plain `export *` of each made the name ambiguous and broke every consumer of
// this barrel. pipeline.ts owns the shape actually emitted at runtime, so it
// wins here; the types.ts declaration is dead and deliberately not re-exported.
export * from './pipeline';
export {
  SCORE_DOMAINS,
  FindingCategorySchema,
  SeverityLevelSchema,
  FindingSchema,
  CategoryScoreSchema,
  EditorialAxesCheckSchema,
  RawLlmAnalysisResponseSchema,
} from './types';
export type {
  TextBlock,
  AnalysisInput,
  FourchesBlockId,
  ScoreDomainKey,
  ScoreDomainDefinition,
  ScoreBand,
  FindingCategory,
  SeverityLevel,
  Finding,
  CategoryScore,
  EditorialAxesCheck,
  AnalysisReport,
  AnalysisResult,
  PipelineStatus,
  RawLlmAnalysisResponse,
} from './types';
export { DEMO_ARTICLE, DEMO_FOURCHES_CAUDINES_REPORT } from './demoFixture';
