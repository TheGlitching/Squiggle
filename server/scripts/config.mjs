// Reads wrangler.jsonc, which is JSON with comments. The pattern keeps a
// string intact first, so the `//` in a URL is not mistaken for a comment.
const COMMENTS = /("(?:[^"\\]|\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g;

/** @param {string} text @returns {any} */
export function parseJsonc(text) {
  return JSON.parse(text.replace(COMMENTS, (_, kept) => kept ?? ''));
}

/**
 * The vars of one environment that still carry a PENDING_… placeholder, i.e.
 * a value nobody has decided yet.
 * @param {string} text wrangler.jsonc
 * @param {string} env
 * @returns {string[]} the var names
 */
export function pendingVars(text, env) {
  const vars = parseJsonc(text).env?.[env]?.vars ?? {};
  return Object.keys(vars).filter((name) => String(vars[name]).includes('PENDING_'));
}

/**
 * Secrets the deploy checks before shipping. EXTENSION_CHROME_ORIGIN is the
 * one that used to be a var: as a secret the PENDING guard no longer sees it,
 * and without it every Chrome reader is refused by CORS.
 */
export const REQUIRED_SECRETS = ['EXTENSION_CHROME_ORIGIN'];

/**
 * The required secrets absent from `wrangler secret list --format json`.
 * @param {string} listing its stdout
 * @returns {string[]} the missing names
 */
export function missingSecrets(listing) {
  const names = new Set(JSON.parse(listing).map((/** @type {{ name: string }} */ s) => s.name));
  return REQUIRED_SECRETS.filter((name) => !names.has(name));
}
