import { useState, type KeyboardEvent } from 'react';

import { EXAMPLES, HERO_ARTICLE } from '../demo';
import { tone } from './Exemple';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from './Landing';

/** A sentence of the example article: one carrying a finding, or plain text Squiggle leaves alone. */
type Sentence = { id: number; finding?: number; text: string };

/** The example article, cut into the sentences a student can mark. */
const PARAGRAPHS: Sentence[][] = (() => {
  let id = 0;
  return HERO_ARTICLE.paragraphs.map((parts) =>
    parts.flatMap((part): Sentence[] => {
      if (typeof part === 'number') {
        const { before, mark, after } = EXAMPLES[part];
        return [{ id: id++, finding: part, text: `${before}${mark}${after}` }];
      }
      const text = part.trim();
      return text ? [{ id: id++, text }] : [];
    }),
  );
})();

const SENTENCES = PARAGRAPHS.flat();
const WEAK = SENTENCES.filter(({ finding }) => finding !== undefined && EXAMPLES[finding].category !== 'point-fort');

/** The lesson, in the order it runs: the students first, the report after, then the class. */
const STEPS = [
  ['Les élèves lisent et marquent', 'Seuls, ce qui leur paraît fragile.'],
  ['Vous révélez l’analyse', 'Chaque passage relevé, avec sa raison.'],
  ['La classe compare', 'Ce qu’ils ont vu, manqué, ou marqué de trop.'],
] as const;

/**
 * The classroom exercise, played on the page: the reader marks the sentences they find
 * fragile in the example article, as a student would on paper, then reveals Squiggle's
 * highlights and sees what they found, missed, or marked that the analysis leaves alone.
 */
