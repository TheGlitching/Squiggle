/**
 * A finding reported as wrong, from the panel in hosted mode.
 *
 * Two counters go to the same audience endpoint the site uses, one for the
 * finding's category and one for the reason picked from a closed list
 * (`flagCounters`). Nothing else leaves: no quote, no article, no account,
 * no credential. In BYOK mode the panel offers no report at all, because that
 * mode sends nothing to our server, ever.
 */
import { flagCounters, type FindingCategory, type FlagReason } from '@squiggle/shared';

import { COUNT_URL } from './config';

export function reportFinding(category: FindingCategory, reason: FlagReason, fetchImpl: typeof fetch = fetch): void {
  for (const name of flagCounters(category, reason)) {
    // A counter is never worth a failure the reader would see.
    fetchImpl(COUNT_URL, {
      method: 'POST',
      credentials: 'omit',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    }).catch(() => {});
  }
}
