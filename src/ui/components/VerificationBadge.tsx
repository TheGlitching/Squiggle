import React from 'react';
import { VerificationState } from '../../engine/types';

export interface VerificationStyle {
  label: string;
  hint: string;
  className: string;
}

/**
 * The badge always speaks about the article's own statement, never about the
 * audit's objection to it, and its colour weight is calibrated on how damning
 * the state actually is.
 *
 * `non-sourcee` needs the most care of the four: a statement can be perfectly
 * true and simply carry no citation in the text. Dressing that in a severity
 * colour turns an ordinary sourcing observation into an accusation, which is
 * what made a sound fact read as shaky. It therefore takes the quietest neutral
 * of the palette, solid-bordered and matter-of-fact.
 *
 * `non-verifiable` takes the dashed amber the panel already uses to declare the
 * limits of our own checking, the same treatment as a research stage that never
 * ran. It qualifies how the claim is worded; it does not condemn it, so it is
 * the one chip left unfilled: a severity badge sits immediately beside it on
 * every card and `Majeur` is a solid amber fill, so two filled amber chips side
 * by side would read as one alarm louder than `Douteuse`. Filled means a verdict
 * was reached; the outline means nothing was established either way.
 *
 * The labels are short sentences rather than enum tokens, so they are not set in
 * uppercase; the severity badge keeps that treatment and the contrast makes the
 * two readable side by side.
 */
export const VERIFICATION_STYLES: Record<VerificationState, VerificationStyle> = {
  verifiee: {
    label: 'Vérifiée',
    hint: 'Les sources consultées, listées ci-dessous, confirment ce point de l’article.',
    className:
      'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
  },
  'non-sourcee': {
    label: 'Non sourcée dans l’article',
    hint: 'L’affirmation est vérifiable, mais l’article ne cite rien à l’appui : c’est une remarque sur son sourcing, pas un doute sur son exactitude.',
    className:
      'bg-stone-100 text-stone-600 dark:bg-stone-800/80 dark:text-stone-400 border-stone-200 dark:border-stone-700',
  },
  douteuse: {
    label: 'Douteuse',
    hint: 'Les sources consultées, listées ci-dessous, mettent en doute ce point de l’article.',
    className:
      'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300 dark:border-rose-800',
  },
  'non-verifiable': {
    label: 'Non vérifiable telle qu’écrite',
    hint: 'Telle qu’elle est formulée, l’affirmation ne peut pas être confrontée à des sources : elle n’est ni établie ni contredite, et rien ne permet de la reprocher à l’article.',
    className:
      'bg-white text-amber-700 dark:bg-stone-900/40 dark:text-amber-400 border-amber-400 dark:border-amber-700 border-dashed',
  },
};

/**
 * A state outside the classification says nothing about the article, so it must
 * not borrow the appearance of a state that does. Falling back on one of the four
 * would silently attribute a verdict nobody reached.
 */
export const UNRECOGNISED_STYLE: VerificationStyle = {
  label: 'État non reconnu',
  hint: 'Le classement de cette affirmation n’a pas pu être lu : ne l’interprétez ni en faveur ni au détriment de l’article.',
  className:
    'bg-white text-stone-500 dark:bg-stone-900 dark:text-stone-500 border-stone-300 dark:border-stone-800 border-dotted',
};

/**
 * Singular and plural forms for counting claims in prose, so a summary uses the
 * method's own vocabulary instead of a synonym invented at the call site.
 */
export const VERIFICATION_COUNT_LABELS_FR: Record<VerificationState, [string, string]> = {
  verifiee: ['vérifiée', 'vérifiées'],
  'non-sourcee': ['non sourcée dans l’article', 'non sourcées dans l’article'],
  douteuse: ['douteuse', 'douteuses'],
  'non-verifiable': ['non vérifiable telle qu’écrite', 'non vérifiables telles qu’écrites'],
};

export interface VerificationBadgeProps {
  verification: VerificationState;
}

export const VerificationBadge: React.FC<VerificationBadgeProps> = ({ verification }) => {
  const style = VERIFICATION_STYLES[verification] ?? UNRECOGNISED_STYLE;

  return (
    <span
      title={style.hint}
      aria-label={`${style.label}. ${style.hint}`}
      className={`inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${style.className}`}
    >
      {style.label}
    </span>
  );
};