export function Exercice() {
  const [marked, setMarked] = useState<ReadonlySet<number>>(new Set());
  const [revealed, setRevealed] = useState(false);

  const toggle = (id: number) =>
    setMarked((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const onKey = (id: number) => (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    toggle(id);
  };
  const restart = () => {
    setMarked(new Set());
    setRevealed(false);
  };

  const found = WEAK.filter(({ id }) => marked.has(id)).length;
  const extra = SENTENCES.filter(({ id, finding }) => marked.has(id) && finding === undefined).length;
  const current = revealed ? 1 : 0;

  const sentence = ({ id, finding, text }: Sentence) => {
    const isMarked = marked.has(id);
    const cls = `exercice-phrase${isMarked ? ' is-marked' : ''}`;
    if (!revealed) {
      return (
        <span
          key={id}
          role="button"
          tabIndex={0}
          aria-pressed={isMarked}
          onClick={() => toggle(id)}
          onKeyDown={onKey(id)}
          className={`${cls} cursor-pointer`}
        >
          {text}
        </span>
      );
    }
    if (finding === undefined) {
      return (
        <span key={id} className={cls}>
          {text}
        </span>
      );
    }
    const { before, mark, after, sev, label } = EXAMPLES[finding];
    return (
      <span key={id} className={cls}>
        {before}
        <mark className="hero-hl cursor-default" style={tone(sev)} title={label}>
          {mark}
        </mark>
        {after}
      </span>
    );
  };

  return (
    <div className="grid gap-10">
      <ol aria-label="Les trois temps de l’exercice" className="m-0 grid list-none gap-4 p-0 md:grid-cols-3 md:gap-8">
        {STEPS.map(([title, text], index) => {
          const active = index === current || (revealed && index === 2);
          return (
            <li key={title} aria-current={active ? 'step' : undefined} className="flex gap-4">
              <span
                aria-hidden="true"
                className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-base font-semibold tabular-nums transition-colors duration-160 ease-out ${
                  active
                    ? 'border-accent bg-accent text-accentForeground'
                    : 'border-borderControl text-muted'
                }`}
              >
                {index + 1}
              </span>
              <span className="grid content-start gap-1">
                <span className={`font-display text-lg leading-snug font-semibold ${active ? '' : 'text-muted'}`}>
                  {title}
                </span>
                <span className="text-base text-muted">{text}</span>
              </span>
            </li>
          );
        })}
      </ol>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-12">
        <article
          aria-label="L’article de l’exercice"
          className="self-start rounded-card bg-paper px-5 py-7 text-paperInk sm:px-8 md:px-12 md:py-11"
        >
          <p className="m-0 text-base font-medium text-paperMuted">
            {revealed ? 'Surligné par Squiggle, sur vos marques' : 'Touchez une phrase pour la marquer'}
          </p>
          <p className="mt-2 mb-0 font-serif text-3xl leading-tight font-semibold tracking-tight md:text-4xl">
            {HERO_ARTICLE.title}
          </p>
          {PARAGRAPHS.map((sentences, index) => (
            <p key={index} className="mt-5 mb-0 font-serif text-lg leading-[1.75] md:text-xl">
              {sentences.flatMap((item, at) => (at ? [' ', sentence(item)] : [sentence(item)]))}
            </p>
          ))}
        </article>

        <div
          data-ui
          role="group"
          aria-label="Le tableau de l’exercice"
          className="grid content-start gap-5 rounded-card border border-border bg-surface p-5 md:p-6 lg:sticky lg:top-6 lg:self-start"
        >
          {revealed ? (
            <div key="rapport" className="hero-card grid gap-5">
              <p className="m-0 font-display text-2xl leading-tight font-semibold" aria-live="polite">
                {found} passage{found > 1 ? 's' : ''} fragile{found > 1 ? 's' : ''} repéré{found > 1 ? 's' : ''} sur{' '}
                {WEAK.length}
              </p>
              <ul aria-label="Les constats de l’analyse" className="m-0 grid list-none gap-3 p-0 text-base">
                {SENTENCES.filter(({ finding }) => finding !== undefined).map(({ id, finding }) => {
                  const { label, sev, category } = EXAMPLES[finding as number];
                  const strength = category === 'point-fort';
                  const seen = marked.has(id);
                  const status = strength ? (seen ? 'marqué, à débattre' : 'point fort') : seen ? 'repéré' : 'manqué';
                  return (
                    <li key={id} className="flex items-baseline gap-3" style={tone(sev)}>
                      <span aria-hidden="true" className="h-2 w-2 shrink-0 translate-y-[-1px] rounded-full bg-(--sev-color)" />
                      <span className="grow">{label}</span>
                      <span className={seen && !strength ? 'font-semibold text-foreground' : 'text-muted'}>{status}</span>
                    </li>
                  );
                })}
              </ul>
              <div className="grid gap-2 border-t border-border pt-5">
                <p className="m-0 font-semibold">À débattre en classe</p>
                <ul className="m-0 grid list-disc gap-2 pl-5 text-base text-muted marker:text-accent">
                  <li>
                    «&nbsp;Neuf adolescents sur dix&nbsp;» est jugé douteux, pas faux. Pourquoi cette nuance&nbsp;?
                  </li>
                  {extra ? (
                    <li>
                      {extra > 1 ? `${extra} phrases marquées n’ont` : 'Une phrase marquée n’a'} aucun constat. Qui a
                      raison&nbsp;?
                    </li>
                  ) : null}
                  <li>La dernière phrase est un point fort. Que change-t-elle au reste&nbsp;?</li>
                </ul>
              </div>
              <button type="button" onClick={restart} className={`${SECONDARY_BUTTON} w-full`}>
                Recommencer
              </button>
            </div>
          ) : (
            <div key="lire" className="grid gap-5">
              <p className="m-0 font-display text-2xl leading-tight font-semibold">À vous, d’abord</p>
              <p className="m-0 text-base text-muted">
                Marquez les phrases qui vous paraissent fragiles, comme vos élèves le feront sur leur feuille. Puis
                révélez l’analyse.
              </p>
              <p className="m-0 text-base" aria-live="polite">
                {marked.size
                  ? `${marked.size} phrase${marked.size > 1 ? 's' : ''} marquée${marked.size > 1 ? 's' : ''}`
                  : 'Aucune phrase marquée'}
              </p>
              <button type="button" onClick={() => setRevealed(true)} className={`${PRIMARY_BUTTON} w-full`}>
                Révéler l’analyse
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
