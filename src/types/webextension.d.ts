/**
 * Firefox exposes the promise-based `browser` namespace; Chrome exposes only
 * `chrome`. Every cross-browser guard in this codebase tests `typeof browser`,
 * which does not typecheck without this declaration.
 */
declare const browser: typeof chrome | undefined;
