/**
 * The projected board: what the class sees, and nothing else. The article with
 * its sentences numbered as on the student sheet, the sentences the class
 * proposed, and only the findings the teacher has revealed so far. Every size
 * is a share of the frame (`.board` in index.css), so the same board reads from
 * the back of a classroom and fits in a corner of the teacher's desk.
 */
import { useEffect, useMemo, useRef, type ReactNode } from 'react';

import type { Finding } from '../../../shared/src/engine/types';
import { CATEGORY_LABELS, SCORE_BANDS, VERIFICATION_STATES, type DemoCategory } from '../demo';
import { deckOf, placeOf, questionFor, tally, type ClassState, type Layout, type Run, type Seance } from '../classe';
import { frenchDate } from '../format';
import { passageTone } from '../report';
import { Badge } from './Brand';
import { tone } from './Exemple';

const VERIFICATION = Object.fromEntries(VERIFICATION_STATES.map((v) => [v.state, v.label]));

const GUIDE = [
  'Un chiffre sans source ?',
  'Un mot qui juge à la place des faits ?',
  'Une conclusion qui va trop vite ?',
  'Sait-on qui parle ?',
];

export const categoryOf = (finding: Finding) => CATEGORY_LABELS[finding.category as DemoCategory] ?? finding.category;

/** The board's footer line: what it shows, when it was made, and that it can be wrong. */
export function mention(seance: Seance): string {
  const at = Date.parse(seance.report.meta.analyzedAt);
  const date = frenchDate(Number.isNaN(at) ? null : at);
  return seance.fromFile
    ? `Séance ouverte depuis un fichier · analyse automatisée${date ? ` du ${date}` : ''} · elle peut se tromper`
    : `Analyse automatisée Squiggle${date ? ` · ${date}` : ''} · elle peut se tromper`;
}

/**
 * A block's sentences, numbered: the passages in `shown` highlighted, the
 * sentences the class proposed marked. The preparation also numbers each
 * passage with its place in the reveal order (`badge`).
 */
export function Sentences({
  runs,
  shown,
  current,
  marks,
  badge,
}: {
  runs: Run[];
  shown: Set<string>;
  current: string | null;
  marks: Record<number, number> | null;
  badge?: (finding: Finding) => number | null;
}) {
  return runs.map((run, index) => {
    let revealedHere = false;
    const content = run.parts.map((part, at) => {
      const lead = part.findings.find((f) => shown.has(f.id));
      if (!lead) return part.text;
      revealedHere = true;
      const order = badge && part.starts.includes(lead) ? badge(lead) : null;
      return (
        <mark
          key={at}
          data-finding={lead.id}
          className={`annot board-hl${lead.id === current ? ' is-current' : ''}`}
          style={tone(passageTone(lead))}
        >
          {order ? (
            <span className="board-order" aria-label={`constat ${order}`}>
              {order}
            </span>
          ) : null}
          {part.text}
        </mark>
      );
    });
    if (run.n === null) return <span key={index}>{content}</span>;
    const hands = marks?.[run.n];
    const marked = hands !== undefined;
    return (
      <span key={index} data-phrase={run.n}>
        <span className="board-num">{run.n}</span>
        {/* Once a finding shows in a sentence the class proposed, only its wash stays: the two never fight. */}
        <span className={`board-phrase${marked ? ' is-marked' : ''}${marked && revealedHere ? ' is-done' : ''}`}>
          {content}
        </span>
        {hands ? (
          <span className="board-hands">
            {hands} main{hands > 1 ? 's' : ''}
          </span>
        ) : null}
      </span>
    );
  });
}

function Card({ children, finding }: { children: ReactNode; finding?: Finding }) {
  return (
    <div className="board-card" style={finding ? tone(passageTone(finding)) : undefined}>
      {children}
    </div>
  );
}

