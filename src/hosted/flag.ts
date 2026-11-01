/**
 * A finding, or a source's nature, reported as wrong, from the panel in hosted mode.
 *
 * Two counters go to the same audience endpoint the site uses, one for the
 * finding's category and one for the reason picked from a closed list
 * (`flagCounters`). Nothing else leaves: no quote, no article, no account,
 * no credential. In BYOK mode the panel offers no report at all, because that
 * mode sends nothing to our server, ever.
 */
import {
  flagCounters,
  sourceFlagCounter,
  type FindingCategory,
  type FlagReason,
  type SourceNature,
} from '@squiggle/shared';

import { COUNT_URL } from './config';

export function reportFinding(category: FindingCategory, reason: FlagReason, fetchImpl: typeof fetch = fetch): void {
  for (const name of flagCounters(category, reason)) send(name, fetchImpl);
}

/** A source's nature reported as wrong: one counter, the nature the panel showed. */
export function reportSourceNature(nature: SourceNature, fetchImpl: typeof fetch = fetch): void {
  send(sourceFlagCounter(nature), fetchImpl);
}

function send(name: string, fetchImpl: typeof fetch): void {
  // A counter is never worth a failure the reader would see.
  fetchImpl(COUNT_URL, {
    method: 'POST',
    credentials: 'omit',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  }).catch(() => {});
}
