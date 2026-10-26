/** What a reader is offered and what it costs, stated once for the landing pages. */
export const FREE_ANALYSES = 3;
export const MONTHLY_ANALYSES = 60;
export const PRICE_MONTHLY = '4,99 €';
export const VAT_NOTE = 'TVA non applicable, art. 293 B du CGI';
export const SUBSCRIBE_LABEL = `S’abonner : ${PRICE_MONTHLY}/mois`;

/**
 * What the own-key route costs with a high-end model a reader could plug in, for the same
 * allowance as the plan: 60 analyses in a month, on a ~1 000-word article (0,41 to 0,50 € each). Computed
 * from Anthropic's list price for Claude Opus 5.5 and the calls the extension's pipeline
 * makes (audit, grounded web research per checked claim, cited-page checks); the method and
 * its assumptions are in the pull request that introduced it. It names a provider's model as
 * an example of what a reader can choose, never what the hosted plan runs.
 */
export const OWN_KEY_TOP_MODEL_MONTHLY = 'environ 25 à 30 € par mois';

/**
 * The headline, stated once for the hero and the site footer. `web/index.html` repeats it in
 * the page title and the link preview, and a test keeps the two in step; `og.png` is a
 * rendering of the hero and is captured again when it changes.
 */
export const TAGLINE = 'Un deuxième avis sur votre lecture.';

export const GITHUB_URL = 'https://github.com/TheGlitching/Squiggle';

/** The legal pages, at stable public URLs: stores and Google's OAuth consent screen point at `/confidentialite`. */
export const LEGAL_PAGES = [
  ['/mentions-legales', 'Mentions légales'],
  ['/cgv', 'Conditions de vente'],
  ['/confidentialite', 'Confidentialité'],
  ['/conditions', 'Conditions d’utilisation'],
] as const;
