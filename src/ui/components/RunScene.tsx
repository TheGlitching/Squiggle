/**
 * The analysis running, drawn in the site's isometric language: the article as
 * a paper sheet, Squiggle's reading as a violet glass sheet laid over it. The
 * loop is the stage the engine is in, read from its own progress events, and
 * nothing in the scene is a result: the marks are the drawings the landing
 * explains, not this article's findings. Without motion, each stage is a still
 * (`.run-*` in `src/index.css`).
 *
 * It mirrors `RunScene` in `web/src/components/Iso.tsx` (the web app's loading
 * scene) at the extension's scale; change the two together.
 */
import type { CSSProperties } from 'react';
import type { PipelineStage } from '@squiggle/shared';

import { darkTheme } from '../tokens/colors';

/** The three stages an analysis really goes through in the panel. */
export type RunStep = 'lecture' | 'recherche' | 'verification';

/**
 * The engine's stage, as one of the three. Reading the page and the audit
 * count as the reading; parsing the audit opens the research; the server's
 * reconcile-and-rescore is the verification.
 */
export function runStepOf(stage: PipelineStage | undefined): RunStep {
  if (stage === 'parsing_response' || stage === 'researching') return 'recherche';
  if (stage === 'scoring' || stage === 'storing' || stage === 'success') return 'verification';
  return 'lecture';
}

type Severity = 'critical' | 'warning' | 'info';

const COS = Math.cos(Math.PI / 6);
type V3 = readonly [number, number, number];
const n = (value: number) => Math.round(value * 1000) / 1000;

function iso(ox: number, oy: number) {
  const P = (x: number, y: number, z: number): [number, number] => [(x - y) * COS + ox, (x + y) * 0.5 - z + oy];
  const D = (x: number, y: number, z: number) => [(x - y) * COS, (x + y) * 0.5 - z];
  const plane = (o: V3, u: V3, v: V3) => {
    const [px, py] = P(...o);
    const [ux, uy] = D(...u);
    const [vx, vy] = D(...v);
    return `matrix(${n(ux)} ${n(uy)} ${n(vx)} ${n(vy)} ${n(px)} ${n(py)})`;
  };
  return {
    P,
    top: (x: number, y: number, z: number) => plane([x, y, z], [1, 0, 0], [0, 1, 0]),
    front: (x: number, y: number, z: number) => plane([x, y, z], [1, 0, 0], [0, 0, -1]),
    side: (x: number, y: number, z: number) => plane([x, y, z], [0, -1, 0], [0, 0, -1]),
  };
}

type Iso = ReturnType<typeof iso>;

/** A box seen from above: its right side, its left side, then its top. */
function Box({ v, at: [x, y, z], size: [w, d, h], r = 0, face, edge }: { v: Iso; at: V3; size: V3; r?: number; face: string; edge: string }) {
  const rs = Math.min(r, h / 4);
  return (
    <g>
      <rect className={`iso-face ${edge}`} transform={v.side(x + w, y + d, z + h)} width={d} height={h} rx={rs} />
      <rect className={`iso-face ${edge}`} transform={v.front(x, y + d, z + h)} width={w} height={h} rx={rs} />
      <rect className={`iso-face ${face}`} transform={v.top(x, y, z + h)} width={w} height={d} rx={r} />
    </g>
  );
}

/** Text lines on a sheet, as grey bars: `[y, from, to]` in the sheet's own units. */
function Lines({ lines, fill = '#a3a1a6', h = 4 }: { lines: Array<readonly [number, number, number]>; fill?: string; h?: number }) {
  return (
    <>
      {lines.map(([y, from, to]) => (
        <rect key={`${y}-${from}`} x={from} y={y} width={to - from} height={h} rx={h / 2} fill={fill} />
      ))}
    </>
  );
}

/** A wavy underline, the proofreader's mark the product is named after. */
function squiggle(x: number, y: number, width: number, amp = 2, step = 6): string {
  let d = `M ${x} ${y}`;
  for (let i = 0, cx = x; cx < x + width - 0.1; i += 1, cx += step) {
    const end = Math.min(cx + step, x + width);
    d += ` Q ${n((cx + end) / 2)} ${n(y + (i % 2 ? amp : -amp))} ${n(end)} ${y}`;
  }
  return d;
}

/** A passage marked on Squiggle's sheet: its tint, and the squiggle under it. */
function Mark({ x, y, w, severity, h = 9 }: { x: number; y: number; w: number; severity: Severity; h?: number }) {
  const tone = darkTheme.severity[severity];
  return (
    <g>
      <rect x={x - 2} y={y - (h - 4) / 2} width={w + 4} height={h} rx={2.5} fill={tone.border} fillOpacity={0.8} />
      <path
        d={squiggle(x - 1, y + h / 2 + 3, w + 2)}
        className="iso-line"
        stroke={tone.fill}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </g>
  );
}

const articleLines = (top: number, step: number, count: number, left: number, width: number, short: number[]) =>
  Array.from(
    { length: count },
    (_, i) => [top + i * step, left, left + (short.includes(i) ? width * 0.62 : width - (i % 3) * 6)] as const,
  );

