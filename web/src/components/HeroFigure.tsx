/**
 * The hero's figure: the example article lying on a desk, read by Squiggle.
 * The first time it is seen, a lens sweeps the sheet and the passages it flags
 * light up behind it; the report stands at the back with its score. A passage,
 * picked on the sheet or in the list under it, shows its finding in plain text,
 * which is the figure's output: what the reader would get on their own article.
 *
 * Everything the reader can act on is HTML under the drawing; the drawing
 * itself is one labelled image. The report is in the DOM from the first paint,
 * so the motion only ever reveals it and never withholds it from assistive
 * technology.
 */
import { useEffect, useState, type CSSProperties } from 'react';

import {
  CATEGORY_LABELS,
  DOMAINS,
  EXAMPLES,
  HERO_REPORT,
  SCORE_BANDS,
  SEVERITY_COLORS,
  VERIFICATION_STATES,
  findingTone,
  scoreBand,
} from '../demo';
import { usePrefersReducedMotion, useSeen } from '../motion';
import { Link } from '../router';
import { Box, Lines, Plate, corners, front, project, top, viewBoxFor } from './iso';

const SCORE = HERO_REPORT.marks.reduce((sum, mark) => sum + mark, 0);
const BAND = SCORE_BANDS[scoreBand(SCORE)];
const SWEEP_MS = 1500;
const START_MS = 450;

// The scene, in iso units: a desk mat, the sheet on it, the report standing at the back.
const MAT = { x: 0, y: 0, z: 0, w: 420, d: 300, h: 10 };
const SHEET = { x: 24, y: 24, z: 10, w: 200, d: 260, h: 3 };
const PANEL = { x: 262, y: 40, z: 10, w: 140, d: 12, h: 180 };
const LENS = { x: 12, w: 224, d: 14, z: 40, h: 8, from: -10, to: 276 };
const SURFACE = SHEET.z + SHEET.h;

/** Body lines of the sheet, by width; `0` is a paragraph break. */
const LINES = [168, 168, 162, 168, 96, 0, 168, 168, 168, 168, 132, 0, 168, 150, 110];
const LINE_TOP = 76;
const LINE_GAP = 12;
const lineY = (line: number) => LINE_TOP + line * LINE_GAP;

/** Where each example's passage sits on the sheet: a line, and a span along it. */
const PASSAGES: Array<Array<{ line: number; from: number; to: number }>> = [
  [{ line: 1, from: 78, to: 120 }],
  [{ line: 3, from: 112, to: 176 }],
  [{ line: 6, from: 66, to: 136 }],
  [
    { line: 7, from: 126, to: 184 },
    { line: 8, from: 16, to: 112 },
  ],
  [{ line: 9, from: 56, to: 116 }],
];

const VIEW_BOX = viewBoxFor(
  [
    ...corners(MAT.x, MAT.y, MAT.z, MAT.w, MAT.d, MAT.h),
    ...corners(PANEL.x, PANEL.y, PANEL.z, PANEL.w, PANEL.d, PANEL.h),
    ...corners(LENS.x, LENS.from, LENS.z, LENS.w, LENS.to - LENS.from + LENS.d, LENS.h),
  ],
  14,
);

/** The lens's sweep, on screen: from its first depth to its last. */
const [sweepX, sweepY] = project(0, LENS.to - LENS.from, 0);

/** When the lens's front edge reaches a line, as a share of the sweep. */
function revealDelay(line: number): number {
  const reach = (SHEET.y + lineY(line) - (LENS.from + LENS.d)) / (LENS.to - LENS.from);
  return Math.round(reach * SWEEP_MS * 0.92);
}

type Phase = 'idle' | 'scan' | 'done';

/** The point on the sheet a passage's leader line leaves from, on screen. */
function anchor(index: number): [number, number] {
  const { line, from, to } = PASSAGES[index][0];
  return project(SHEET.x + (from + to) / 2, SHEET.y + lineY(line) + 2, SURFACE);
}
const TARGET = project(PANEL.x, PANEL.y + PANEL.d, PANEL.z + PANEL.h - 64);

/** The desk mat: a cutting-mat grid on top, ribs along its front edge. */
function Mat() {
  return (
    <Box {...MAT} r={10} className="iso-mat">
      <g transform={top(MAT.x, MAT.y, MAT.z + MAT.h)}>
        {Array.from({ length: 13 }, (_, i) => (
          <line key={`u${i}`} x1={30 * (i + 1)} y1={8} x2={30 * (i + 1)} y2={MAT.d - 8} className="iso-detail" />
        ))}
        {Array.from({ length: 9 }, (_, i) => (
          <line key={`v${i}`} x1={8} y1={30 * (i + 1)} x2={MAT.w - 8} y2={30 * (i + 1)} className="iso-detail" />
        ))}
      </g>
      <g transform={front(MAT.x, MAT.y + MAT.d, MAT.z + MAT.h)}>
        {Array.from({ length: 33 }, (_, i) => (
          <line key={i} x1={18 + i * 12} y1={3} x2={18 + i * 12} y2={7} className="iso-detail" />
        ))}
      </g>
    </Box>
  );
}

