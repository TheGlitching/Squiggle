/**
 * Single public surface of the shared engine. Both consumers import from
 * exactly this barrel: the extension (BYOK mode) and the hosted server.
 * Keeping one merge point means a new shared symbol can only ever be
 * introduced here, never privately in one of the two consumers.
 *
 * The engine barrel re-exports its submodules in full; the client contracts,
 * the BYOK types, and the hosted-API request-signing protocol are the other
 * shared pieces. No two submodules export the same name (a collision here
 * would silently drop the symbol), which typechecking enforces at every
 * import site.
 */
export * from './engine';
export * from './client/base';
export * from './client/gemini';
export * from './types/byok';
export * from './auth/signing';
export * from './hosted/client';
