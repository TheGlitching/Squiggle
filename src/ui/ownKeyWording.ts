import { PROVIDER_LABELS } from '@squiggle/shared';

/**
 * The own-key option in a reader's words, stated once for the first screen, the
 * settings sheet and the tour. "Gratuit" is true of Squiggle and stays up front; what
 * the reader still pays, and to whom, sits right beside it, because "clé d’API" means
 * nothing to most readers. squiggle.fr says the same thing (`web/src/pages/Accueil.tsx`).
 */
const providers = Object.values(PROVIDER_LABELS);

export const OWN_KEY_PROVIDERS = `${providers.slice(0, -1).join(', ')} ou ${providers[providers.length - 1]}`;

export const OWN_KEY_TITLE = 'Gratuit avec votre propre clé d’IA';

export const OWN_KEY_BILLING =
  `Squiggle ne vous facture rien : la partie IA tourne sur votre propre compte chez un fournisseur d’IA (${OWN_KEY_PROVIDERS}), ` +
  'qui vous facture directement chaque analyse, au tarif du modèle choisi.';

export const API_KEY_MEANS =
  'Une clé d’API, c’est le code d’accès personnel que ce fournisseur vous donne sur son site : vous le collez une fois ici.';

/** The other way in, for a reader with no account at an AI provider. */
export const ACCOUNT_TITLE = 'Avec un compte Squiggle, aucune clé à créer';

export const ACCOUNT_TERMS = '3 analyses offertes, sans carte bancaire, puis un abonnement mensuel sans engagement.';
