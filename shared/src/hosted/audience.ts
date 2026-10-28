/**
 * The audience counters the web app, and the extension in hosted mode, may
 * send to `POST /web/count`.
 *
 * A closed list, shared by the page that sends a name and the server that
 * refuses every other one. Each name is a fixed identifier: the counter it
 * bumps is a number per UTC day, and nothing in a name can carry a reader, an
 * address or an article. Visits themselves (pages, referrers) are read in
 * Cloudflare Web Analytics, not counted here.
 */
import type { FindingCategory } from '../engine/types';

export const AUDIENCE_METRIC_NAMES = [
  // A visit arriving through a known campaign link (`?ref=`).
  'ref_clemi',
  'ref_linuxfr',
  'ref_createur1',
  // A button used.
  'click_install_chrome',
  'click_install_firefox',
  'click_teacher_access',
  'click_subscribe',
  'click_example',
  'open_in_browser',
  // An article brought to /analyser by the bookmark "Analyser avec Squiggle".
  'entry_bookmarklet',
  // A kind of text pasted on /analyser, counted when it is analysed.
  'paste_transcript',
  // Screenshots read on the device on /analyser: imported from the page or
  // shared to the installed app, then how many (`screenshotsCounter`).
  'import_screenshots',
  'share_screenshots',
  'screenshots_1',
  'screenshots_2_4',
  'screenshots_5_9',
  'screenshots_10_plus',
  // A finding reported as wrong, by its category (`flagCounters`).
  'flag_finding_sophisme',
  'flag_finding_affirmation_non_etayee',
  'flag_finding_surinterpretation',
  'flag_finding_source_absente',
  'flag_finding_cadrage',
  'flag_finding_point_fort',
  // ...and by the reason the reader picked (`FLAG_REASONS`).
  'flag_reason_misread',
  'flag_reason_sourced',
  'flag_reason_wrong_kind',
  'flag_reason_too_harsh',
  'flag_reason_other',
] as const;
export type AudienceMetricName = (typeof AUDIENCE_METRIC_NAMES)[number];

export function isAudienceMetricName(value: unknown): value is AudienceMetricName {
  return (AUDIENCE_METRIC_NAMES as readonly unknown[]).includes(value);
}

/** The counter for a number of screenshots read at once: a bucket, never the number. */
export function screenshotsCounter(count: number): AudienceMetricName {
  if (count <= 1) return 'screenshots_1';
  if (count <= 4) return 'screenshots_2_4';
  if (count <= 9) return 'screenshots_5_9';
  return 'screenshots_10_plus';
}

/**
 * Why a reader reports a finding as wrong: a closed list, so a report carries
 * a choice and never a word the reader typed. The labels are the ones the
 * panel and the site show, in this order.
 */
export const FLAG_REASONS = [
  { id: 'misread', label: 'Le passage ne dit pas cela' },
  { id: 'sourced', label: 'L’article donne sa source' },
  { id: 'wrong_kind', label: 'Ce n’est pas ce procédé' },
  { id: 'too_harsh', label: 'Trop sévère' },
  { id: 'other', label: 'Autre raison' },
] as const;
export type FlagReason = (typeof FLAG_REASONS)[number]['id'];

/**
 * The two counters one report bumps: the finding's category and the reason.
 * They are counted apart, so neither can be tied to the other, nor to a report.
 */
export function flagCounters(category: FindingCategory, reason: FlagReason): [AudienceMetricName, AudienceMetricName] {
  return [FLAG_BY_CATEGORY[category], `flag_reason_${reason}`];
}

const FLAG_BY_CATEGORY: Record<FindingCategory, AudienceMetricName> = {
  sophisme: 'flag_finding_sophisme',
  'affirmation-non-etayee': 'flag_finding_affirmation_non_etayee',
  surinterpretation: 'flag_finding_surinterpretation',
  'source-absente': 'flag_finding_source_absente',
  cadrage: 'flag_finding_cadrage',
  'point-fort': 'flag_finding_point_fort',
};
