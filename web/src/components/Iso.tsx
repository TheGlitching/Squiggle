/**
 * The site's drawings, in one isometric system. Every shape is an ordinary flat
 * rect or path drawn in a face's own coordinates, and one SVG `matrix()` lays it
 * on its plane, so lines of text and highlights sit in perspective for free.
 * Axes: +x runs down-right, +y down-left, +z up.
 *
 * Two materials carry the meaning in every figure: paper is the article, the
 * violet glass is Squiggle's reading laid over it. Severity tones only ever mark
 * a passage, as they do in the product.
 */
import type { CSSProperties, ReactNode } from 'react';

import { SEVERITY_COLORS, type HighlightSeverity } from '../demo';

const COS = Math.cos(Math.PI / 6);
type V3 = readonly [number, number, number];
const n = (value: number) => Math.round(value * 1000) / 1000;

export interface Iso {
  P: (x: number, y: number, z: number) => [number, number];
  top: (x: number, y: number, z: number) => string;
  front: (x: number, y: number, z: number) => string;
  side: (x: number, y: number, z: number) => string;
}

export function iso(ox = 0, oy = 0): Iso {
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
    top: (x, y, z) => plane([x, y, z], [1, 0, 0], [0, 1, 0]),
    front: (x, y, z) => plane([x, y, z], [1, 0, 0], [0, 0, -1]),
    side: (x, y, z) => plane([x, y, z], [0, -1, 0], [0, 0, -1]),
  };
}

/** A box seen from above: its right side, its left side, then its top. */
export function Box({
  at: [x, y, z],
  size: [w, d, h],
  v,
  r = 0,
  face = 'iso-solid',
  edge = 'iso-solid-side',
}: {
  at: V3;
  size: V3;
  v: Iso;
  r?: number;
  face?: string;
  edge?: string;
}) {
  const rs = Math.min(r, h / 4);
  return (
    <g>
      <rect className={`iso-face ${edge}`} transform={v.side(x + w, y + d, z + h)} width={d} height={h} rx={rs} />
      <rect className={`iso-face ${edge}`} transform={v.front(x, y + d, z + h)} width={w} height={h} rx={rs} />
      <rect className={`iso-face ${face}`} transform={v.top(x, y, z + h)} width={w} height={d} rx={r} />
    </g>
  );
}

/** A wavy underline, the proofreader's mark the product is named after. */
export function squiggle(x: number, y: number, width: number, amp = 2.2, step = 7): string {
  let d = `M ${x} ${y}`;
  for (let i = 0, cx = x; cx < x + width - 0.1; i += 1, cx += step) {
    const end = Math.min(cx + step, x + width);
    d += ` Q ${n((cx + end) / 2)} ${n(y + (i % 2 ? amp : -amp))} ${n(end)} ${y}`;
  }
  return d;
}

