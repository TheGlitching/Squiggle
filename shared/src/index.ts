/**
 * Single public surface of the shared engine. Both consumers import from
 * exactly this barrel: the extension (BYOK mode) and the hosted server.
 * Keeping one merge point means a new shared symbol can only ever be
 * introduced here, never privately in one of the two consumers.
 *
 * The engine barrel re-exports its submodules in full; the client contracts
 * and the BYOK types are the remaining two shared pieces. No two submodules
 * export the same name (a collision here would silently drop the symbol),
 * which typechecking enforces at every import site.
 */
export * from './engine';
export * from './client/base';
export * from './client/gemini';
export * from './types/byok';