export function RunScene({ step }: { step: RunStep }) {
  const v = iso(140, 40);
  const W = 120;
  const D = 150;
  const Z = 30;
  const body = articleLines(36, 11, 10, 14, 90, [4, 8]);
  const cards = [10, 86];
  const marks: Array<[number, number, number, Severity]> = [
    [34, 1, 54, 'warning'],
    [14, 5, 44, 'info'],
    [24, 7, 62, 'critical'],
  ];
  // The mark the sources are read for: the second line of the article.
  const [fx, fy] = v.P(76, body[1][0] + 2, Z);

  return (
    <svg viewBox="0 4 254 218" className="block h-auto w-full overflow-visible" aria-hidden="true">
      <Box v={v} at={[0, 0, 0]} size={[W, D, 2]} r={3} face="iso-paper" edge="iso-paper-edge" />
      <g transform={v.top(0, 0, 2)}>
        <rect x={14} y={14} width={70} height={9} rx={2} fill="var(--paper-ink)" />
        <Lines lines={body} />
      </g>

      {step !== 'lecture'
        ? cards.map((y, index) => (
            <g key={y} className={step === 'recherche' ? 'run-card' : undefined} style={{ '--i': index } as CSSProperties}>
              <Box v={v} at={[156, y, 0]} size={[50, 62, 3]} r={2} face="iso-solid" edge="iso-solid-side" />
              <g transform={v.top(156, y, 3)}>
                <Lines
                  lines={[
                    [12, 9, 40],
                    [21, 9, 34],
                    [30, 9, 38],
                    [39, 9, 30],
                  ]}
                  fill="#55555d"
                  h={3.5}
                />
                {step === 'verification' ? (
                  <path
                    d="M 17 50 L 23 55 L 34 44"
                    className="iso-line run-tick"
                    stroke="var(--accent-ink)"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    pathLength={1}
                    style={{ '--i': index } as CSSProperties}
                  />
                ) : null}
              </g>
            </g>
          ))
        : null}

      <g transform={v.top(0, 0, Z)}>
        <rect className="iso-face iso-glass" width={W} height={D} rx={4} />
        {step === 'lecture' ? (
          <>
            {/* The text read against the five domains of the grid, line by line. */}
            {[0, 1, 2, 3, 4].map((row) => (
              <path
                key={row}
                d={`M 10 ${26 + row * 24} H ${W - 10}`}
                className="iso-line"
                stroke="var(--accent-ink)"
                strokeOpacity={0.35}
              />
            ))}
            <rect className="run-scan" x={6} y={4} width={W - 12} height={5} rx={2.5} fill="var(--accent-ink)" />
          </>
        ) : null}
        {step === 'recherche' ? <Mark x={body[1][1]} y={body[1][0]} w={62} severity="warning" /> : null}
        {step === 'verification'
          ? marks.map(([x, line, w, severity], index) => (
              <g key={line} className="run-mark" style={{ '--i': index } as CSSProperties}>
                <Mark x={x} y={body[line][0]} w={w} severity={severity} />
              </g>
            ))
          : null}
      </g>

      {/* Drawn over the sheet, so each line leaves from the mark. */}
      {step === 'recherche'
        ? cards.map((y, index) => {
            const [bx, by] = v.P(156, y + 31, 3);
            return (
              <path
                key={y}
                d={`M ${fx} ${fy} L ${bx} ${by}`}
                className="iso-line run-flow"
                stroke="var(--accent-ink)"
                strokeDasharray="3 4"
                style={{ '--i': index } as CSSProperties}
              />
            );
          })
        : null}
    </svg>
  );
}

/** The stages in order, each with its name in the panel. */
const STEPS: Array<[RunStep, string]> = [
  ['lecture', 'Lecture'],
  ['recherche', 'Recherche des sources'],
  ['verification', 'Vérification et note'],
];

/**
 * Where the analysis stands: the scene for the stage under way, beside the
 * three stages, the current one carrying the engine's own live message. It
 * follows the engine's events and never paces itself, so a stage the text
 * does not need (no fact to look up) passes as quickly as it runs.
 */
export function RunProgress({ stage, message }: { stage: PipelineStage | undefined; message: string }) {
  const step = runStepOf(stage);
  const current = STEPS.findIndex(([key]) => key === step);
  return (
    <div className="space-y-4 rounded-xl border border-line bg-panel p-4">
      {/* Remounted on each stage, so the new loop starts from its beginning. */}
      <div key={step} className="run-scene mx-auto w-full max-w-60">
        <RunScene step={step} />
      </div>
      <ol className="space-y-2.5">
        {STEPS.map(([key, label], index) => (
          <li key={key} aria-current={index === current ? 'step' : undefined} className="flex gap-2.5">
            <span
              aria-hidden="true"
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs font-semibold tabular-nums ${
                index < current
                  ? 'border-accent bg-accent text-accent-foreground'
                  : index === current
                    ? 'border-accent text-accent-hover'
                    : 'border-line text-muted'
              }`}
            >
              {index < current ? '✓' : index + 1}
            </span>
            <span className="grid min-w-0 gap-0.5">
              <span className={`mt-0.5 text-sm ${index === current ? 'font-semibold text-ink' : index < current ? 'text-ink' : 'text-muted'}`}>
                {label}
                {index < current ? <span className="sr-only"> : fait</span> : null}
                {index === current ? <span className="sr-only"> : en cours</span> : null}
              </span>
              {index === current ? (
                <span aria-hidden="true" className="text-xs leading-relaxed text-muted">
                  {message}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
      {/* One live region for the whole run: the visible line moves from stage to stage. */}
      <p role="status" aria-live="polite" className="sr-only">
        {message}
      </p>
    </div>
  );
}
