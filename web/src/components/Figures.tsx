/**
 * The small isometric drawings that carry the explanations: each one is built
 * from the kernel in `iso.tsx`, is decorative (the words sit beside it), and
 * finishes building itself the first time it is seen.
 */
import type { CSSProperties, ReactNode } from 'react';

import { DOMAINS, HERO_REPORT, SCORE_BANDS, SEVERITY_COLORS, scoreBand } from '../demo';
import { useSeen } from '../motion';
import { Box, Lines, corners, front, top, viewBoxFor, type Point } from './iso';

const SCORE = HERO_REPORT.marks.reduce((sum, mark) => sum + mark, 0);
const WARNING = SEVERITY_COLORS.warning.color;
const CRITICAL = SEVERITY_COLORS.critical.color;
const INFO = SEVERITY_COLORS.info.color;

function Figure({ points, className = '', children }: { points: Point[]; className?: string; children: ReactNode }) {
  const [ref, seen] = useSeen<SVGSVGElement>();
  return (
    <svg
      ref={ref}
      viewBox={viewBoxFor(points, 8)}
      aria-hidden="true"
      data-seen={seen}
      className={`iso-figure block h-full w-full ${className}`}
    >
      {children}
    </svg>
  );
}

/** A passage marked on a sheet's top plane: the overlay's tint and its underline. */
function Mark({ x, y, w, color, i = 0 }: { x: number; y: number; w: number; color: string; i?: number }) {
  return (
    <g className="build-mark" style={{ '--i': i } as CSSProperties}>
      <rect x={x} y={y - 2} width={w} height={7} rx={2} fill={color} fillOpacity={0.3} />
      <rect x={x} y={y + 5} width={w} height={1.4} fill={color} />
    </g>
  );
}

/** A score screen on a front plane: the number, its band and the five domain bars. */
function ScoreScreen({ w, h }: { w: number; h: number }) {
  const band = SCORE_BANDS[scoreBand(SCORE)];
  return (
    <>
      <rect x={5} y={5} width={w - 10} height={h - 10} rx={5} className="iso-screen" />
      <text x={12} y={46} className="iso-score-value build-fade">
        {SCORE}
      </text>
      <text x={13} y={62} className="iso-band build-fade" fill={SEVERITY_COLORS[band.tone].text}>
        {band.title.toLowerCase()}
      </text>
      {DOMAINS.map(([label, weight], index) => {
        const percent = HERO_REPORT.marks[index] / weight;
        const tone = SCORE_BANDS[scoreBand(Math.round(percent * 100))].tone;
        return (
          <g key={label}>
            <rect x={12} y={76 + index * 10} width={w - 24} height={4} rx={2} className="iso-track" />
            <rect
              x={12}
              y={76 + index * 10}
              width={(w - 24) * percent}
              height={4}
              rx={2}
              fill={SEVERITY_COLORS[tone].color}
              className="build-bar"
              style={{ '--i': index } as CSSProperties}
            />
          </g>
        );
      })}
    </>
  );
}

/** Step 1: an article lands on a phone. */
export function PasteFigure() {
  return (
    <Figure points={[...corners(0, 0, 0, 96, 156, 8), ...corners(12, 22, 8, 72, 112, 30)]}>
      <Box x={0} y={0} z={0} w={96} d={156} h={8} r={12}>
        <rect transform={top(0, 0, 8)} x={7} y={12} width={82} height={132} rx={6} className="iso-screen" />
      </Box>
      <g className="build-drop">
        <Box x={12} y={22} z={8} w={72} d={112} h={2} className="iso-paper" />
        <g transform={top(12, 22, 10)}>
          <rect x={8} y={8} width={42} height={6} rx={2} className="iso-ink" />
          <Lines widths={[56, 50, 56, 38, 0, 56, 52, 30]} x={8} y={24} gap={10} height={3} />
        </g>
      </g>
    </Figure>
  );
}

