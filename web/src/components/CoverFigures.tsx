/**
 * The covers of the social carousels (`socialSlides` in `src/share.tsx`): one
 * small isometric scene per glossary notion and per article, on the dark slab
 * of `CriterionFigure`, in the site's materials. Paper is the article, violet is
 * Squiggle's reading, amber is the thing the notion is about, a dashed outline is
 * what is missing. Nothing on them is meant to be read: no text, only shapes.
 *
 * Every scene sits on the same 220 x 220 slab, centred on the origin, so the
 * covers share one frame. Shapes are drawn back to front: larger `x + y` last.
 */
import type { ReactElement, ReactNode } from 'react';

import { SEVERITY_COLORS } from '../demo';
import { Box, HeroFigure, iso } from './Iso';

/** The amber of a warning passage: on a cover, the thing the notion is about. */
export const AMBER = SEVERITY_COLORS.warning.color;
export const AMBER_SIDE = '#92400e';

const v = iso(240, 232);
type V3 = readonly [number, number, number];

/** A material, as `Box` takes it: the top face's class, then the sides'. */
type Material = readonly [string, string];
const SOLID: Material = ['iso-solid', 'iso-solid-side'];
const PAPER: Material = ['iso-paper', 'iso-paper-edge'];
const GLASS: Material = ['iso-glass', 'iso-glass'];
const WARN: Material = ['iso-warn', 'iso-warn-side'];
const ACCENT: Material = ['iso-accent', 'iso-accent-side'];
const GHOST: Material = ['iso-ghost', 'iso-ghost'];

function B({ at, size, m = SOLID, r = 3 }: { at: V3; size: V3; m?: Material; r?: number }) {
  return <Box v={v} at={at} size={size} r={r} face={m[0]} edge={m[1]} />;
}

/** A small standing figure: a body and a head. */
function Pawn({ at: [x, y, z = 0], m = SOLID, s = 1 }: { at: readonly [number, number, number?]; m?: Material; s?: number }) {
  return (
    <g>
      <B at={[x - 7 * s, y - 7 * s, z]} size={[14 * s, 14 * s, 26 * s]} m={m} />
      <B at={[x - 6 * s, y - 6 * s, z + 29 * s]} size={[12 * s, 12 * s, 12 * s]} m={m} />
    </g>
  );
}

/** Flat shapes drawn in a face's own coordinates: `top` lies on the slab, `front` faces down-left, `side` down-right. */
function On({ plane, at: [x, y, z], children }: { plane: 'top' | 'front' | 'side'; at: V3; children: ReactNode }) {
  return <g transform={v[plane](x, y, z)}>{children}</g>;
}

function Line({ from, to, dash = false, stroke = 'var(--color-accent)' }: { from: V3; to: V3; dash?: boolean; stroke?: string }) {
  const [[x1, y1], [x2, y2]] = [v.P(...from), v.P(...to)];
  return <line x1={x1} y1={y1} x2={x2} y2={y2} className="iso-line" stroke={stroke} strokeWidth={2} strokeDasharray={dash ? '5 5' : undefined} />;
}

function Poly({ points, m }: { points: V3[]; m: string }) {
  return <polygon className={`iso-face ${m}`} points={points.map((point) => v.P(...point).join(',')).join(' ')} />;
}

/** Grey text lines, as the hero's article draws them: `[y, from, to]`. */
function Lines({ lines, fill = '#a3a1a6', h = 4 }: { lines: Array<readonly [number, number, number]>; fill?: string; h?: number }) {
  return (
    <>
      {lines.map(([y, from, to]) => (
        <rect key={`${y}-${from}`} x={from} y={y} width={to - from} height={h} rx={h / 2} fill={fill} />
      ))}
    </>
  );
}

const lines = (count: number, top: number, step: number, from: number, to: number) =>
  Array.from({ length: count }, (_, i) => [top + i * step, from, to - (i % 3) * 8] as const);