function Sheet({ selected, onPick }: { selected: number; onPick: (index: number) => void }) {
  return (
    <g>
      <Box {...SHEET} className="iso-paper" />
      <g transform={top(SHEET.x, SHEET.y, SURFACE)}>
        <text x={16} y={22} className="iso-byline">
          TRIBUNE
        </text>
        <text x={16} y={42} className="iso-headline">
          Lecture : une
        </text>
        <text x={16} y={60} className="iso-headline">
          génération perdue ?
        </text>
        {LINES.map((width, line) =>
          width ? <Lines key={line} widths={[width]} x={16} y={lineY(line)} className="iso-text" /> : null,
        )}
      </g>
      {PASSAGES.map((spans, index) => {
        const { color } = SEVERITY_COLORS[EXAMPLES[index].sev];
        return (
          <g
            key={index}
            className="iso-hl"
            data-selected={selected === index || undefined}
            onPointerDown={() => onPick(index)}
          >
            <g transform={top(SHEET.x, SHEET.y, SURFACE)}>
              {spans.map(({ line, from, to }) => (
                <g
                  key={line}
                  className="iso-hl-mark"
                  style={{ '--d': `${revealDelay(line)}ms` } as CSSProperties}
                >
                  <rect x={from} y={lineY(line) - 2} width={to - from} height={8} rx={2} fill={color} fillOpacity={0.3} />
                  <rect x={from} y={lineY(line) + 6} width={to - from} height={1.6} fill={color} />
                </g>
              ))}
            </g>
          </g>
        );
      })}
    </g>
  );
}

function Lens() {
  return (
    <g className="iso-lens" style={{ '--sweep': `translate(${sweepX}px, ${sweepY}px)` } as CSSProperties}>
      {/* The light it casts: a curtain down to the sheet, and the line it draws there. */}
      <rect
        transform={front(LENS.x, LENS.from + LENS.d, LENS.z)}
        width={LENS.w}
        height={LENS.z - SURFACE}
        className="iso-beam"
      />
      <rect transform={top(LENS.x, LENS.from + LENS.d - 1, SURFACE)} width={LENS.w} height={1.5} className="iso-scanline" />
      <Box x={LENS.x} y={LENS.from} z={LENS.z} w={LENS.w} d={LENS.d} h={LENS.h} r={3} className="iso-accent">
        <path
          transform={top(LENS.x, LENS.from, LENS.z + LENS.h)}
          d="M 70 7 Q 80 2 90 7 T 110 7 T 130 7 T 150 7"
          className="iso-squiggle"
        />
      </Box>
    </g>
  );
}

function Panel() {
  return (
    <g className="iso-panel">
      <Box {...PANEL} r={4} />
      <g transform={front(PANEL.x, PANEL.y + PANEL.d, PANEL.z + PANEL.h)}>
        <rect x={6} y={6} width={PANEL.w - 12} height={PANEL.h - 12} rx={6} className="iso-screen" />
        <text x={16} y={26} className="iso-caption">
          DEUXIÈME AVIS
        </text>
        <g className="iso-score">
          <text x={15} y={72} className="iso-score-value">
            {SCORE}
          </text>
          <text x={72} y={72} className="iso-caption">
            / 100
          </text>
          <text x={16} y={92} className="iso-band" fill={SEVERITY_COLORS[BAND.tone].text}>
            {BAND.title.toLowerCase()}
          </text>
        </g>
        {DOMAINS.map(([label, weight], index) => {
          const percent = HERO_REPORT.marks[index] / weight;
          const tone = SCORE_BANDS[scoreBand(Math.round(percent * 100))].tone;
          return (
            <g key={label}>
              <rect x={16} y={108 + index * 12} width={108} height={5} rx={2.5} className="iso-track" />
              <rect
                x={16}
                y={108 + index * 12}
                width={108 * percent}
                height={5}
                rx={2.5}
                fill={SEVERITY_COLORS[tone].color}
                className="iso-bar"
                style={{ '--i': index } as CSSProperties}
              />
            </g>
          );
        })}
      </g>
    </g>
  );
}

function Leader({ selected }: { selected: number }) {
  const [ax, ay] = anchor(selected);
  const [bx, by] = TARGET;
  const cx = (ax + bx) / 2;
  const cy = Math.min(ay, by) - 46;
  return (
    <g key={selected} className="iso-leader">
      <path d={`M ${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`} />
      <circle cx={ax} cy={ay} r={3} />
      <circle cx={bx} cy={by} r={3} />
    </g>
  );
}