/** Step 2: the lens has read half the sheet and flagged what it found there. */
export function ReadFigure() {
  return (
    <Figure points={[...corners(0, 0, 0, 110, 150, 3), ...corners(-6, -8, 26, 122, 80, 6)]}>
      <Box x={0} y={0} z={0} w={110} d={150} h={3} className="iso-paper" />
      <g transform={top(0, 0, 3)}>
        <rect x={10} y={10} width={60} height={7} rx={2} className="iso-ink" />
        <Lines widths={[90, 84, 90, 52, 0, 90, 86, 90, 60, 0, 90, 70]} x={10} y={28} gap={10} height={3} />
        <Mark x={40} y={38} w={44} color={WARNING} />
        <Mark x={10} y={58} w={40} color={CRITICAL} i={1} />
      </g>
      <g className="build-sweep" style={{ '--sweep': 'translate(-56px, 32px)' } as CSSProperties}>
        <rect transform={front(-6, 2, 26)} width={122} height={23} className="iso-beam" />
        <Box x={-6} y={-8} z={26} w={122} d={10} h={6} r={2} className="iso-accent" />
      </g>
    </Figure>
  );
}

/** Step 3: the report stands up, with its score. */
export function ReportFigure() {
  return (
    <Figure points={[...corners(0, 0, 0, 130, 60, 6), ...corners(10, 14, 6, 110, 10, 140)]}>
      <Box x={0} y={0} z={0} w={130} d={60} h={6} r={6} />
      <Box x={10} y={14} z={6} w={110} d={10} h={140} r={4}>
        <g transform={front(10, 24, 146)}>
          <ScoreScreen w={110} h={140} />
        </g>
      </Box>
    </Figure>
  );
}

/** Neutrality: three articles, the same grid laid on each. */
export function GridFigure() {
  return (
    <Figure points={[...corners(0, 0, 0, 160, 70, 2)]}>
      {[0, 56, 112].map((x, n) => (
        <g key={x}>
          <Box x={x} y={0} z={0} w={44} d={70} h={2} className="iso-paper" />
          <g transform={top(x, 0, 2)}>
            {[0, 1, 2, 3, 4].map((row) => (
              <g key={row}>
                <rect x={6} y={8 + row * 12} width={32} height={4} rx={2} className="iso-text" />
                <rect
                  x={6}
                  y={8 + row * 12}
                  width={32 * [0.9, 0.6, 0.75, 0.5, 0.8][row]}
                  height={4}
                  rx={2}
                  className="iso-ink build-bar"
                  style={{ '--i': n * 2 + row } as CSSProperties}
                />
              </g>
            ))}
          </g>
        </g>
      ))}
    </Figure>
  );
}

/** Neutrality: the method, published as code anyone can read. */
export function OpenFigure() {
  return (
    <Figure points={[...corners(0, 0, 0, 120, 50, 4), ...corners(8, 10, 4, 104, 8, 80)]}>
      <Box x={0} y={0} z={0} w={120} d={50} h={4} r={4} />
      <Box x={8} y={10} z={4} w={104} d={8} h={80} r={3}>
        <g transform={front(8, 18, 84)}>
          <rect x={5} y={5} width={94} height={70} rx={4} className="iso-screen" />
          <text x={12} y={24} className="iso-code">
            {'{ grille }'}
          </text>
          {[60, 44, 70, 36].map((width, row) => (
            <rect
              key={row}
              x={row % 2 ? 22 : 12}
              y={34 + row * 9}
              width={width}
              height={4}
              rx={2}
              className={row === 1 ? 'iso-accent-fill build-bar' : 'iso-ink-dark build-bar'}
              style={{ '--i': row } as CSSProperties}
            />
          ))}
        </g>
      </Box>
    </Figure>
  );
}

