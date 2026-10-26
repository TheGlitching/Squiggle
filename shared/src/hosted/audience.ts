/**
 * The audience counters the web app may send to `POST /web/count`.
 *
 * A closed list, shared by the page that sends a name and the server that
 * refuses every other one. Each name is a fixed identifier: the counter it
 * bumps is a number per UTC day, and nothing in a name can carry a reader, an
 * address or an article. A visit's origin is reduced to one of the `entry_`
 * kinds inside the browser, so the server never receives a referring URL.
 */
export const AUDIENCE_METRIC_NAMES = [
  // A page opened, by route.
  'view_accueil',
  'view_tarifs',
  'view_analyser',
  'view_enseignants',
  'view_kit',
  'view_classe',
  'view_glossaire',
  'view_connexion',
  'view_compte',
  'view_transparence',
  'view_legal',
  'view_pont',
  'view_introuvable',
  // A visit arriving from another site, or from none, by kind of site.
  'entry_search',
  'entry_store',
  'entry_edu',
  'entry_social',
  'entry_direct',
  'entry_other',
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
