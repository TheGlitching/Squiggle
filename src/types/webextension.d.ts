/**
 * Firefox exposes the promise-based `browser` namespace; Chrome exposes only
 * `chrome`. Every cross-browser guard in this codebase tests `typeof browser`,
 * which does not typecheck without this declaration.
 */
declare const browser: typeof chrome | undefined;

/**
 * The build target injected by vite.config.ts at compile time (`'chrome'` or
 * `'firefox'`). Lets the Firefox build dead-code-eliminate Chrome-only API
 * calls (`chrome.sidePanel`) that AMO's static linter would otherwise flag even
 * behind a runtime `typeof chrome` guard.
 */
declare const __TARGET__: 'chrome' | 'firefox';

/**
 * The hosted-mode origin injected by vite.config.ts at compile time. Set from
 * `SQUIGGLE_HOSTED_ORIGIN` for a real deployment; a placeholder otherwise.
 */
declare const __HOSTED_ORIGIN__: string;