/** Neutrality: the text is examined; the person beside it is not. */
export function TextFigure() {
  return (
    <Figure points={[...corners(0, 0, 0, 80, 100, 2), ...corners(96, 30, 0, 26, 26, 64)]}>
      <Box x={0} y={0} z={0} w={80} d={100} h={2} className="iso-paper" />
      <g transform={top(0, 0, 2)}>
        <rect x={8} y={8} width={40} height={6} rx={2} className="iso-ink" />
        <Lines widths={[62, 56, 62, 40, 0, 62, 50]} x={8} y={24} gap={10} height={3} />
        <Mark x={20} y={34} w={42} color={WARNING} />
      </g>
      <g className="iso-ghost">
        <Box x={96} y={30} z={0} w={26} d={26} h={44} r={8} />
        <Box x={100} y={34} z={46} w={18} d={18} h={18} r={9} />
      </g>
    </Figure>
  );
}

/** Data flow: the reader's browser. */
export function BrowserFigure() {
  return (
    <Figure points={[...corners(0, 0, 0, 90, 60, 4), ...corners(0, 0, 4, 90, 5, 58)]}>
      <Box x={0} y={0} z={0} w={90} d={60} h={4} r={4} />
      <Box x={0} y={0} z={4} w={90} d={5} h={58} r={3}>
        <g transform={front(0, 5, 62)}>
          <rect x={5} y={5} width={80} height={48} rx={3} className="iso-screen" />
          <rect x={12} y={12} width={40} height={5} rx={2} className="iso-ink-dark" />
          {[0, 1, 2].map((row) => (
            <rect key={row} x={12} y={24 + row * 8} width={[62, 54, 60][row]} height={3} rx={1.5} className="iso-ink-dark" />
          ))}
        </g>
      </Box>
    </Figure>
  );
}

/** Data flow: our server, which holds no article text. */
export function ServerFigure() {
  return (
    <Figure points={corners(0, 0, 0, 50, 50, 84)}>
      <Box x={0} y={0} z={0} w={50} d={50} h={84} r={4}>
        <g transform={front(0, 50, 84)}>
          {[0, 1, 2].map((rack) => (
            <g key={rack}>
              <rect x={6} y={8 + rack * 25} width={38} height={18} rx={2} className="iso-detail" />
              {[0, 1, 2, 3].map((vent) => (
                <line key={vent} x1={12 + vent * 6} y1={13 + rack * 25} x2={12 + vent * 6} y2={21 + rack * 25} className="iso-detail" />
              ))}
              <circle cx={38} cy={17 + rack * 25} r={2} className="iso-led" />
            </g>
          ))}
        </g>
      </Box>
    </Figure>
  );
}

/** Data flow: the analysis, a lens over the sheet. */
export function LensFigure() {
  return (
    <Figure points={[...corners(0, 0, 0, 70, 90, 2), ...corners(-4, 30, 22, 78, 8, 5)]}>
      <Box x={0} y={0} z={0} w={70} d={90} h={2} className="iso-paper" />
      <g transform={top(0, 0, 2)}>
        <Lines widths={[54, 48, 54, 30, 0, 54, 44]} x={8} y={10} gap={10} height={3} />
        <Mark x={20} y={20} w={30} color={INFO} />
      </g>
      <rect transform={front(-4, 38, 22)} width={78} height={20} className="iso-beam" />
      <Box x={-4} y={30} z={22} w={78} d={8} h={5} r={2} className="iso-accent" />
    </Figure>
  );
}

/** Data flow: the report, kept 30 days with its short excerpts. */
export function ReportTileFigure() {
  return (
    <Figure points={[...corners(0, 0, 0, 74, 40, 4), ...corners(6, 8, 4, 62, 6, 84)]}>
      <Box x={0} y={0} z={0} w={74} d={40} h={4} r={4} />
      <Box x={6} y={8} z={4} w={62} d={6} h={84} r={3}>
        <g transform={front(6, 14, 88)}>
          <rect x={4} y={4} width={54} height={76} rx={4} className="iso-screen" />
          <text x={9} y={30} className="iso-score-small">
            {SCORE}
          </text>
          {[0, 1, 2, 3, 4].map((row) => (
            <rect key={row} x={9} y={40 + row * 7} width={[40, 30, 36, 24, 34][row]} height={3} rx={1.5} className="iso-ink-dark" />
          ))}
        </g>
      </Box>
    </Figure>
  );
}

