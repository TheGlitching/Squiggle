/** What a reader is offered and what it costs, stated once for the landing pages. */
export const FREE_ANALYSES = 3;
export const DAILY_ANALYSES = 10;
export const PRICE_MONTHLY = '4,99 €';
export const VAT_NOTE = 'TVA non applicable, art. 293 B du CGI';
export const SUBSCRIBE_LABEL = `S’abonner : ${PRICE_MONTHLY}/mois`;

/**
 * The headline, stated once for the hero and the site footer. `web/index.html` repeats it in
 * the page title and the link preview, and a test keeps the two in step; `og.png` is a
 * rendering of the hero and is captured again when it changes.
 */
export const TAGLINE = 'Un avis que vous pouvez défendre.';

export const GITHUB_URL = 'https://github.com/TheGlitching/Squiggle';

/** The legal pages, at stable public URLs: stores and Google's OAuth consent screen point at `/confidentialite`. */
export const LEGAL_PAGES = [
  ['/mentions-legales', 'Mentions légales'],
  ['/cgv', 'Conditions de vente'],
  ['/confidentialite', 'Confidentialité'],
  ['/conditions', 'Conditions d’utilisation'],
] as const;
