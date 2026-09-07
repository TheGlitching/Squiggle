/**
 * The engine's internal barrel. The shared package's root barrel (../index.ts)
 * re-exports everything from here, so this list defines exactly what a
 * consumer — the extension or the hosted server — can reach inside the engine.
 *
 * `PipelineProgressEvent` is owned by pipeline.ts (the shape actually emitted
 * at runtime); an older, differently-shaped copy used to live in types.ts and
 * was deleted so no two declarations of the same name can ever collide here.
 */
export * from './types';
export * from './scoring';
export * from './prompts';
export * from './validator';
export * from './pipeline';
export * from './research';
export * from './sourceFetch';
export * from './sourceVerification';
export * from './demoFixture';
