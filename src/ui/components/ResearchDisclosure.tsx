import React from 'react';
import { FactualClaim, ResearchRecord } from '../../engine/types';
import { VerificationBadge } from './VerificationBadge';
import { SourceCitations } from './SourceCitations';

export interface ResearchDisclosureProps {
  research: ResearchRecord;
  claims?: FactualClaim[];
}

/**
 * States what the audit actually checked, next to the verdict that depends on
 * it. A report whose research never ran must not present as fully audited: the
 * absence of this disclosure is what let an unchecked assertion pass for a
 * refuted one.
 */
export const ResearchDisclosure: React.FC<ResearchDisclosureProps> = ({ research, claims = [] }) => {
  if (!research) return null;

  const queryCount = research.queries?.length ?? 0;
  const checkedCount = claims.filter((claim) => claim.verification !== 'unverified').length;
  const examined = claims.filter((claim) => claim.sources.length > 0 || claim.rationale);

  if (!research.performed) {
    return (
      <div
        data-tour="research-disclosure"
        className="mt-3 rounded-lg border border-dashed border-amber-400 dark:border-amber-700 bg-amber-50/70 dark:bg-amber-950/30 p-2.5"
      >
        <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-400">
          Vérification factuelle non effectuée
        </span>
        <p className="mt-1 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
          Aucune recherche factuelle n’a été menée : les constats portent sur la forme et le
          raisonnement, pas sur l’exactitude des faits.
          {research.skippedReason ? ` Motif : ${research.skippedReason}` : ''}
        </p>
      </div>
    );
  }

  return (
    <div
      data-tour="research-disclosure"
      className="mt-3 rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/60 p-2.5"
    >
      <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
        Vérification factuelle
      </span>
      <p className="mt-1 text-xs leading-relaxed text-stone-700 dark:text-stone-300">
        {checkedCount} affirmation{checkedCount > 1 ? 's' : ''} vérifiée
        {checkedCount > 1 ? 's' : ''} sur {claims.length}, {queryCount} recherche
        {queryCount > 1 ? 's' : ''} menée{queryCount > 1 ? 's' : ''}
        {research.provider ? ` via ${research.provider}` : ''}.
        {research.skippedReason ? ` Limite : ${research.skippedReason}` : ''}
      </p>

      {examined.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer font-mono text-[10px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200">
            Voir les {examined.length} affirmation{examined.length > 1 ? 's' : ''} examinée
            {examined.length > 1 ? 's' : ''}
          </summary>
          <ul className="mt-2 space-y-2.5">
            {examined.map((claim) => (
              <li
                key={claim.id}
                className="border-l-2 border-stone-200 dark:border-stone-800 pl-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs text-stone-800 dark:text-stone-200 leading-snug">
                    {claim.claim}
                  </p>
                  <VerificationBadge verification={claim.verification} />
                </div>
                {claim.rationale && (
                  <p className="mt-0.5 text-[11px] text-stone-600 dark:text-stone-400 leading-snug">
                    {claim.rationale}
                  </p>
                )}
                <SourceCitations sources={claim.sources} label="Sources" />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
};