function Panel({ seance, layout, state }: { seance: Seance; layout: Layout; state: ClassState }) {
  const deck = deckOf(seance);
  if (state.phase === 'lecture') {
    return (
      <>
        <p className="board-tag">Étape 1 · Lecture</p>
        <p className="board-big">Lisez. Soulignez ce qui vous paraît fragile.</p>
        <Card>
          {GUIDE.map((line) => (
            <p key={line} className="board-text">
              {line}
            </p>
          ))}
        </Card>
      </>
    );
  }
  if (state.phase === 'reperage') {
    const count = Object.keys(state.marks).length;
    return (
      <>
        <p className="board-tag">Étape 2 · Repérage</p>
        <p className="board-big">Ce que la classe a souligné</p>
        <Card>
          <p className="board-text">
            {count
              ? `${count} phrase${count > 1 ? 's' : ''} proposée${count > 1 ? 's' : ''}.`
              : 'Proposez une phrase par son numéro.'}
          </p>
          <p className="board-question">Pourquoi celle-là ? Qu’est-ce qui vous a arrêté ?</p>
        </Card>
      </>
    );
  }
  if (state.phase === 'revelation') {
    const finding = state.revealed > 0 ? deck[state.revealed - 1] : null;
    if (!finding) {
      return (
        <>
          <p className="board-tag">Étape 3 · Révélation</p>
          <p className="board-big">Voici ce que Squiggle a relevé.</p>
          <Card>
            <p className="board-text">Un passage à la fois. Avant chacun : l’aviez-vous vu ?</p>
          </Card>
        </>
      );
    }
    const place = placeOf(layout, finding);
    const verification = finding.verification ? VERIFICATION[finding.verification] : null;
    return (
      <>
        <p className="board-tag">
          Étape 3 · {state.revealed} sur {deck.length}
        </p>
        {/* Keyed, so each finding arrives as a new card rather than a text swap. */}
        <div key={finding.id} className="hero-card">
          <Card finding={finding}>
            <p className="board-row">
              <span className="board-dot" aria-hidden="true" />
              <span className="text-(--sev-text)">
                {categoryOf(finding)}
                {verification ? ` · ${verification}` : ''}
                {place ? <span className="whitespace-nowrap"> · {place}</span> : null}
              </span>
            </p>
            <p className="board-big">{finding.label}</p>
            {place ? null : <p className="board-text italic">« {finding.quote} »</p>}
            <p className="board-text">{finding.explanation}</p>
            <p className="board-question">{questionFor(finding)}</p>
          </Card>
        </div>
      </>
    );
  }

  const { weak, found, extra, marked } = tally(seance, layout, state);
  return (
    <>
      <p className="board-tag">Étape 4 · Bilan</p>
      <p className="board-big">
        Passages fragiles repérés par la classe : {found} sur {weak}
      </p>
      <Card>
        {deck.map((finding) => {
          const seen = marked(finding);
          const strength = finding.category === 'point-fort';
          const status = strength ? (seen ? 'souligné, à débattre' : 'point fort') : seen ? 'repéré' : 'manqué';
          return (
            <p key={finding.id} className="board-row" style={tone(passageTone(finding))}>
              <span className="board-dot" aria-hidden="true" />
              <span className="grow">{finding.label}</span>
              <span className={seen && !strength ? 'font-semibold' : 'text-muted'}>{status}</span>
            </p>
          );
        })}
      </Card>
      {extra ? (
        <p className="board-text">
          {extra > 1 ? `${extra} phrases soulignées n’ont` : 'Une phrase soulignée n’a'} aucun constat. Qui a raison ?
        </p>
      ) : null}
      <p className="board-question">Squiggle peut se tromper : sur quel constat n’êtes-vous pas d’accord ?</p>
    </>
  );
}

/** Scroll the article itself, never the page around it, to bring a passage to the middle. */
function centre(container: HTMLElement | null, selector: string) {
  const target = container?.querySelector<HTMLElement>(selector);
  if (!container || !target) return;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  container.scrollTo?.({
    top: target.offsetTop - container.clientHeight / 2 + target.offsetHeight / 2,
    behavior: reduced ? 'auto' : 'smooth',
  });
}

export function Board({
  seance,
  layout,
  state,
  label = 'Le tableau',
}: {
  seance: Seance;
  layout: Layout;
  state: ClassState;
  label?: string;
}) {
  const article = useRef<HTMLElement>(null);
  const deck = useMemo(() => deckOf(seance), [seance]);
  const count = state.phase === 'bilan' ? deck.length : state.phase === 'revelation' ? state.revealed : 0;
  const shown = new Set(deck.slice(0, count).map((f) => f.id));
  const current = state.phase === 'revelation' && state.revealed > 0 ? (deck[state.revealed - 1]?.id ?? null) : null;
  const band = SCORE_BANDS[seance.report.scoreBand];

  // The passage just revealed, or the sentence just proposed, comes into view.
  const previous = useRef<Record<number, number>>(state.marks);
  useEffect(() => {
    if (current) centre(article.current, `[data-finding="${current}"]`);
  }, [current]);
  useEffect(() => {
    const added = Object.keys(state.marks).find((n) => !(n in previous.current));
    previous.current = state.marks;
    if (added) centre(article.current, `[data-phrase="${added}"]`);
  }, [state.marks]);

  return (
    <div className="board" data-black={state.black} role="region" aria-label={label}>
      <div className="board-grid">
        <article ref={article} className="board-paper" aria-label="L’article">
          {layout.blocks.map(({ block, runs }) => {
            const text = (
              <Sentences
                runs={runs}
                shown={shown}
                current={current}
                marks={state.phase === 'lecture' ? null : state.marks}
              />
            );
            return block.type === 'heading' ? (
              <h2 key={block.id} className="board-title">
                {text}
              </h2>
            ) : (
              <p key={block.id}>{text}</p>
            );
          })}
        </article>
        <aside className="board-panel" aria-live="polite">
          {state.showScore ? (
            <p className="board-score" style={tone(band.tone)}>
              <span>
                <b className="tabular-nums">{Math.round(seance.report.score)}</b>/100
              </span>
              · {band.title}
            </p>
          ) : null}
          <Panel seance={seance} layout={layout} state={state} />
        </aside>
      </div>
      <footer className="board-foot">
        <span className="board-brand">
          <Badge />
          squiggle
        </span>
        <span>{mention(seance)}</span>
      </footer>
    </div>
  );
}
