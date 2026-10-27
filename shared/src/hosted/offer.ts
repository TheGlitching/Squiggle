/**
 * The hosted offer as a reader is told it, stated once for the web app and the
 * extension panel, which both show the subscribe box. The server enforces the
 * same numbers (`server/src/billing/quota.ts`); the price itself is Stripe's.
 */
export const FREE_ANALYSES = 3;
export const MONTHLY_ANALYSES = 60;
export const PRICE_MONTHLY = '4,99 €';
export const VAT_NOTE = 'TVA non applicable, art. 293 B du CGI';
export const SUBSCRIBE_LABEL = `S’abonner : ${PRICE_MONTHLY}/mois`;
/** The offer in one line, at the moment the trial runs out. */
export const OFFER_LINE = `${MONTHLY_ANALYSES} analyses par mois, ${PRICE_MONTHLY}, sans engagement.`;
