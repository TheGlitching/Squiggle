import React from 'react';
import { FactualClaim, ResearchRecord } from '../../engine/types';
import { VerificationBadge } from './VerificationBadge';
import { SourceCitations } from './SourceCitations';

export interface ResearchDisclosureProps {
  research: ResearchRecord;
  claims?: FactualClaim[];
}

/**
 * States what the audit actually checked, next to the score that depends on it.
 * A report whose research never ran must not present as fully audited: the
 * absence of this disclosure is what let an unchecked assertion pass for a
 * refuted one.
 *
 * It also surfaces the objections the audit raised and the evidence then
 * refuted. Those are not shown in the findings list, because publishing a
 * refuted accusation is the defect this stage exists to prevent, but dropping
 * them without a word would hide a disagreement the reader is entitled to see.
 * They matter for a second reason: the score comes from the model's own domain
 * marks, given while it still believed the objection, so a withdrawal does not
 * lower the marks it caused. Saying how many were withdrawn is what keeps the
 * score readable.
 */
export const ResearchDisclosure: React.FC<ResearchDisclosureProps> = ({ research, claims = [] }) => {
  if (!research) return null;

  const queryCount = research.queries?.length ?? 0;
  const checkedCount = claims.filter((claim) => claim.verification !== 'unverified').length;
  const examined = claims.filter((claim) => claim.sources.length > 0 || claim.rationale);
  const withdrawn = research.withdrawn ?? [];

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

      {withdrawn.length > 0 && (
        <details className="mt-2 border-t border-stone-200 dark:border-stone-800 pt-2">
          <summary className="cursor-pointer font-mono text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-500 hover:text-emerald-900 dark:hover:text-emerald-300">
            {withdrawn.length} objection{withdrawn.length > 1 ? 's' : ''} écartée
            {withdrawn.length > 1 ? 's' : ''} après vérification
          </summary>
          <p className="mt-1.5 text-[11px] leading-relaxed text-stone-600 dark:text-stone-400">
            L’analyse mettait ce{withdrawn.length > 1 ? 's' : ''} passage
            {withdrawn.length > 1 ? 's' : ''} en doute, mais les sources consultées confirment
            l’article. Le doute n’est donc pas retenu contre lui. La note, elle, a été attribuée
            avant cette vérification.
          </p>
          <ul className="mt-2 space-y-2.5">
            {withdrawn.map((objection, i) => (
              <li
                key={`${objection.blockId}-${i}`}
                className="border-l-2 border-emerald-300 dark:border-emerald-800 pl-2.5"
              >
                <p className="text-xs italic text-stone-800 dark:text-stone-200 leading-snug">
                  « {objection.quote} »
                </p>
                <p className="mt-0.5 text-[11px] text-stone-600 dark:text-stone-400 leading-snug">
                  {objection.reason}
                </p>
                <SourceCitations sources={objection.sources} label="Sources" />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
};
