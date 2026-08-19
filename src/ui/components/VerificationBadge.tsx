import React from 'react';
import { VerificationState } from '../../engine/types';

export interface VerificationStyle {
  label: string;
  hint: string;
  className: string;
}

/**
 * `unverified` gets the neutral, unaccusing treatment on purpose: it reports a
 * gap in our own checking, not a defect of the article. Dressing it in a
 * severity colour would turn an absence of proof into a verdict, which is the
 * exact confusion that makes a true, sourced fact read as false.
 */
export const VERIFICATION_STYLES: Record<VerificationState, VerificationStyle> = {
  confirmed: {
    label: 'Vérifié',
    hint: 'Confirmé par les sources consultées, listées ci-dessous.',
    className:
      'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
  },
  contradicted: {
    label: 'Réfuté',
    hint: 'Contredit par les sources consultées, listées ci-dessous.',
    className:
      'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300 dark:border-rose-800',
  },
  unverified: {
    label: 'Non vérifié',
    hint: 'Aucune source n’a pu être consultée : ce point n’est ni confirmé ni infirmé, et rien ne permet de le reprocher à l’article.',
    className:
      'bg-stone-100 text-stone-600 dark:bg-stone-800/80 dark:text-stone-400 border-stone-300 dark:border-stone-700 border-dashed',
  },
};

export interface VerificationBadgeProps {
  verification: VerificationState;
}

export const VerificationBadge: React.FC<VerificationBadgeProps> = ({ verification }) => {
  const style = VERIFICATION_STYLES[verification] ?? VERIFICATION_STYLES.unverified;

  return (
    <span
      title={style.hint}
      aria-label={`${style.label}. ${style.hint}`}
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase tracking-wider border ${style.className}`}
    >
      {style.label}
    </span>
  );
};
