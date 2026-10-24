import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';

import { Badge } from './Brand';
import {
  CATEGORY_LABELS,
  DOMAINS,
  EXAMPLES,
  HERO_ARTICLE,
  HERO_REPORT,
  SCORE_BANDS,
  SEVERITY_COLORS,
  SEVERITY_LABELS,
  VERIFICATION_STATES,
  findingTone,
  formatPoints,
  scoreBand,
  type HighlightSeverity,
} from '../demo';

const SCORE = HERO_REPORT.marks.reduce((sum, mark) => sum + mark, 0);
const CARD_ID = 'hero-constat';

function tone(severity: HighlightSeverity): CSSProperties {
  const { color, tint, text } = SEVERITY_COLORS[severity];
  return { '--sev-color': color, '--sev-tint': tint, '--sev-text': text } as CSSProperties;
}

/** The panel's `ScoreRadialGauge` at its shipped size: 110 px, an 8 px stroke. */
function ScoreRing() {
  const band = SCORE_BANDS[scoreBand(SCORE)];
  const size = 110;
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <svg width={size} height={size} className="block -rotate-90" aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-border" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={SEVERITY_COLORS[band.tone].color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - SCORE / 100)}
          />
        </svg>
        <span className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-2xl leading-none font-bold tracking-tight">{SCORE}</span>
          <span className="mt-0.5 text-xs font-semibold tracking-widest text-muted uppercase">/ 100</span>
        </span>
      </div>
      <span
        className="mt-2 font-mono text-xs font-semibold tracking-wider uppercase"
        style={{ color: SEVERITY_COLORS[band.tone].text }}
      >
        {band.title}
      </span>
    </div>
  );
}

function DomainRow({ label, weight, mark }: { label: string; weight: number; mark: number }) {
  const percent = Math.round((mark / weight) * 100);
  return (
    <div className="flex items-start justify-between rounded-sm border border-border bg-surface p-3">
      <div className="min-w-0 flex-1 pr-2">
        <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
          <span className="min-w-0 leading-snug font-bold">{label}</span>
          <span className="shrink-0 font-mono font-semibold whitespace-nowrap text-muted tabular-nums">
            <strong className="text-foreground">{formatPoints(mark)}</strong> / {formatPoints(weight)} pts
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-lineSoft">
          <div
            className="h-full rounded-full"
            style={{ width: `${percent}%`, background: SEVERITY_COLORS[SCORE_BANDS[scoreBand(percent)].tone].color }}
          />
        </div>
      </div>
      <span aria-hidden="true" className="shrink-0 pl-1 font-mono text-xs text-faint">
        ▼
      </span>
    </div>
  );
}

/** The panel's `FindingCard`, for the finding selected in the article. */
function FindingCard({ index }: { index: number }) {
  const finding = EXAMPLES[index];
  const style = tone(findingTone(finding.severity, finding.category));
  const verification = VERIFICATION_STATES.find((state) => state.state === finding.verification);
  return (
    <div
      key={index}
      className="hero-card rounded-lg border border-l-[3px] border-border border-l-(--sev-color) bg-surface p-3.5"
      style={style}
    >
      <div className="mb-1.5 flex flex-col items-start gap-1.5">
        <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold tracking-wider text-(--sev-text) uppercase">
          <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-xs bg-(--sev-color)" />
          {CATEGORY_LABELS[finding.category]}
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          {verification ? (
            <span
              className={`inline-flex items-center rounded-sm border px-2 py-0.5 font-mono text-sm font-semibold whitespace-nowrap ${verification.chip}`}
            >
              {verification.label}
            </span>
          ) : null}
          {finding.category === 'point-fort' ? null : (
            <span className="inline-flex items-center rounded-sm border border-(--sev-color)/50 bg-(--sev-color)/15 px-2 py-0.5 font-mono text-sm font-semibold tracking-wider text-(--sev-text) uppercase">
              {SEVERITY_LABELS[finding.severity]}
            </span>
          )}
        </span>
      </div>
      <p className="mb-1 font-serif text-sm font-semibold">{finding.label}</p>
      <p className="mb-2 border-l-2 border-l-(--sev-color)/60 pl-2 font-serif text-xs text-muted italic">
        {`«\u00a0${`${finding.before}${finding.mark}${finding.after}`.trim()}\u00a0»`}
      </p>
      <p className="m-0 text-xs leading-relaxed text-foreground/80">{finding.detail}</p>
    </div>
  );
}

