/**
 * Turn the account endpoint's entitlement into the one line and one action the
 * reader needs. Shared by the account page and its tests, so the four states
 * the product defines (trial, active, quota exhausted, lapsed) are text, not
 * conditionals spread through JSX.
 */
import type { Account } from './api';

export type AccountState = 'trial' | 'trial_exhausted' | 'active' | 'quota_exhausted' | 'lapsed';

export interface AccountView {
  state: AccountState;
  title: string;
  detail: string;
  /** True when the reader can start an analysis right now. */
  canAnalyse: boolean;
  /** True when paying is the next step. */
  needsSubscription: boolean;
}

export function describeAccount(account: Account): AccountView {
  const { plan, usage } = account;

  if (plan === 'trial') {
    if (usage.remaining > 0) {
      return {
        state: 'trial',
        title: 'Analyse d’essai',
        detail:
          usage.remaining === 1
            ? 'Il vous reste 1 analyse offerte.'
            : `Il vous reste ${usage.remaining} analyses offertes.`,
        canAnalyse: true,
        needsSubscription: false,
      };
    }
    return {
      state: 'trial_exhausted',
      title: 'Essai épuisé',
      detail: 'Vos analyses offertes sont utilisées. Un abonnement les débloque à nouveau.',
      canAnalyse: false,
      needsSubscription: true,
    };
  }

  if (plan === 'active') {
    if (usage.remaining > 0) {
      return {
        state: 'active',
        title: 'Abonnement actif',
        detail: `Il vous reste ${usage.remaining} analyse${usage.remaining > 1 ? 's' : ''} aujourd’hui.`,
        canAnalyse: true,
        needsSubscription: false,
      };
    }
    return {
      state: 'quota_exhausted',
      title: 'Quota du jour atteint',
      detail: 'Vos analyses du jour sont utilisées. Le compteur repart à minuit UTC.',
      canAnalyse: false,
      needsSubscription: false,
    };
  }

  return {
    state: 'lapsed',
    title: 'Aucun abonnement actif',
    detail: 'Abonnez-vous pour lancer de nouvelles analyses.',
    canAnalyse: false,
    needsSubscription: true,
  };
}
