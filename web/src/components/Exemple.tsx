import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type RefObject } from 'react';

import {
  CATEGORY_LABELS,
  EXAMPLES,
  HERO_ARTICLE,
  HERO_REPORT,
  SCORE_BANDS,
  SEVERITY_COLORS,
  VERIFICATION_STATES,
  findingTone,
  scoreBand,
  type HighlightSeverity,
} from '../demo';

const SCORE = HERO_REPORT.marks.reduce((sum, mark) => sum + mark, 0);
const BAND = SCORE_BANDS[scoreBand(SCORE)];
const CARD_ID = 'exemple-constat';
const STRENGTHS = EXAMPLES.filter((finding) => finding.category === 'point-fort').length;
const PASSAGES = EXAMPLES.length - STRENGTHS;

function tone(severity: HighlightSeverity): CSSProperties {
  const { color, tint, text } = SEVERITY_COLORS[severity];
  return { '--sev-color': color, '--sev-tint': tint, '--sev-text': text } as CSSProperties;
}

/** The note as the report states it: the score, its band, and what it rests on. */
function Score() {
  const size = 64;
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} className="block shrink-0 -rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-border" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={SEVERITY_COLORS[BAND.tone].color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - SCORE / 100)}
        />
      </svg>
      <div>
        <p className="m-0 flex items-baseline gap-1.5 leading-none">
          <span className="font-mono text-4xl font-semibold tracking-tight">{SCORE}</span>
          <span className="text-base text-muted">sur 100</span>
        </p>
        <p className="mt-1.5 mb-0 text-base font-semibold" style={{ color: SEVERITY_COLORS[BAND.tone].text }}>
          {BAND.title}
        </p>
      </div>
    </div>
  );
}

/** The finding the reader picked in the article. */
function FindingCard({ index }: { index: number }) {
  const finding = EXAMPLES[index];
  const style = tone(findingTone(finding.severity, finding.category));
  const verification = VERIFICATION_STATES.find((state) => state.state === finding.verification);
  return (
    <div key={index} className="hero-card grid gap-2.5" style={style}>
      <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-(--sev-text)">
          <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-(--sev-color)" />
          {CATEGORY_LABELS[finding.category]}
        </span>
        {verification ? (
          <span
            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-sm font-medium ${verification.chip}`}
          >
            {verification.label}
          </span>
        ) : null}
      </p>
      <p className="m-0 font-display text-2xl leading-tight font-semibold tracking-[-0.01em]">{finding.label}</p>
      <p className="m-0 border-l-2 border-l-(--sev-color) pl-3 font-serif text-lg leading-snug text-muted italic">
        {`« ${`${finding.before}${finding.mark}${finding.after}`.trim()} »`}
      </p>
      <p className="m-0 text-base leading-relaxed text-foreground/85">{finding.detail}</p>
    </div>
  );
}

function Report({ selected, cardRef }: { selected: number; cardRef: RefObject<HTMLDivElement> }) {
  return (
    <div
      data-ui
      role="group"
      aria-label="Le rapport Squiggle sur cet article"
      className="grid content-start gap-6 rounded-card border border-border bg-surface p-5 md:p-6"
    >
      <Score />
      <p className="m-0 text-base text-muted">
        {PASSAGES} passages fragiles, {STRENGTHS} point fort.
      </p>
      <div id={CARD_ID} ref={cardRef} aria-live="polite" className="border-t border-border pt-5">
        <FindingCard index={selected} />
      </div>
    </div>
  );
}

type Line = { ax: number; ay: number; bx: number; by: number };

/**
 * The example: an article as the reader sees it with Squiggle's highlights, and
 * the report beside it. Picking a highlight shows its finding, as clicking one
 * does in the product; on a wide screen a leader line ties the two together.
 */
export function Exemple() {
  const [selected, setSelected] = useState(HERO_REPORT.selected);
  const [line, setLine] = useState<Line | null>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const marks = useRef<Array<HTMLElement | null>>([]);

  useLayoutEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const draw = () => {
      const mark = marks.current[selected];
      const card = cardRef.current;
      const sheet = sheetRef.current;
      const wide = typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 1024px)').matches;
      const rects = mark?.getClientRects?.();
      if (!wide || !card || !sheet || !rects?.length) return setLine(null);
      const box = scene.getBoundingClientRect();
      const end = rects[rects.length - 1];
      const target = card.getBoundingClientRect();
      // The line leaves from the sheet's edge, level with the passage, so it
      // never crosses the article's text.
      setLine({
        ax: sheet.getBoundingClientRect().right - box.left,
        ay: end.top + end.height / 2 - box.top,
        bx: target.left - box.left,
        by: target.top + 12 - box.top,
      });
    };
    draw();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(draw);
    observer?.observe(scene);
    void document.fonts?.ready.then(draw);
    return () => observer?.disconnect();
  }, [selected]);

  const pick = (index: number) => () => setSelected(index);
  const onKey = (index: number) => (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    setSelected(index);
  };

  const highlight = (index: number) => {
    const finding = EXAMPLES[index];
    return (
      <span key={index}>
        {finding.before}
        <mark
          ref={(node) => {
            marks.current[index] = node;
          }}
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
          style={tone(finding.sev)}
        >
          {finding.mark}
        </mark>
        {finding.after}
      </span>
    );
  };

  const curve = line ? (line.bx - line.ax) / 2 : 0;
  const top = line ? Math.min(line.ay, line.by) : 0;
  const y0 = line ? line.ay - top : 0;
  const y1 = line ? line.by - top : 0;

  return (
    <div ref={sceneRef} className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-20">
      <article
        ref={sheetRef}
        aria-label="Un article d’exemple, surligné par Squiggle"
        className="self-start rounded-card bg-paper px-5 py-7 text-paperInk sm:px-8 md:px-12 md:py-11"
      >
        <p className="m-0 text-base font-medium text-paperMuted">{HERO_ARTICLE.byline}, un article d’exemple</p>
        <p className="mt-2 mb-0 font-serif text-3xl leading-tight font-semibold tracking-tight md:text-4xl">
          {HERO_ARTICLE.title}
        </p>
        {HERO_ARTICLE.paragraphs.map((parts, index) => (
          <p key={index} className="mt-5 mb-0 font-serif text-lg leading-[1.65] md:text-xl">
            {parts.map((part) => (typeof part === 'number' ? highlight(part) : part))}
          </p>
        ))}
      </article>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <Report selected={selected} cardRef={cardRef} />
      </div>

      {line ? (
        // Sized to the gap it spans, so the overlay never sits on the text.
        <svg
          key={selected}
          aria-hidden="true"
          className="hero-line pointer-events-none absolute overflow-visible"
          style={{
            left: line.ax,
            top,
            width: line.bx - line.ax,
            height: Math.abs(line.by - line.ay),
          }}
        >
          <path
            d={`M 0 ${y0} C ${curve} ${y0}, ${curve} ${y1}, ${line.bx - line.ax} ${y1}`}
            fill="none"
            className="stroke-accent"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            strokeLinecap="round"
          />
          <circle cx={0} cy={y0} r={3.5} className="fill-accent stroke-background" strokeWidth={1.5} />
          <circle cx={line.bx - line.ax} cy={y1} r={3.5} className="fill-accent stroke-surface" strokeWidth={1.5} />
        </svg>
      ) : null}
    </div>
  );
}