/** A rebuilt copy of the extension's side panel, at its own scale and in its own tokens. */
function Panel({ selected, cardRef }: { selected: number; cardRef: RefObject<HTMLDivElement> }) {
  return (
    <div
      data-ui
      role="group"
      aria-label="Le rapport Squiggle sur cet article"
      className="rounded-card border border-border bg-background p-4 text-foreground"
    >
      <div className="flex items-start justify-between gap-2 border-b border-lineSoft pb-3">
        <div className="flex items-start gap-2">
          <Badge className="mt-0.5 h-6 w-6 shrink-0" />
          <div>
            <p className="m-0 font-display text-lg font-bold tracking-tight">Squiggle</p>
            <p className="m-0 text-xs text-muted">Analyse critique de la fiabilité de l’article</p>
          </div>
        </div>
        <span aria-hidden="true" className="flex items-center gap-1 text-sm text-muted">
          <span className="px-2 py-1.5">?</span>
          <span className="px-2 py-1.5">⚙</span>
        </span>
      </div>

      <div className="mt-4 grid gap-4">
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="m-0 text-sm font-semibold tracking-wider text-muted uppercase">Évaluation globale</p>
          <div className="mt-4 flex justify-center">
            <ScoreRing />
          </div>
          <p className="mt-3 mb-0 text-xs leading-relaxed text-foreground/80">{HERO_REPORT.summary}</p>
          <div className="mt-3 rounded-lg border border-border bg-surface p-2.5">
            <span className="block font-mono text-xs font-semibold tracking-wider text-muted uppercase">
              Vérification factuelle
            </span>
            <p className="mt-1 mb-0 text-xs leading-relaxed text-foreground/80">{HERO_REPORT.research}</p>
            <p className="mt-1 mb-0 text-xs leading-relaxed text-muted">
              Classement des affirmations : {HERO_REPORT.claims}.
            </p>
          </div>
        </div>

        {/* On a phone the panel sits under the article, and the five domains
            would push the selected finding a screen away from its passage. */}
        <div className="grid gap-2 max-md:hidden">
          <p className="m-0 text-sm font-semibold">Domaines évalués</p>
          <div className="grid gap-1.5">
            {DOMAINS.map(([label, weight], index) => (
              <DomainRow key={label} label={label} weight={weight} mark={HERO_REPORT.marks[index]} />
            ))}
          </div>
        </div>

        <div className="grid gap-3">
          <p className="m-0 text-sm font-semibold">Grille des constats</p>
          <div id={CARD_ID} ref={cardRef} aria-live="polite">
            <FindingCard index={selected} />
          </div>
        </div>
      </div>
    </div>
  );
}

type Line = { ax: number; ay: number; bx: number; by: number };

/**
 * The hero: the promise, an article as the reader sees it with Squiggle's
 * highlights, and the panel that explains them. Picking a highlight shows its
 * finding in the panel, as clicking one does in the extension; on a wide screen,
 * a guide line ties the two together.
 */
export function HeroScene({ children }: { children: ReactNode }) {
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
        by: target.top + 22 - box.top,
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
          style={{ ...tone(finding.sev), '--i': index } as CSSProperties}
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
    <div
      ref={sceneRef}
      className="relative grid gap-y-10 lg:grid-cols-[minmax(0,1fr)_25rem] lg:grid-rows-[auto_1fr] lg:gap-x-16"
    >
      <div>{children}</div>

      <article
        ref={sheetRef}
        aria-label="Un article d’exemple, surligné par Squiggle"
        className="self-start rounded-card bg-paper px-6 py-7 text-paperInk md:px-12 md:py-10"
      >
        <p className="m-0 text-base font-medium text-paperMuted">{HERO_ARTICLE.byline}</p>
        <p className="mt-2 mb-0 font-serif text-3xl leading-tight font-semibold tracking-tight md:text-4xl">
          {HERO_ARTICLE.title}
        </p>
        {HERO_ARTICLE.paragraphs.map((parts, index) => (
          <p key={index} className="mt-5 mb-0 font-serif text-lg leading-[1.6] md:text-xl">
            {parts.map((part) => (typeof part === 'number' ? highlight(part) : part))}
          </p>
        ))}
      </article>

      <div className="md:max-lg:mx-auto md:max-lg:w-[25rem] lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <Panel selected={selected} cardRef={cardRef} />
      </div>

      {line ? (
        // Sized to the gap it spans, so the overlay never sits on the text.
        <svg
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
          <circle cx={0} cy={y0} r={3.5} className="fill-accent stroke-paper" strokeWidth={1.5} />
          <circle cx={line.bx - line.ax} cy={y1} r={3.5} className="fill-accent stroke-surface" strokeWidth={1.5} />
        </svg>
      ) : null}
    </div>
  );
}
