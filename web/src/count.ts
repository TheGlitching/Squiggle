/**
 * Audience counters, without a tracker.
 *
 * Each call adds one to a total per day and per name on our own server
 * (`POST /web/count`). It is sent with `credentials: 'omit'`, so it carries no
 * cookie and nothing ties it to an account; nothing is read from or written to
 * the browser; and where a visit came from is reduced HERE to one kind of site
 * from a fixed list, so no address ever leaves the page. The names are the
 * closed list the server accepts (`AUDIENCE_METRIC_NAMES`).
 */
import { isAudienceMetricName, type AudienceMetricName } from '@squiggle/shared/src/hosted/audience';

import { API_BASE, OWNER_PATH } from './api';
import { notion } from './glossaire';
import { FIREFOX_URL } from './install';

export function count(name: AudienceMetricName): void {
  // A counter is never worth a failure the reader would see.
  try {
    fetch(`${API_BASE}/web/count`, {
      method: 'POST',
      credentials: 'omit',
      keepalive: true,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    }).catch(() => {});
  } catch {
    // no network API at all: nothing to count with
  }
}

/**
 * `null` for an address that redirects to another page, which counts that one instead,
 * and for the owner's metrics page, which counts nothing at all.
 */
const VIEWS: Record<string, AudienceMetricName | null> = {
  '/': 'view_accueil',
  '/tarifs': 'view_tarifs',
  '/analyser': 'view_analyser',
  '/enseignants': 'view_enseignants',
  '/enseignants/fiche-activite': 'view_kit',
  '/enseignants/grille-lecture': 'view_kit',
  '/classe': 'view_classe',
  '/classe/fiche': 'view_classe',
  '/classe/corrige': 'view_classe',
  '/classe/mode-emploi': 'view_classe',
  '/classe/tableau': 'view_classe',
  '/glossaire': 'view_glossaire',
  '/connexion': 'view_connexion',
  '/magic-link': null,
  '/compte': 'view_compte',
  '/account': 'view_compte',
  '/transparence': 'view_transparence',
  '/mentions-legales': 'view_legal',
  '/cgv': 'view_legal',
  '/confidentialite': 'view_legal',
  '/conditions': 'view_legal',
  '/legal': null,
  '/pont': 'view_pont',
  [OWNER_PATH]: null,
};

export function viewOf(route: string): AudienceMetricName | null {
  if (route in VIEWS) return VIEWS[route];
  // One glossary page per notion: counted together, never by name.
  if (route.startsWith('/glossaire/') && notion(route.slice('/glossaire/'.length))) return 'view_glossaire';
  return 'view_introuvable';
}

/** Kinds of site a visit can come from, by host, first match wins. Anything else is `entry_other`. */
const SOURCES: Array<[AudienceMetricName, RegExp]> = [
  // Before the search engines: the Chrome Web Store is a google.com host too.
  ['entry_store', /^(chromewebstore\.google\.com|chrome\.google\.com|addons\.mozilla\.org|microsoftedge\.microsoft\.com)$/],
  ['entry_search', /(^|\.)(google\.(co\.|com\.)?[a-z]{2,3}|bing\.com|qwant\.com|duckduckgo\.com|ecosia\.org)$/],
  ['entry_edu', /(^|\.)(ac-[a-z-]+\.fr|clemi\.fr|education\.gouv\.fr|apden\.org)$/],
  ['entry_social', /(^|\.)(mastodon\.social|piaille\.fr|framapiaf\.org|bsky\.app|linkedin\.com|lnkd\.in|facebook\.com|x\.com|t\.co|twitter\.com)$/],
];

/** The round trips of our own flows: coming back from them is not a visit arriving. */
const OWN_FLOWS = /^(accounts\.google\.com|checkout\.stripe\.com|billing\.stripe\.com)$/;

/** What kind of site the page was opened from, or `null` when it was not an arrival. */
export function entryOf(referrer: string, ownHost: string, search: string): AudienceMetricName | null {
  // The sign-in email's link: a reader coming back, not a visit.
  if (new URLSearchParams(search).has('code')) return null;
  if (!referrer) return 'entry_direct';
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return 'entry_other';
  }
  if (host === ownHost || OWN_FLOWS.test(host)) return null;
  return SOURCES.find(([, pattern]) => pattern.test(host))?.[0] ?? 'entry_other';
}

/** A known campaign link (`?ref=clemi`), or `null`. */
export function campaignOf(search: string): AudienceMetricName | null {
  const name = `ref_${new URLSearchParams(search).get('ref')}`;
  return isAudienceMetricName(name) ? name : null;
}

/** Count where this page load came from. Called once, when the app starts. */
export function countArrival(): void {
  if (window.location.pathname === OWNER_PATH) return;
  const entry = entryOf(document.referrer, window.location.hostname, window.location.search);
  if (entry) count(entry);
  const campaign = campaignOf(window.location.search);
  if (campaign) count(campaign);
}

/** The install button's counter, by the store it leads to. */
export function installClick(storeUrl: string): AudienceMetricName {
  return storeUrl === FIREFOX_URL ? 'click_install_firefox' : 'click_install_chrome';
}