/** A sheet lying on the slab, its lines drawn. */
function Sheet({ at: [x, y, z], w, d, rows = 6 }: { at: V3; w: number; d: number; rows?: number }) {
  return (
    <>
      <B at={[x, y, z]} size={[w, d, 3]} m={PAPER} r={2} />
      <On plane="top" at={[x, y, z + 3]}>
        <Lines lines={lines(rows, 10, (d - 16) / rows, 8, w - 8)} />
      </On>
    </>
  );
}

/** A magnifying glass held up, flat on the screen: its lens is the violet glass. */
function Lens({ at, r = 26 }: { at: V3; r?: number }) {
  const [cx, cy] = v.P(...at);
  return (
    <g>
      <line x1={cx + r * 0.7} y1={cy + r * 0.7} x2={cx + r * 1.6} y2={cy + r * 1.6} stroke="var(--color-accent)" strokeWidth={7} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={r} className="iso-face iso-glass" strokeWidth={4} />
    </g>
  );
}

const SCENES: Record<string, () => ReactNode> = {
  // Two doors, and the third one the article never shows.
  'faux-dilemme': () => (
    <>
      {[-82, -22].map((x) => (
        <g key={x}>
          <B at={[x, -30, 0]} size={[44, 8, 92]} m={PAPER} />
          <On plane="front" at={[x, -22, 92]}>
            <rect x={8} y={10} width={28} height={74} rx={3} fill="none" stroke="var(--color-paperEdge)" strokeWidth={2} />
            <circle cx={30} cy={50} r={3} fill="var(--color-paperInk)" />
          </On>
        </g>
      ))}
      <B at={[38, -30, 0]} size={[44, 8, 92]} m={GHOST} />
    </>
  ),
  // The real one stands back; the straw one, easier to knock down, takes the blows.
  'homme-de-paille': () => (
    <>
      <Pawn at={[-60, -60]} s={1.8} />
      <B at={[24, 24, 0]} size={[8, 8, 46]} m={SOLID} r={1} />
      <Pawn at={[28, 28, 46]} m={WARN} s={1.7} />
      <B at={[-10, 24, 90]} size={[76, 8, 8]} m={WARN} r={2} />
    </>
  ),
  // What was said, ignored; the aim is the person who said it.
  'ad-hominem': () => (
    <>
      <B at={[-100, -80, 0]} size={[100, 6, 84]} m={PAPER} />
      <On plane="front" at={[-100, -74, 84]}>
        <Lines lines={lines(7, 12, 9, 10, 90)} />
      </On>
      <On plane="top" at={[36, 30, 0]}>
        {[54, 38, 22].map((r) => (
          <circle key={r} cx={0} cy={0} r={r} fill="none" stroke={AMBER} strokeWidth={4} />
        ))}
      </On>
      <Pawn at={[36, 30]} s={2} />
      <Line from={[-60, 90, 110]} to={[22, 36, 70]} />
    </>
  ),
  // Two things that rise together, and the link drawn between them.
  'correlation-causalite': () => (
    <>
      {[30, 52, 74, 96].map((h, i) => (
        <B key={`a${i}`} at={[-100 + i * 32, -90, 0]} size={[24, 24, h]} m={PAPER} />
      ))}
      {[36, 58, 80, 104].map((h, i) => (
        <B key={`b${i}`} at={[-40 + i * 32, 30, 0]} size={[24, 24, h]} m={WARN} />
      ))}
      <Line from={[8, -78, 110]} to={[68, 42, 118]} dash />
    </>
  ),
  // A whole crowd, judged from the two in front of the lens.
  'generalisation-hative': () => (
    <>
      {[-96, -60, -24, 12].flatMap((x) =>
        [-96, -60, -24].map((y) => <Pawn key={`${x},${y}`} at={[x, y]} s={1.05} />),
      )}
      <Pawn at={[44, 60]} m={WARN} s={1.25} />
      <Pawn at={[74, 34]} m={WARN} s={1.25} />
      <Lens at={[60, 46, 96]} r={38} />
    </>
  ),
  // One step, and the slope that is said to follow, all the way down.
  'pente-savonneuse': () => (
    <>
      <Poly points={[[-90, -36, 100], [-90, 36, 100], [90, 36, 0], [90, -36, 0]]} m="iso-paper" />
      <Poly points={[[-90, 36, 0], [90, 36, 0], [-90, 36, 100]]} m="iso-paper-edge" />
      <B at={[-80, -10, 90]} size={[20, 20, 20]} m={WARN} />
      {[0, 1, 2].map((i) => (
        <Line key={i} from={[-40 + i * 36, -50, 74 - i * 20]} to={[-20 + i * 36, -50, 63 - i * 20]} dash />
      ))}
    </>
  ),
  // One voice raised on a pedestal, the others looking up.
  'argument-d-autorite': () => (
    <>
      <B at={[-40, -40, 0]} size={[44, 44, 70]} m={PAPER} />
      <Pawn at={[-18, -18, 70]} m={ACCENT} s={1.2} />
      <Pawn at={[50, 20]} s={0.9} />
      <Pawn at={[20, 60]} s={0.9} />
      <Pawn at={[64, 64]} s={0.9} />
    </>
  ),
  // Everyone heading the same way.
  'appel-a-la-popularite': () => (
    <>
      <On plane="top" at={[-100, -16, 0]}>
        <path d="M 0 0 H 150 V -20 L 200 16 L 150 52 V 32 H 0 Z" fill="var(--color-accent)" opacity={0.5} />
      </On>
      {[-80, -50, -20, 10, 40].flatMap((x, i) =>
        [-60, 40].map((y) => <Pawn key={`${x},${y}`} at={[x, y + (i % 2) * 8]} s={0.85} m={i === 4 && y === 40 ? WARN : SOLID} />),
      )}
    </>
  ),
  // A small house and a large building, held equal.
  'fausse-analogie': () => (
    <>
      <B at={[-30, -90, 0]} size={[60, 60, 120]} m={PAPER} />
      <On plane="front" at={[-30, -30, 120]}>
        {[0, 1, 2, 3, 4].flatMap((row) => [0, 1, 2].map((col) => <rect key={`${row}-${col}`} x={8 + col * 18} y={10 + row * 22} width={8} height={12} rx={1} fill="#a3a1a6" />))}
      </On>
      <B at={[-20, 26, 0]} size={[16, 6, 4]} m={ACCENT} r={1} />
      <B at={[-20, 26, 14]} size={[16, 6, 4]} m={ACCENT} r={1} />
      <B at={[40, 40, 0]} size={[36, 36, 26]} m={WARN} />
      <Poly points={[[40, 40, 26], [76, 40, 26], [76, 58, 46], [40, 58, 46]]} m="iso-warn-side" />
      <Poly points={[[40, 58, 46], [76, 58, 46], [76, 76, 26], [40, 76, 26]]} m="iso-warn" />
    </>
  ),
  // Out of a whole grid of facts, the three that suit.
  'cherry-picking': () => (
    <>
      {[-90, -54, -18, 18, 54].flatMap((x) =>
        [-90, -54, -18, 18, 54].map((y) => {
          const picked = (x === -18 && y === -54) || (x === 18 && y === 18) || (x === 54 && y === -18);
          return picked ? (
            <g key={`${x},${y}`}>
              <B at={[x, y, 0]} size={[28, 28, 2]} m={GHOST} r={2} />
              <Line from={[x + 14, y + 14, 4]} to={[x + 14, y + 14, 50]} dash />
              <B at={[x, y, 50]} size={[28, 28, 4]} m={WARN} r={2} />
            </g>
          ) : (
            <B key={`${x},${y}`} at={[x, y, 0]} size={[28, 28, 4]} m={PAPER} r={2} />
          );
        }),
      )}
    </>
  ),
  // A reader looking at a pane of glass, and seeing only themselves in it.
  'biais-de-confirmation': () => (
    <>
      <Pawn at={[-40, -60]} m={GHOST} s={1.4} />
      <B at={[-90, -14, 0]} size={[120, 4, 100]} m={GLASS} r={4} />
      <Pawn at={[-40, 40]} m={ACCENT} s={1.4} />
    </>
  ),
  // A small result, blown up into a much bigger one.
  surinterpretation: () => (
    <>
      <B at={[-60, -90, 0]} size={[90, 90, 90]} m={GHOST} r={6} />
      {[
        [-60, -90, 90],
        [30, 0, 90],
        [30, -90, 90],
      ].map(([x, y, z], i) => (
        <Line key={i} from={[40 + (x + 60) / 9, 40 + (y + 90) / 9, 10 + z / 9]} to={[x, y, z]} dash />
      ))}
      <B at={[40, 40, 0]} size={[10, 10, 10]} m={WARN} r={2} />
    </>
  ),
  // A headline far louder than the text under it.
  'titre-trompeur': () => (
    <>
      <B at={[-80, -40, 0]} size={[150, 8, 130]} m={PAPER} r={4} />
      <On plane="front" at={[-80, -32, 130]}>
        <rect x={12} y={14} width={126} height={22} rx={4} fill={AMBER} />
        <rect x={12} y={42} width={90} height={22} rx={4} fill={AMBER} />
        <Lines lines={lines(5, 78, 9, 12, 138)} h={3.5} />
      </On>
    </>
  ),
  // The words of the article, and the weight put on them.
  'vocabulaire-charge': () => (
    <>
      <Sheet at={[-80, -60, 0]} w={150} d={110} rows={7} />
      <B at={[-30, -30, 3]} size={[56, 50, 40]} m={WARN} r={8} />
      <On plane="front" at={[-30, 20, 43]}>
        <path d="M 14 0 Q 28 -26 42 0" fill="none" stroke={AMBER} strokeWidth={6} strokeLinecap="round" />
      </On>
    </>
  ),
  // Something sharp, wrapped in something soft.
  euphemisme: () => {
    // The cushion first, then the point that comes through it.
    const spike = (base: number, z: number): V3[] => [[-base, base, z], [base, base, z], [base, -base, z], [0, 0, 150]];
    const [a, b, c, apex] = spike(9, 64);
    return (
      <>
        <B at={[-60, -60, 0]} size={[120, 120, 64]} m={PAPER} r={16} />
        <Poly points={[a, b, apex]} m="iso-warn-side" />
        <Poly points={[b, c, apex]} m="iso-warn" />
      </>
    );
  },
  // An opinion, stamped as if it were a fact.
  'opinion-presentee-comme-fait': () => (
    <>
      <Sheet at={[-90, -70, 0]} w={140} d={150} rows={8} />
      <On plane="top" at={[-20, 10, 3]}>
        <circle cx={0} cy={0} r={30} fill="none" stroke={AMBER} strokeWidth={5} />
        <circle cx={0} cy={0} r={20} fill="none" stroke={AMBER} strokeWidth={3} />
      </On>
      <B at={[30, -10, 40]} size={[40, 40, 14]} m={SOLID} r={3} />
      <B at={[44, 4, 54]} size={[12, 12, 36]} m={SOLID} r={3} />
      <B at={[38, -2, 90]} size={[24, 24, 14]} m={ACCENT} r={6} />
    </>
  ),
  // A sentence, its middle cut out and set aside.
  'citation-tronquee': () => (
    <>
      <B at={[-100, -30, 0]} size={[60, 34, 4]} m={PAPER} r={2} />
      <B at={[-40, -30, 0]} size={[60, 34, 4]} m={GHOST} r={2} />
      <B at={[20, -30, 0]} size={[60, 34, 4]} m={PAPER} r={2} />
      <On plane="top" at={[-100, -30, 4]}>
        <Lines lines={[[10, 6, 54], [20, 6, 40]]} />
      </On>
      <On plane="top" at={[20, -30, 4]}>
        <Lines lines={[[10, 6, 54], [20, 6, 30]]} />
      </On>
      <B at={[-30, 40, 40]} size={[60, 34, 4]} m={WARN} r={2} />
      <Line from={[-10, -13, 6]} to={[0, 57, 40]} dash />
    </>
  ),
  // A question shut in a box and locked.
  'debat-presente-comme-clos': () => (
    <>
      <B at={[-60, -60, 0]} size={[110, 110, 70]} m={PAPER} r={4} />
      <B at={[-64, -64, 70]} size={[118, 118, 10]} m={SOLID} r={4} />
      <On plane="front" at={[-10, 54, 70]}>
        <path d="M 4 4 V -8 A 12 12 0 0 1 28 -8 V 4" fill="none" stroke="var(--color-accent)" strokeWidth={5} />
        <rect x={0} y={2} width={32} height={26} rx={4} fill="var(--color-accent)" />
      </On>
    </>
  ),
  // A heavy pan and a light one, and a beam that stays level.
  'faux-equilibre': () => (
    <>
      <B at={[-8, -8, 0]} size={[16, 16, 90]} m={SOLID} />
      <B at={[-90, -4, 90]} size={[180, 8, 6]} m={PAPER} r={2} />
      <Line from={[-80, 0, 90]} to={[-80, 0, 50]} />
      <Line from={[80, 0, 90]} to={[80, 0, 50]} />
      <B at={[-104, -24, 46]} size={[48, 48, 4]} m={PAPER} r={4} />
      {[0, 1, 2].flatMap((row) => [0, 1].map((col) => <B key={`${row}-${col}`} at={[-98 + col * 18, -18, 50 + row * 16]} size={[16, 32, 16]} m={SOLID} r={2} />))}
      <B at={[56, -24, 46]} size={[48, 48, 4]} m={PAPER} r={4} />
      <B at={[72, -8, 50]} size={[16, 16, 16]} m={WARN} r={2} />
    </>
  ),
  // A heart set where the reasons should be.
  'appel-a-l-emotion': () => {
    const heart = 'M 50 88 C 10 60 0 36 0 22 C 0 8 12 0 24 0 C 36 0 46 8 50 18 C 54 8 64 0 76 0 C 88 0 100 8 100 22 C 100 36 90 60 50 88 Z';
    return (
      <>
        <Sheet at={[-90, -80, 0]} w={110} d={80} rows={5} />
        <On plane="front" at={[-30, 6, 104]}>
          <path d={heart} fill={AMBER_SIDE} />
        </On>
        <On plane="front" at={[-30, 14, 104]}>
          <path d={heart} fill={AMBER} />
        </On>
      </>
    );
  },
  // A thought put in someone's head by someone else.
  'proces-d-intention': () => (
    <>
      <Pawn at={[-50, -40]} s={1.3} />
      <On plane="front" at={[-90, -40, 150]}>
        <ellipse cx={60} cy={40} rx={58} ry={34} className="iso-face iso-glass" strokeWidth={3} />
        <circle cx={34} cy={84} r={8} className="iso-face iso-glass" strokeWidth={2} />
        <rect x={44} y={26} width={32} height={28} rx={5} fill={AMBER} />
      </On>
      <Pawn at={[60, 50]} m={ACCENT} />
      <Line from={[56, 46, 46]} to={[-10, -40, 110]} dash />
    </>
  ),
  // Someone speaking from behind frosted glass.
  'autorite-anonyme': () => (
    <>
      <Pawn at={[-30, -50]} m={PAPER} s={1.5} />
      <B at={[-90, -10, 0]} size={[130, 4, 110]} m={GLASS} r={4} />
      <On plane="front" at={[-90, -6, 110]}>
        {Array.from({ length: 10 }, (_, i) => (
          <rect key={i} x={6} y={8 + i * 10} width={118} height={4} rx={2} fill="var(--color-accentInk)" opacity={0.35} />
        ))}
      </On>
    </>
  ),
  // A claim pointing to a source that is not there.
  'source-absente': () => (
    <>
      <B at={[20, -80, 0]} size={[70, 90, 4]} m={GHOST} r={3} />
      <Sheet at={[-90, 0, 0]} w={90} d={100} rows={6} />
      <Line from={[-30, 30, 6]} to={[50, -30, 6]} dash />
    </>
  ),
  // A claim held up by nothing.
  'affirmation-non-etayee': () => (
    <>
      {[
        [-70, -70],
        [40, -70],
        [-70, 40],
        [40, 40],
      ].map(([x, y]) => (
        <B key={`${x},${y}`} at={[x, y, 0]} size={[16, 16, 70]} m={GHOST} />
      ))}
      <B at={[-80, -80, 76]} size={[146, 146, 12]} m={WARN} r={6} />
    </>
  ),
  // A figure given whole, its cable leading nowhere.
  'chiffre-sans-origine': () => {
    const c = 2 * Math.PI * 40;
    return (
      <>
        <B at={[40, 30, 0]} size={[30, 30, 4]} m={GHOST} r={3} />
        <On plane="front" at={[-90, -40, 160]}>
          <circle cx={56} cy={56} r={40} fill="#0f0f11" stroke="#3a3a42" strokeWidth={14} />
          <circle cx={56} cy={56} r={40} fill="none" stroke={AMBER} strokeWidth={14} strokeDasharray={`${c * 0.68} ${c}`} transform="rotate(-90 56 56)" />
        </On>
        <path
          d={(() => {
            const [[ax, ay], [bx, by]] = [v.P(-34, -40, 48), v.P(55, 45, 4)];
            return `M ${ax} ${ay} C ${ax} ${ay + 90} ${bx - 60} ${by - 40} ${bx} ${by}`;
          })()}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={2}
          strokeDasharray="5 5"
        />
      </>
    );
  },
  // A small fact, and a leap over every step in between to a towering conclusion.
  'conclusion-hative': () => {
    // Laid along the slab's diagonal, so the steps stand side by side and none hides another.
    const [[ax, ay], [bx, by]] = [v.P(-72, 72, 24), v.P(70, -70, 140)];
    return (
      <>
        <B at={[-84, 60, 0]} size={[24, 24, 24]} m={PAPER} />
        {[50, 80, 110].map((h, i) => (
          <B key={h} at={[-50 + i * 34, 26 - i * 34, 0]} size={[24, 24, h]} m={GHOST} r={2} />
        ))}
        <B at={[50, -90, 0]} size={[40, 40, 140]} m={WARN} r={4} />
        <path d={`M ${ax} ${ay - 8} C ${ax + 20} ${ay - 200} ${bx - 60} ${by - 120} ${bx} ${by - 14}`} fill="none" stroke="var(--color-accent)" strokeWidth={4} strokeDasharray="8 7" strokeLinecap="round" />
        <path d={`M ${bx - 14} ${by - 28} L ${bx} ${by - 12} L ${bx + 10} ${by - 32}`} fill="none" stroke="var(--color-accent)" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
      </>
    );
  },
};

/** A notion's or an article's cover scene, or the hero's drawing for one that has none yet. */
export function CoverFigure({ slug }: { slug: string }): ReactElement {
  const scene = SCENES[slug];
  if (!scene) return <HeroFigure pins={false} />;
  return (
    <svg viewBox="44 8 392 366">
      <B at={[-110, -110, -14]} size={[220, 220, 14]} r={10} />
      {scene()}
    </svg>
  );
}

/** The slugs that have a scene of their own. */
export const COVER_SLUGS: readonly string[] = Object.keys(SCENES);
