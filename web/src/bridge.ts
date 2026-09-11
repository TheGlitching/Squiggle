/**
 * The web half of the extension bridge. The full contract is in
 * `web/BRIDGE.md`; this module is the typed version of it and the only place
 * the URL shape is built or parsed.
 *
 * The extension opens `…/pont?ext=<extension-id>&pub=<P-256 public JWK>`.
 * Once the reader is signed in the web app claims a token and either navigates
 * to the extension (Chromium) or shows a short code (Firefox).
 */

export interface BridgeParams {
  /** The extension id, as the browser knows it (`chrome-extension://<id>`). */
  ext: string;
  /** The install's P-256 public key, JSON-encoded, exactly as sent. */
  pub: string;
}

/** Everything on the URL query is already percent-decoded by the browser. */
export function parseBridgeQuery(search: string): BridgeParams | null {
  const params = new URLSearchParams(search);
  const ext = params.get('ext')?.trim() ?? '';
  const pub = params.get('pub')?.trim() ?? '';
  if (!ext || !pub) return null;
  return { ext, pub };
}

/** Parse the `pub` parameter as a JWK, or null when it is not an object. */
export function parseBridgeJwk(pub: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(pub);
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * The Chromium navigation target. Parameters are percent-encoded, so the JWK
 * arrives intact. `pub` is passed through verbatim rather than re-encoded
 * from parsed JSON, so the extension hashes the exact bytes it sent.
 */
export function buildExtensionAuthUrl(
  ext: string,
  token: string,
  pub: string,
  keyId: string,
): string {
  const query = new URLSearchParams({ token, pub, keyId });
  return `chrome-extension://${ext}/squiggle-auth?${query.toString()}`;
}
