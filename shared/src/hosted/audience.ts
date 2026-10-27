/**
 * The audience counters the web app may send to `POST /web/count`.
 *
 * A closed list, shared by the page that sends a name and the server that
 * refuses every other one. Each name is a fixed identifier: the counter it
 * bumps is a number per UTC day, and nothing in a name can carry a reader, an
 * address or an article. Visits themselves (pages, referrers) are read in
 * Cloudflare Web Analytics, not counted here.
 */
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
] as const;
export type AudienceMetricName = (typeof AUDIENCE_METRIC_NAMES)[number];

export function isAudienceMetricName(value: unknown): value is AudienceMetricName {
  return (AUDIENCE_METRIC_NAMES as readonly unknown[]).includes(value);
}
