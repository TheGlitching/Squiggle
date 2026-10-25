/**
 * The isometric kernel behind the site's line-art figures. A face is an
 * ordinary flat shape put on a 3D plane by one SVG matrix, so text, glyphs and
 * rounded corners land in perspective without a hand-written polygon.
 *
 * Axes: +x runs down-right, +y runs down-left, +z is up. The viewer sees the
 * top, the y = max face (lower left) and the x = max face (lower right). Paint
 * order is the only depth sorting: emit farther parts (smaller x + y, lower z)
 * first.
 */
import type { ReactNode } from 'react';

const C = Math.cos(Math.PI / 6);
const S = Math.sin(Math.PI / 6);
const round = (n: number) => Math.round(n * 1000) / 1000;

export type Point = readonly [number, number, number];

/** A point in space, on screen. */
export function project(x: number, y: number, z: number): [number, number] {
  return [round((x - y) * C), round((x + y) * S - z)];
}

function plane(o: Point, u: Point, v: Point): string {
  const [ox, oy] = project(...o);
  const [ux, uy] = project(...u);
  const [vx, vy] = project(...v);
  return `matrix(${ux} ${uy} ${vx} ${vy} ${ox} ${oy})`;
}

/** The plane z = const, from its far corner. */
export const top = (x: number, y: number, z: number) => plane([x, y, z], [1, 0, 0], [0, 1, 0]);
/** The plane y = const (faces lower left), from its top-left corner. */
export const front = (x: number, y: number, z: number) => plane([x, y, z], [1, 0, 0], [0, 0, -1]);
/** The plane x = const (faces lower right), from its top-left corner. */
export const side = (x: number, y: number, z: number) => plane([x, y, z], [0, -1, 0], [0, 0, -1]);

/** The smallest view box holding these points, with a margin on every side. */
export function viewBoxFor(points: Point[], margin = 16): string {
  const xy = points.map((p) => project(...p));
  const xs = xy.map(([x]) => x);
  const ys = xy.map(([, y]) => y);
  const minX = Math.min(...xs) - margin;
  const minY = Math.min(...ys) - margin;
  return [minX, minY, Math.max(...xs) + margin - minX, Math.max(...ys) + margin - minY].map(round).join(' ');
}

/** The eight corners of a box, for `viewBoxFor`. */
export function corners(x: number, y: number, z: number, w: number, d: number, h: number): Point[] {
  return [0, w].flatMap((dx) => [0, d].flatMap((dy) => [0, h].map((dz) => [x + dx, y + dy, z + dz] as const)));
}

export interface BoxProps {
  x: number;
  y: number;
  z: number;
  /** Size along x, y and z. */
  w: number;
  d: number;
  h: number;
  r?: number;
  className?: string;
  children?: ReactNode;
}

/** A box is its three visible faces; `children` are drawn after them, on top. */
export function Box({ x, y, z, w, d, h, r = 0, className = '', children }: BoxProps) {
  // A thin slab's side radius is clamped so it never turns into a lens.
  const edge = Math.min(r, h / 4);
  return (
    <g className={className}>
      <rect className="iso-face iso-side" transform={side(x + w, y + d, z + h)} width={d} height={h} rx={edge} />
      <rect className="iso-face iso-front" transform={front(x, y + d, z + h)} width={w} height={h} rx={edge} />
      <rect className="iso-face iso-top" transform={top(x, y, z + h)} width={w} height={d} rx={r} />
      {children}
    </g>
  );
}

/** Parallel bars on a plane, the texture an article's lines of text leave at a distance. */
export function Lines({
  widths,
  x = 0,
  y = 0,
  gap = 12,
  height = 4,
  className = 'iso-text',
}: {
  widths: number[];
  x?: number;
  y?: number;
  gap?: number;
  height?: number;
  className?: string;
}) {
  return (
    <>
      {widths.map((width, index) => (
        <rect key={index} className={className} x={x} y={y + index * gap} width={width} height={height} rx={height / 2} />
      ))}
    </>
  );
}

/**
 * A textbook plate: the figure, with its number and name above and, below,
 * what to do with it and a live readout of its state.
 */
export function Plate({
  fig,
  name,
  hint,
  readout,
  action,
  children,
  className = '',
}: {
  fig: string;
  name: string;
  hint?: ReactNode;
  readout?: ReactNode;
  /** A control that sits in the top caption row, opposite the figure number. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <figure className={`plate m-0 ${className}`}>
      <div className="plate-caption">
        <span>Fig. {fig}</span>
        <span className="flex items-center gap-3">
          <span className="uppercase">{name}</span>
          {action}
        </span>
      </div>
      {children}
      {hint || readout ? (
        <figcaption className="plate-caption">
          <span>{hint}</span>
          <span aria-live="polite">{readout}</span>
        </figcaption>
      ) : null}
    </figure>
  );
}
