/**
 * The reader's phone, for the steps that differ between Android and iPhone.
 *
 * A link to a news site, followed from Squiggle on a phone, is claimed by the
 * publisher's app when it is installed: the article opens again in the app
 * that blocks copying. `browserLink` names the browser instead, where the
 * subscription works too and the bookmark "Analyser avec Squiggle" can read
 * the page. Nothing here fetches anything: it only builds the link the reader
 * follows.
 */
export type PhoneOs = 'android' | 'ios';

/** An iPad's Safari reports a Mac, so it is told apart by its touch screen. */
export function phoneOs(userAgent: string, maxTouchPoints = 0): PhoneOs | null {
  if (/Android/i.test(userAgent)) return 'android';
  if (/iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)) return 'ios';
  return null;
}

/** This browser's phone, or null on a computer and during the build. */
export function currentPhoneOs(): PhoneOs | null {
  if (typeof navigator === 'undefined') return null;
  return phoneOs(navigator.userAgent, navigator.maxTouchPoints);
}

/** The iOS release, read from `OS 17_4` or, on an iPad's desktop agent, Safari's `Version/17.4`. */
function iosVersion(userAgent: string): number {
  const match = /(?:OS |Version\/)(\d+)[_.]/.exec(userAgent);
  return match ? Number(match[1]) : 0;
}

/**
 * The link that opens an http(s) address in the phone's browser rather than
 * in the app that claims it: an Android intent naming Chrome, with the plain
 * address as its fallback, and `x-safari-https://` from iOS 17. Anywhere else,
 * or on an older iPhone, the address itself.
 */
export function browserLink(address: string, os: PhoneOs | null, userAgent: string): string {
  const url = new URL(address);
  const scheme = url.protocol.slice(0, -1);
  if (os === 'android') {
    return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${scheme};action=android.intent.action.VIEW;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url.toString())};end`;
  }
  if (os === 'ios' && iosVersion(userAgent) >= 17) return `x-safari-${url.toString()}`;
  return url.toString();
}
