/**
 * The hosted-mode endpoints, resolved once at build time.
 *
 * The web app and the API share one origin in production (see `web/src/api.ts`),
 * so a single constant is enough. It is a `define`d build value rather than a
 * hard-coded host: a dev or staging build must be able to point at its own
 * server, and shipping a production hostname in the source would make that
 * impossible without editing code.
 */
const PLACEHOLDER = 'https://squiggle.example';

function resolveOrigin(): string {
  // Vitest and a plain page have no build replacement; fall back rather than
  // throw so importing this module never depends on the bundler.
  const injected = typeof __HOSTED_ORIGIN__ === 'string' ? __HOSTED_ORIGIN__ : PLACEHOLDER;
  return injected.replace(/\/+$/, '');
}

/** Origin of the hosted API, without a trailing slash. */
export const HOSTED_ORIGIN = resolveOrigin();

/** Origin of the public web app (same as the API in production). */
export const HOSTED_WEB_APP = HOSTED_ORIGIN;

/** Where a keyless reader signs in and authorises this install. */
export function hostedPontUrl(extensionId: string, publicKeyJwk: string): string {
  const query = new URLSearchParams({ ext: extensionId, pub: publicKeyJwk });
  return `${HOSTED_WEB_APP}/pont?${query.toString()}`;
}

/** The data-flow page the hosted disclosure links to. */
export const TRANSPARENCY_URL = `${HOSTED_WEB_APP}/transparence`;

/** The account page, where a reader subscribes or manages a plan. */
export const ACCOUNT_URL = `${HOSTED_WEB_APP}/compte`;

/** The host the extension names in the standing disclosure. */
export function hostedProviderDomain(): string {
  try {
    return new URL(HOSTED_ORIGIN).host;
  } catch {
    return HOSTED_ORIGIN;
  }
}

/** "Analyse effectuée via <domain> — <model>, prompts v<version>", as required. */
export function disclosureText(model: string, promptVersion: string): string {
  return `Analyse effectuée via ${hostedProviderDomain()} — ${model}, prompts v${promptVersion}`;
}
