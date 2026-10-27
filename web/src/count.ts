/**
 * Audience counters, without a tracker.
 *
 * Each call adds one to a total per day and per name on our own server
 * (`POST /web/count`). It is sent with `credentials: 'omit'`, so it carries no
 * cookie and nothing ties it to an account, and nothing is read from or written
 * to the browser. The names are the closed list the server accepts
 * (`AUDIENCE_METRIC_NAMES`): campaign links and a few buttons. Visits
 * themselves are read in Cloudflare Web Analytics.
 */
import { isAudienceMetricName, type AudienceMetricName } from '@squiggle/shared/src/hosted/audience';

import { API_BASE, OWNER_PATH } from './api';
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

/** A known campaign link (`?ref=clemi`), or `null`. */
export function campaignOf(search: string): AudienceMetricName | null {
  const name = `ref_${new URLSearchParams(search).get('ref')}`;
  return isAudienceMetricName(name) ? name : null;
}

/** Count the campaign link this page was opened from, if any. Called once, when the app starts. */
export function countCampaign(): void {
  if (window.location.pathname === OWNER_PATH) return;
  const campaign = campaignOf(window.location.search);
  if (campaign) count(campaign);
}

/** The install button's counter, by the store it leads to. */
export function installClick(storeUrl: string): AudienceMetricName {
  return storeUrl === FIREFOX_URL ? 'click_install_firefox' : 'click_install_chrome';
}
