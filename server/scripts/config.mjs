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