/** The teachers' page: an article on the board, the class in front of it. */
export function ClassroomFigure() {
  const desks = [16, 88, 160];
  return (
    <Figure points={[...corners(-12, -12, -6, 248, 150, 6), ...corners(0, 0, 0, 224, 8, 132)]}>
      <Box x={-12} y={-12} z={-6} w={248} d={150} h={6} r={10} className="iso-mat">
        <g transform={top(-12, -12, 0)}>
          {Array.from({ length: 7 }, (_, i) => (
            <line key={i} x1={30 * (i + 1)} y1={6} x2={30 * (i + 1)} y2={144} className="iso-detail" />
          ))}
        </g>
      </Box>
      <Box x={0} y={0} z={0} w={224} d={8} h={132} r={4}>
        <g transform={front(0, 8, 132)}>
          <rect x={8} y={8} width={208} height={116} rx={4} className="iso-screen" />
          <rect x={44} y={16} width={136} height={100} rx={3} className="iso-paper-flat" />
          <rect x={56} y={26} width={70} height={7} rx={2} className="iso-ink" />
          <Lines widths={[110, 104, 110, 70, 0, 110, 96, 110]} x={56} y={42} gap={9} height={3} />
          <Mark x={84} y={51} w={52} color={WARNING} />
          <Mark x={56} y={87} w={70} color={CRITICAL} i={1} />
        </g>
      </Box>
      {desks.map((x, n) => (
        <g key={x} className="build-rise" style={{ '--i': n } as CSSProperties}>
          <Box x={x} y={84} z={0} w={48} d={32} h={22} r={4}>
            <g transform={top(x, 84, 22)}>
              <rect x={10} y={6} width={22} height={18} rx={2} className="iso-paper-flat" />
            </g>
          </Box>
        </g>
      ))}
    </Figure>
  );
}

/** The sign-in page: the eight-character code, each key lighting up as it is typed. */
export function CodeFigure({ value = '' }: { value?: string }) {
  return (
    <Figure points={corners(0, 0, 0, 176, 100, 14)}>
      <Box x={0} y={0} z={0} w={176} d={100} h={6} r={8} />
      {Array.from({ length: 8 }, (_, n) => {
        const key = value[n] ?? '';
        const x = 8 + (n % 4) * 42;
        const y = 8 + Math.floor(n / 4) * 46;
        // Keyed by its character, a key that receives one is new and plays its press.
        return (
          <g key={`${n}-${key}`} className={key ? 'code-key is-typed' : 'code-key'}>
            <Box x={x} y={y} z={6} w={34} d={34} h={8} r={5}>
              <text transform={top(x, y, 14)} x={17} y={23} className="iso-keycap">
                {key || '·'}
              </text>
            </Box>
          </g>
        );
      })}
    </Figure>
  );
}

export interface Station {
  figure: ReactNode;
  title: string;
  note?: ReactNode;
}

/**
 * A sequence read left to right on a wide screen and top to bottom on a phone:
 * each station a drawing, a number and a line, joined by an arrow.
 */
export function Stations({ label, items, size = 'md' }: { label: string; items: Station[]; size?: 'md' | 'sm' }) {
  return (
    <ol aria-label={label} className={`stations m-0 grid list-none gap-4 p-0 ${size === 'sm' ? 'stations-sm' : ''}`}>
      {items.map((item, index) => (
        <li
          key={item.title}
          className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-4 rounded-card border border-border bg-surface p-4 sm:block sm:p-5"
        >
          <div className={size === 'md' ? 'h-24 sm:h-44' : 'h-20 sm:h-28'}>{item.figure}</div>
          <div>
            <span className="block font-mono text-[13px] font-medium tracking-[0.16em] text-accentInk sm:mt-4">
              {String(index + 1).padStart(2, '0')}
            </span>
            <h3 className="mt-1 mb-0 font-display text-xl font-semibold">{item.title}</h3>
            {item.note ? <p className="mt-2 mb-0 text-base leading-relaxed text-pretty text-muted">{item.note}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