/** The "opens elsewhere" arrow, drawn in the links' own stroke. */
export function ExternalMark() {
  return (
    <svg viewBox="0 0 12 12" className="ml-1 inline-block h-3 w-3 align-baseline" aria-hidden="true">
      <path
        d="M 3 9 L 9 3 M 4.5 3 H 9 V 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A list bullet in the product's own mark. */
export function SquiggleMark() {
  return (
    <svg viewBox="0 0 22 10" className="mt-2.5 h-2.5 w-5.5 shrink-0" aria-hidden="true">
      <path
        d={squiggle(1, 5, 20, 2.6, 5)}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth={1.75}
        strokeLinecap="round"
      />
    </svg>
  );
}

function tint(severity: HighlightSeverity, alpha = 0.42): string {
  return SEVERITY_COLORS[severity].tint.replace(/[\d.]+\)$/, `${alpha})`);
}

/** Text lines on a sheet, as grey bars: `[y, from, to]` in the sheet's own units. */
function Lines({
  lines,
  fill = '#a3a1a6',
  h = 5,
}: {
  lines: Array<readonly [number, number, number]>;
  fill?: string;
  h?: number;
}) {
  return (
    <>
      {lines.map(([y, from, to]) => (
        <rect key={`${y}-${from}`} x={from} y={y} width={to - from} height={h} rx={h / 2} fill={fill} />
      ))}
    </>
  );
}

/** A passage marked on Squiggle's sheet: its tint, and the squiggle under it. */
function Mark({
  x,
  y,
  w,
  severity,
  i,
  h = 11,
}: {
  x: number;
  y: number;
  w: number;
  severity: HighlightSeverity;
  i?: number;
  h?: number;
}) {
  return (
    <g className={i === undefined ? undefined : 'iso-mark'} style={{ '--i': i } as CSSProperties}>
      <rect x={x - 2} y={y - (h - 5) / 2} width={w + 4} height={h} rx={2.5} fill={tint(severity)} />
      <path
        d={squiggle(x - 1, y + h / 2 + 3.5, w + 2, 2, 6)}
        className="iso-line"
        stroke={SEVERITY_COLORS[severity].color}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </g>
  );
}

/** A numbered pin, flat on the screen, that the legend under the figure explains. */
function Pin({ at: [x, y], label, i }: { at: [number, number]; label: string; i: number }) {
  return (
    <g className="iso-late" style={{ '--i': i } as CSSProperties}>
      <circle cx={x} cy={y} r={15} fill="var(--color-accent)" stroke="var(--color-background)" strokeWidth={3} />
      <text
        x={x}
        y={y + 6}
        textAnchor="middle"
        fontSize={17}
        fontWeight={700}
        fill="var(--color-accentForeground)"
        fontFamily="var(--font-sans)"
      >
        {label}
      </text>
    </g>
  );
}

/** A ring drawn on a plane: the note, as the report shows it. */
function ScoreRing({
  cx,
  cy,
  r,
  score,
  severity,
  label,
}: {
  cx: number;
  cy: number;
  r: number;
  score: number;
  severity: HighlightSeverity;
  label?: string;
}) {
  const c = 2 * Math.PI * r;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="#0f0f11" stroke="#3a3a42" strokeWidth={4} />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={SEVERITY_COLORS[severity].color}
        strokeWidth={4}
        strokeLinecap="round"
        strokeDasharray={`${n((c * score) / 100)} ${n(c)}`}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      {label ? (
        <text
          x={cx}
          y={cy + r * 0.32}
          textAnchor="middle"
          fontSize={r * 0.9}
          fontWeight={600}
          fill="#ece9e3"
          fontFamily="var(--font-display)"
        >
          {label}
        </text>
      ) : null}
    </g>
  );
}

/** A column of text lines from `left`, every third one a little shorter, the `short` ones ending a paragraph. */
const articleLines = (top: number, step: number, count: number, left: number, width: number, short: number[] = []) =>
  Array.from(
    { length: count },
    (_, i) => [top + i * step, left, left + (short.includes(i) ? width * 0.62 : width - (i % 3) * 6)] as const,
  );

/**
 * The hero: the article you read, and Squiggle's reading laid over it, with the
 * three things it adds pinned and explained in the legend. Without a legend
 * beside it (the store's promotional tiles), the pins are left out.
 */
