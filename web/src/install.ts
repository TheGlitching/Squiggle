/**
 * Where "Installer l'extension" sends the reader. One named constant per store,
 * routed by user agent so the button is never dead: Firefox goes to AMO, a
 * Chromium browser goes to the Chrome Web Store, and anything else (Safari)
 * shows both links instead of a button that goes nowhere.
 */
export const CHROME_URL =
  'https://chromewebstore.google.com/detail/squiggle-analyse-critique/gmlbdffooflgdpeiapkdfgkhnfclppec';
export const FIREFOX_URL = 'https://addons.mozilla.org/en-US/firefox/addon/squiggle-analysis/';

/** The store URL for this user agent, or `null` when neither store applies. */
export function installUrlFor(userAgent: string): string | null {
  if (/Firefox\//i.test(userAgent)) return FIREFOX_URL;
  if (/Chrome\//.test(userAgent) || /Edg\//.test(userAgent) || /OPR\//.test(userAgent) || /Brave/.test(userAgent)) {
    return CHROME_URL;
  }
  return null;
}