/** The selected finding, as the report card states it. */
function Finding({ index }: { index: number }) {
  const finding = EXAMPLES[index];
  const tone = SEVERITY_COLORS[findingTone(finding.severity, finding.category)];
  const verification = VERIFICATION_STATES.find((state) => state.state === finding.verification);
  return (
    <div
      key={index}
      className="finding-card rounded-card border border-border border-l-[3px] bg-background p-4 sm:p-5"
      style={{ borderLeftColor: tone.color }}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="font-mono text-[13px] font-semibold tracking-[0.12em] uppercase" style={{ color: tone.text }}>
          {CATEGORY_LABELS[finding.category]}
        </span>
        {verification ? (
          <span className={`rounded-md border px-2 py-0.5 font-mono text-[13px] font-semibold ${verification.chip}`}>
            {verification.label}
          </span>
        ) : null}
      </div>
      <p className="mt-2 mb-0 font-display text-xl font-semibold tracking-tight">{finding.label}</p>
      <p className="mt-3 mb-0 rounded-control bg-paper px-3 py-2.5 font-serif text-lg leading-relaxed text-paperInk">
        {finding.before.trimStart()}
        <mark
          className="annot"
          style={{ '--sev-color': SEVERITY_COLORS[finding.sev].color, '--sev-tint': SEVERITY_COLORS[finding.sev].tint } as CSSProperties}
        >
          {finding.mark}
        </mark>
        {finding.after}
      </p>
      <p className="mt-3 mb-0 text-base leading-relaxed text-muted">{finding.detail}</p>
    </div>
  );
}

export function HeroFigure() {
  const reduced = usePrefersReducedMotion();
  const [ref, seen] = useSeen<SVGSVGElement>(0.6);
  // Without an observer to start it, the figure shows its finished state.
  const animated = !reduced && typeof IntersectionObserver !== 'undefined';
  const [phase, setPhase] = useState<Phase>(animated ? 'idle' : 'done');
  const [selected, setSelected] = useState(HERO_REPORT.selected);
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (!animated) {
      setPhase('done');
      return;
    }
    if (!seen) return;
    setPhase('idle');
    const scan = window.setTimeout(() => setPhase('scan'), START_MS);
    const done = window.setTimeout(() => setPhase('done'), START_MS + SWEEP_MS);
    return () => {
      window.clearTimeout(scan);
      window.clearTimeout(done);
    };
  }, [animated, seen, run]);

  const readout =
    phase === 'done'
      ? `${SCORE}/100 · ${BAND.title.replace('Article ', '')} · passage ${selected + 1}/${EXAMPLES.length}`
      : phase === 'scan'
        ? 'lecture…'
        : 'en attente';

  return (
    <Plate
      fig="1"
      name="Un article, relu"
      hint={phase === 'done' ? 'Touchez un passage surligné' : 'Lecture de l’exemple'}
      readout={readout}
      action={
        animated && phase === 'done' ? (
          <button type="button" onClick={() => setRun((n) => n + 1)} className="plate-action">
            Rejouer
          </button>
        ) : null
      }
    >
      <div className="mt-2 grid gap-x-10 gap-y-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
        <svg
          ref={ref}
          viewBox={VIEW_BOX}
          role="img"
          aria-label={`Un article d’exemple posé sur un bureau, relu par Squiggle : ${EXAMPLES.length} passages surlignés et une note de ${SCORE} sur 100.`}
          className="iso-figure hero-figure block h-auto w-full"
          data-phase={phase}
        >
          <Mat />
          <Sheet selected={selected} onPick={setSelected} />
          <Lens />
          <Panel />
          {phase === 'done' ? <Leader selected={selected} /> : null}
        </svg>

        <div className="hero-findings grid gap-4 pb-2" data-phase={phase}>
          <div role="group" aria-label="Les passages surlignés" className="flex flex-wrap gap-2">
            {EXAMPLES.map((example, index) => (
              <button
                key={example.label}
                type="button"
                aria-pressed={selected === index}
                aria-controls="hero-constat"
                onClick={() => setSelected(index)}
                className="passage-chip"
                style={{ '--sev-color': SEVERITY_COLORS[example.sev].color } as CSSProperties}
              >
                <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-(--sev-color)" />
                {example.label}
              </button>
            ))}
          </div>
          <div id="hero-constat" aria-live="polite">
            <Finding index={selected} />
          </div>
          <p className="m-0 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 text-base text-muted">
            Article d’exemple, analysé à l’avance.
            <Link to="/analyser" className="font-medium text-accentInk hover:text-foreground">
              À votre tour : collez un article <span aria-hidden="true">→</span>
            </Link>
          </p>
        </div>
      </div>
    </Plate>
  );
}