export function HeroFigure({ pins = true }: { pins?: boolean }) {
  const v = iso(250, 92);
  const W = 210;
  const D = 272;
  const GLASS = 300;
  const Z = 54;
  const body = articleLines(78, 14, 13, 20, 166, [6, 12]);
  // The passages, on the article's own lines: [line, from, to, severity].
  const passages: Array<[number, number, number, HighlightSeverity]> = [
    [1, 72, 150, 'warning'],
    [4, 20, 96, 'info'],
    [9, 70, 168, 'warning'],
  ];
  const notes = passages.map(([line], index) => ({ y: body[line][0], index }));
  const at = (line: number, x: number, z: number) => v.P(x, body[line][0] + 2.5, z);
  const ring: [number, number] = [258, 44];

  return (
    <svg viewBox="0 0 540 340" className="block h-auto w-full overflow-visible" aria-hidden="true">
      {/* The article: a sheet of paper, as you read it. */}
      <Box v={v} at={[0, 0, 0]} size={[W, D, 3]} r={4} face="iso-paper" edge="iso-paper-edge" />
      <g transform={v.top(0, 0, 3)}>
        <rect x={20} y={20} width={44} height={5} rx={2.5} fill="#8c8a90" />
        <rect x={20} y={34} width={150} height={12} rx={3} fill="var(--color-paperInk)" />
        <rect x={20} y={51} width={98} height={12} rx={3} fill="var(--color-paperInk)" />
        <Lines lines={body} />
      </g>

      {/* Squiggle's sheet, settling over it. */}
      <g className="iso-settle">
        {passages.map(([line, from, to], index) => {
          const [ax, ay] = at(line, (from + to) / 2, 3);
          const [bx, by] = at(line, (from + to) / 2, Z);
          return (
            <line
              key={index}
              x1={ax}
              y1={ay}
              x2={bx}
              y2={by}
              className="iso-line"
              stroke="var(--color-accent)"
              strokeDasharray="3 3"
              strokeOpacity={0.8}
            />
          );
        })}
        <g transform={v.top(0, 0, Z)}>
          <rect className="iso-face iso-glass" width={GLASS} height={D} rx={6} />
          {passages.map(([line, from, to, severity], index) => (
            <Mark key={index} x={from} y={body[line][0]} w={to - from} severity={severity} i={index} />
          ))}
          {/* The margin: a short reason for each passage, tied to it. */}
          {notes.map(({ y, index }) => (
            <g key={index} className="iso-mark" style={{ '--i': index + 0.5 } as CSSProperties}>
              <path
                d={`M ${passages[index][2] + 4} ${y + 2.5} H 222`}
                className="iso-line"
                stroke="var(--color-accent)"
                strokeOpacity={0.7}
              />
              <rect x={226} y={y - 3} width={58} height={4.5} rx={2.25} fill="var(--color-accentInk)" />
              <rect x={226} y={y + 4} width={40} height={4.5} rx={2.25} fill="var(--color-accentInk)" opacity={0.6} />
            </g>
          ))}
          <g className="iso-late">
            <ScoreRing cx={ring[0]} cy={ring[1]} r={20} score={61} severity="warning" label="61" />
          </g>
        </g>
      </g>

      {pins ? (
        <>
          <Pin at={[at(1, 72, Z)[0] - 22, at(1, 72, Z)[1] - 4]} label="1" i={0} />
          <Pin at={[v.P(286, notes[2].y, Z)[0] + 20, v.P(286, notes[2].y, Z)[1] + 2]} label="2" i={1} />
          <Pin at={[v.P(ring[0] + 26, ring[1], Z)[0] + 16, v.P(ring[0] + 26, ring[1], Z)[1] - 6]} label="3" i={2} />
        </>
      ) : null}
    </svg>
  );
}

export type Step = 'article' | 'lecture' | 'sources' | 'rapport';

