/**
 * The hero's trial: the sample article, already pasted, and one button. The
 * report it shows was written in advance (`example.ts`), so trying costs no
 * analysis and needs no account; the card says so, and says that a real
 * article takes a minute or two. Once read, each highlight opens its finding,
 * and the next step is the reader's own article.
 */
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';

import {
  CATEGORY_LABELS,
  EXAMPLES,
  HERO_ARTICLE,
  HERO_REPORT,
  SCORE_BANDS,
  SEVERITY_COLORS,
  SEVERITY_LABELS,
  VERIFICATION_STATES,
  findingTone,
  scoreBand,
  type HighlightSeverity,
} from '../demo';
import { FREE_ANALYSES } from '../offer';
import { Link } from '../router';
import { PRIMARY_BUTTON, QUIET_LINK } from './Landing';

const SCORE = HERO_REPORT.marks.reduce((sum, mark) => sum + mark, 0);
const BAND = SCORE_BANDS[scoreBand(SCORE)];
const CARD_ID = 'essai-constat';

function tone(severity: HighlightSeverity): CSSProperties {
  const { color, tint, text } = SEVERITY_COLORS[severity];
  return { '--sev-color': color, '--sev-tint': tint, '--sev-text': text } as CSSProperties;
}

function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** The finding a highlight opens, as the full report words it. */
function Constat({ index }: { index: number }) {
  const finding = EXAMPLES[index];
  const verification = VERIFICATION_STATES.find((state) => state.state === finding.verification);
  return (
    <div
      key={index}
      className="hero-card rounded-card border border-border bg-background p-5"
      style={tone(findingTone(finding.severity, finding.category))}
    >
      <p className="m-0 flex items-center gap-2 text-base font-medium text-(--sev-text)">
        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-(--sev-color)" />
        {CATEGORY_LABELS[finding.category]}
      </p>
      <h3 className="mt-2 mb-0 text-lg leading-snug font-semibold">{finding.label}</h3>
      {verification || finding.category !== 'point-fort' ? (
        <p className="mt-2 mb-0 flex flex-wrap gap-1.5">
          {verification ? (
            <span className={`inline-flex rounded-md border px-2 py-0.5 text-sm font-medium ${verification.chip}`}>
              {verification.label}
            </span>
          ) : null}
          {finding.category !== 'point-fort' ? (
            <span className="inline-flex rounded-md border border-border px-2 py-0.5 text-sm font-medium text-muted">
              {SEVERITY_LABELS[finding.severity]}
            </span>
          ) : null}
        </p>
      ) : null}
      <p className="mt-3 mb-0 text-base leading-relaxed">{finding.detail}</p>
    </div>
  );
}

export function Essai() {
  const [read, setRead] = useState(false);
  const [selected, setSelected] = useState(HERO_REPORT.selected);
  const result = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLElement>(null);
  const [counted, setCounted] = useState(0);

  // The score counts up as the passages land; with reduced motion it is simply there.
  useEffect(() => {
    if (!read) return setCounted(0);
    if (reducedMotion()) return setCounted(SCORE);
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 900);
      setCounted(Math.round(SCORE * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [read]);

  function analyse() {
    setRead(true);
    // The result region takes the focus, so it is announced; on a phone, where the
    // text was cut short, the reader is brought back to its top to see it marked.
    requestAnimationFrame(() => {
      result.current?.focus({ preventScroll: true });
      if (window.matchMedia?.('(max-width: 1023px)').matches) {
        sheet.current?.scrollIntoView?.({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
      }
    });
  }

  const pick = (index: number) => () => setSelected(index);
  const onKey = (index: number) => (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    setSelected(index);
  };

  const passage = (index: number, order: number) => {
    const finding = EXAMPLES[index];
    if (!read) return <span key={index}>{`${finding.before}${finding.mark}${finding.after}`}</span>;
    return (
      <span key={index}>
        {finding.before}
        <mark
          role="button"
          tabIndex={0}
          aria-pressed={selected === index}
          aria-controls={CARD_ID}
          aria-label={`${finding.mark}, ${finding.label.toLowerCase()} : voir le constat`}
          onClick={pick(index)}
          onMouseEnter={pick(index)}
          onFocus={pick(index)}
          onKeyDown={onKey(index)}
          className="hero-hl"
          style={{ ...tone(finding.sev), '--i': order } as CSSProperties}
        >
          {finding.mark}
        </mark>
        {finding.after}
      </span>
    );
  };

  let order = 0;
  return (
    <div data-ui className="grid overflow-hidden bg-surface max-sm:-mx-5 sm:rounded-card lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <article
        aria-label="Un article d’exemple, déjà collé"
        ref={sheet}
        className={`scroll-mt-4 bg-paper px-5 py-6 text-paperInk sm:px-8 sm:py-8 lg:px-10 ${read ? '' : 'essai-clamp'}`}
      >
        <p className="m-0 text-base font-medium text-paperMuted">Tribune, un article d’exemple</p>
        <p className="mt-1.5 mb-0 font-serif text-2xl leading-tight font-semibold tracking-tight sm:text-3xl">
          {HERO_ARTICLE.title}
        </p>
        {HERO_ARTICLE.paragraphs.map((parts, index) => (
          <p key={index} className="mt-4 mb-0 font-serif text-lg leading-[1.6] sm:text-xl">
            {parts.map((part) => (typeof part === 'number' ? passage(part, order++) : part))}
          </p>
        ))}
      </article>

      <div
        ref={result}
        tabIndex={-1}
        aria-live="polite"
        className={`grid gap-5 p-5 outline-hidden focus-visible:ring-0 sm:p-8 lg:p-10 ${read ? 'content-start' : 'content-start lg:content-center'}`}
      >
        {read ? (
          <>
            <div>
              <p className="m-0 flex items-baseline gap-2">
                <span className="font-display text-6xl leading-none font-semibold tracking-tight tabular-nums">
                  {counted}
                </span>
                <span className="text-lg text-muted">sur 100</span>
              </p>
              <p className="mt-2 mb-0 text-xl font-semibold" style={{ color: SEVERITY_COLORS[BAND.tone].text }}>
                {BAND.title}
              </p>
            </div>
            <div id={CARD_ID}>
              <Constat index={selected} />
            </div>
            <p className="m-0 text-base text-muted">Touchez un autre passage surligné pour lire son constat.</p>
            <div className="grid gap-3">
              <Link to="/analyser" className={`${PRIMARY_BUTTON} w-full`}>
                À votre tour : collez un article
              </Link>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <Link to="/analyser?exemple" className={QUIET_LINK}>
                  Voir le rapport complet
                </Link>
                <span className="text-base text-muted">{FREE_ANALYSES} analyses offertes</span>
              </div>
            </div>
            <p className="m-0 text-base text-muted">Exemple analysé à l’avance. Un vrai article prend une à deux minutes.</p>
          </>
        ) : (
          <>
            <p className="m-0 text-xl font-semibold max-lg:hidden">Le deuxième avis</p>
            <p className="m-0 text-base leading-relaxed text-muted max-lg:hidden">
              La note sur 100, les passages fragiles et la raison de chacun s’affichent ici.
            </p>
            <button type="button" onClick={analyse} className={`${PRIMARY_BUTTON} w-full`}>
              Analyser cet exemple
            </button>
            <p className="m-0 text-base text-muted">Gratuit et sans compte : cet exemple ne compte pas.</p>
          </>
        )}
      </div>
    </div>
  );
}