/** One stage of an analysis, in the hero's materials and at one shared scale. */
export function StepFigure({ step, live = false }: { step: Step; live?: boolean }) {
  const v = iso(step === 'sources' ? 116 : 130, 34);
  const W = 92;
  const D = 118;
  const Z = 26;
  const body = articleLines(30, 9, 9, 12, 66, [4, 8]);
  const glass = (children?: ReactNode) => (
    <g transform={v.top(0, 0, Z)} className={live ? 'step-live' : undefined}>
      <rect className="iso-face iso-glass" width={step === 'rapport' ? 128 : W} height={D} rx={4} />
      {children}
    </g>
  );

  return (
    <svg viewBox="0 0 250 170" className="block h-auto w-full overflow-visible" aria-hidden="true">
      <Box v={v} at={[0, 0, 0]} size={[W, D, 2]} r={3} face="iso-paper" edge="iso-paper-edge" />
      <g transform={v.top(0, 0, 2)}>
        <rect x={12} y={12} width={60} height={8} rx={2} fill="var(--color-paperInk)" />
        <Lines lines={body} h={3.5} />
      </g>

      {step === 'article' ? (
        // The article arrives: pasted, shared or opened in the browser.
        <g>
          <g transform={v.top(0, 0, 44)}>
            <rect
              width={W}
              height={D}
              rx={3}
              fill="none"
              stroke="var(--color-accent)"
              strokeDasharray="4 4"
              className="iso-line"
            />
          </g>
          {[
            [W / 2, 0],
            [0, D / 2],
            [W, D / 2],
          ].map(([x, y]) => {
            const [ax, ay] = v.P(x, y, 40);
            const [bx, by] = v.P(x, y, 8);
            return (
              <g key={`${x}-${y}`}>
                <path
                  d={`M ${ax} ${ay} L ${bx} ${by}`}
                  className="iso-line"
                  stroke="var(--color-accent)"
                  strokeWidth={1.5}
                />
                <path
                  d={`M ${bx - 4} ${by - 6} L ${bx} ${by} L ${bx + 4} ${by - 6}`}
                  className="iso-line"
                  stroke="var(--color-accent)"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            );
          })}
        </g>
      ) : null}

      {step === 'lecture'
        ? // The whole text, read against the five domains of one grid.
          glass(
            <>
              {[0, 1, 2, 3, 4].map((row) => (
                <path
                  key={row}
                  d={`M 8 ${22 + row * 20} H ${W - 8}`}
                  className="iso-line"
                  stroke="var(--color-accentInk)"
                  strokeOpacity={0.7}
                />
              ))}
            </>,
          )
        : null}

      {step === 'sources' ? (
        <>
          {glass(<Mark x={12} y={body[3][0]} w={52} severity="warning" h={8} />)}
          {/* Two sources, consulted for the one fact put in doubt. */}
          <Box v={v} at={[112, 6, 0]} size={[40, 52, 3]} r={2} />
          <Box v={v} at={[112, 66, 0]} size={[40, 52, 3]} r={2} />
          <g transform={v.top(112, 6, 3)}>
            <Lines
              lines={[
                [10, 8, 32],
                [18, 8, 28],
                [26, 8, 30],
              ]}
              fill="#55555d"
              h={3}
            />
          </g>
          <g transform={v.top(112, 66, 3)}>
            <Lines
              lines={[
                [10, 8, 32],
                [18, 8, 26],
                [26, 8, 30],
              ]}
              fill="#55555d"
              h={3}
            />
          </g>
          {[30, 92].map((y) => {
            const [ax, ay] = v.P(64, body[3][0] + 2, Z);
            const [bx, by] = v.P(112, y, 3);
            return (
              <path
                key={y}
                d={`M ${ax} ${ay} L ${bx} ${by}`}
                className="iso-line"
                stroke="var(--color-accent)"
                strokeDasharray="3 3"
              />
            );
          })}
        </>
      ) : null}

      {step === 'rapport'
        ? glass(
            <>
              <Mark x={30} y={body[1][0]} w={40} severity="warning" h={8} />
              <Mark x={12} y={body[4][0]} w={34} severity="info" h={8} />
              <Mark x={20} y={body[7][0]} w={46} severity="positive" h={8} />
              <ScoreRing cx={110} cy={24} r={11} score={61} severity="warning" />
            </>,
          )
        : null}
    </svg>
  );
}

export type Device = 'site' | 'appli' | 'navigateur';

/** The badge's own mark, flat on a face: the button that opens Squiggle. */
function BadgeMark({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s / 120})`}>
      <rect width={120} height={120} rx={30} fill="#9061f0" />
      <rect x={26} y={26} width={68} height={13} rx={6.5} fill="#faf9f5" />
      <rect x={26} y={48} width={50} height={13} rx={6.5} fill="#faf9f5" />
      <path
        d="M31 83 Q41 69 51 83 Q61 97 71 83 Q81 69 91 83"
        fill="none"
        stroke="#faf9f5"
        strokeWidth={10}
        strokeLinecap="round"
      />
    </g>
  );
}

/**
 * Where a reader meets Squiggle: the site, the installed app, the browser
 * button. One frame and one scale for the three, standing on the same line.
 */
export function DeviceFigure({ device }: { device: Device }) {
  const frame = (children: ReactNode) => (
    <svg viewBox="0 0 250 230" className="block h-auto w-full overflow-visible" aria-hidden="true">
      {children}
    </svg>
  );

  if (device === 'site') {
    // The site on the desk: a window with the pasted article and its button.
    const v = iso(118, 84);
    return frame(
      <>
        <Box v={v} at={[0, 0, 0]} size={[150, 112, 4]} r={6} />
        <g transform={v.top(0, 0, 4)}>
          {[0, 1, 2].map((i) => (
            <circle key={i} cx={10 + i * 7} cy={9} r={2.2} fill="#3a3a42" />
          ))}
          <rect x={10} y={20} width={130} height={58} rx={4} fill="var(--color-paper)" />
          <Lines
            lines={[
              [29, 18, 110],
              [37, 18, 122],
              [45, 18, 104],
              [53, 18, 118],
              [61, 18, 84],
            ]}
            h={3.5}
          />
          <rect x={10} y={86} width={50} height={16} rx={4} fill="var(--color-accent)" />
        </g>
      </>,
    );
  }

  if (device === 'appli') {
    // A phone on the table: an article, and Squiggle among the apps it shares to.
    const v = iso(140, 100);
    return frame(
      <>
        <Box v={v} at={[0, 0, 0]} size={[80, 150, 8]} r={12} />
        <g transform={v.top(0, 0, 8)}>
          <rect x={6} y={10} width={68} height={130} rx={7} fill="var(--color-paper)" />
          <rect x={13} y={20} width={44} height={7} rx={2} fill="var(--color-paperInk)" />
          <Lines
            lines={[
              [33, 13, 66],
              [41, 13, 62],
              [49, 13, 66],
              [57, 13, 46],
            ]}
            h={3.5}
          />
          <rect x={6} y={78} width={68} height={62} rx={7} fill="#17171a" />
          <rect x={30} y={83} width={20} height={3} rx={1.5} fill="#3a3a42" />
          {[0, 1, 2].map((i) => (
            <rect key={i} x={13 + i * 20} y={95} width={14} height={14} rx={4} fill="#2c2c33" />
          ))}
          <BadgeMark x={13} y={117} s={14} />
          {[1, 2].map((i) => (
            <rect key={i} x={13 + i * 20} y={117} width={14} height={14} rx={4} fill="#2c2c33" />
          ))}
        </g>
      </>,
    );
  }

  // A laptop: the article open in the browser, the Squiggle button in the
  // toolbar, and the report beside the page.
  const v = iso(104, 96);
  return frame(
    <>
      <Box v={v} at={[0, 8, 0]} size={[140, 90, 5]} r={5} />
      <g transform={v.top(0, 8, 5)}>
        {[0, 1, 2, 3].map((row) => (
          <path key={row} d={`M 14 ${14 + row * 11} H 126`} className="iso-line" stroke="#2c2c33" />
        ))}
        <rect x={48} y={62} width={44} height={20} rx={3} fill="none" stroke="#2c2c33" />
      </g>
      <Box v={v} at={[0, 0, 5]} size={[140, 8, 92]} r={5} />
      <g transform={v.front(0, 8, 97)}>
        <rect x={5} y={5} width={130} height={82} rx={3} fill="#0a0a0b" />
        <rect x={5} y={5} width={130} height={13} rx={3} fill="#17171a" />
        <rect x={12} y={8.5} width={70} height={6} rx={3} fill="#2c2c33" />
        <BadgeMark x={121} y={7} s={9} />
        <rect x={10} y={22} width={80} height={60} rx={2} fill="var(--color-paper)" />
        <rect x={16} y={28} width={46} height={5} rx={1.5} fill="var(--color-paperInk)" />
        <Lines
          lines={[
            [38, 16, 82],
            [45, 16, 78],
            [52, 16, 84],
            [59, 16, 70],
            [66, 16, 80],
          ]}
          h={3}
        />
        <rect x={40} y={43.5} width={30} height={5.5} rx={1.5} fill={tint('warning')} />
        <rect x={16} y={57.5} width={26} height={5.5} rx={1.5} fill={tint('info')} />
        <rect
          x={94}
          y={22}
          width={36}
          height={60}
          rx={2}
          fill="#17171a"
          stroke="var(--color-accent)"
          strokeWidth={0.75}
        />
        <circle cx={112} cy={36} r={8} fill="none" stroke={SEVERITY_COLORS.warning.color} strokeWidth={2.5} />
        <rect x={99} y={52} width={26} height={3} rx={1.5} fill="#55555d" />
        <rect x={99} y={59} width={20} height={3} rx={1.5} fill="#55555d" />
        <rect x={99} y={66} width={24} height={3} rx={1.5} fill="#55555d" />
      </g>
    </>,
  );
}

/**
 * A class at work: the article projected with Squiggle's reading beside it,
 * and in front of it the students' own sheets, annotated in pencil first.
 */
export function ClassFigure() {
  const v = iso(104, 138);
  const sheets: Array<[number, number]> = [
    [8, 46],
    [70, 56],
    [132, 46],
  ];
  return (
    <svg viewBox="0 0 290 290" className="block h-auto w-full overflow-visible" aria-hidden="true">
      <Box v={v} at={[0, 0, 0]} size={[200, 8, 124]} r={4} />
      <g transform={v.front(0, 8, 124)}>
        <rect x={6} y={6} width={188} height={112} rx={3} fill="#0a0a0b" />
        <rect x={12} y={12} width={122} height={100} rx={2} fill="var(--color-paper)" />
        <rect x={20} y={20} width={74} height={8} rx={2} fill="var(--color-paperInk)" />
        <Lines
          lines={[
            [36, 20, 124],
            [45, 20, 118],
            [54, 20, 126],
            [63, 20, 110],
            [72, 20, 124],
            [81, 20, 116],
            [90, 20, 98],
          ]}
          h={4}
        />
        <rect x={52} y={43.5} width={44} height={7} rx={1.5} fill={tint('warning')} />
        <rect x={20} y={70.5} width={40} height={7} rx={1.5} fill={tint('info')} />
        <rect x={64} y={88.5} width={34} height={7} rx={1.5} fill={tint('positive')} />
        <rect
          x={140}
          y={12}
          width={48}
          height={100}
          rx={2}
          fill="#17171a"
          stroke="var(--color-accent)"
          strokeWidth={0.75}
        />
        <circle cx={164} cy={32} r={11} fill="none" stroke={SEVERITY_COLORS.warning.color} strokeWidth={3} />
        {[54, 63, 72, 81, 90].map((y, i) => (
          <rect key={y} x={147} y={y} width={i % 2 ? 26 : 34} height={3.5} rx={1.75} fill="#55555d" />
        ))}
      </g>
      {sheets.map(([x, y], index) => (
        <g key={x}>
          <Box v={v} at={[x, y, 0]} size={[46, 58, 1.5]} r={2} face="iso-paper" edge="iso-paper-edge" />
          <g transform={v.top(x, y, 1.5)}>
            <Lines
              lines={[
                [10, 6, 38],
                [17, 6, 34],
                [24, 6, 40],
                [31, 6, 30],
                [38, 6, 36],
                [45, 6, 26],
              ]}
              h={3}
            />
            <path
              d={squiggle(6, index === 1 ? 29 : 22, index === 2 ? 22 : 28, 1.6, 4)}
              className="iso-line"
              stroke="#5c5b61"
              strokeWidth={1.25}
              strokeLinecap="round"
            />
          </g>
        </g>
      ))}
    </svg>
  );
}
