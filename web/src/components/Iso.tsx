/**
 * Isometric line drawings, from one projection. A face is an ordinary flat
 * shape placed on a 3D plane by a single SVG `matrix()`, so text, bars and
 * rounded corners sit in perspective for free; a box is its three visible
 * faces. Depth is paint order only: emit far things (small x + y + z) first.
 *
 * Axes: +x runs down-right, +y down-left, +z up. The viewer sees the top, the
 * `y = max` face (FRONT, lower left) and the `x = max` face (SIDE, lower right).
 */
import type { ReactNode, SVGProps } from 'react';

const C = Math.cos(Math.PI / 6);
const S = Math.sin(Math.PI / 6);

type Vec = [number, number, number];

export interface Projection {
  /** A 3D point on screen. */
  point: (x: number, y: number, z: number) => [number, number];
  /** The transform that lays a group flat on the `z = const` plane, origin at (x, y, z). */
  top: (x: number, y: number, z: number) => string;
  /** The `y = const` plane, facing lower left; pass the face's top-left corner. */
  front: (x: number, y: number, z: number) => string;
  /** The `x = const` plane, facing lower right; pass the face's top-left corner. */
  side: (x: number, y: number, z: number) => string;
  /** A screen offset for a 3D move, for CSS transforms. */
  shift: (x: number, y: number, z: number) => [number, number];
}

/** A projection whose 3D origin lands at (ox, oy) in the viewBox. */
export function projection(ox: number, oy: number): Projection {
  const dir = (x: number, y: number, z: number): [number, number] => [(x - y) * C, (x + y) * S - z];
  const point = (x: number, y: number, z: number): [number, number] => {
    const [dx, dy] = dir(x, y, z);
    return [dx + ox, dy + oy];
  };
  const plane = (o: Vec, u: Vec, v: Vec) => {
    const [px, py] = point(...o);
    const [ux, uy] = dir(...u);
    const [vx, vy] = dir(...v);
    const r = (n: number) => Math.round(n * 1000) / 1000;
    return `matrix(${r(ux)} ${r(uy)} ${r(vx)} ${r(vy)} ${r(px)} ${r(py)})`;
  };
  return {
    point,
    top: (x, y, z) => plane([x, y, z], [1, 0, 0], [0, 1, 0]),
    front: (x, y, z) => plane([x, y, z], [1, 0, 0], [0, 0, -1]),
    side: (x, y, z) => plane([x, y, z], [0, -1, 0], [0, 0, -1]),
    shift: dir,
  };
}

/** A flat rectangle on a plane. */
export function Face({
  t,
  w,
  h,
  r = 0,
  className = 'iso-face',
  children,
  ...rest
}: { t: string; w: number; h: number; r?: number; className?: string; children?: ReactNode } & Omit<
  SVGProps<SVGGElement>,
  'children'
>) {
  return (
    <g transform={t} {...rest}>
      <rect className={className} width={w} height={h} rx={r} />
      {children}
    </g>
  );
}

/**
 * A box at (x, y, z), `w` along x, `d` along y, `h` along z. The side radius is
 * clamped so a thin slab does not turn into a lens. `top` is drawn on the lid,
 * in its local units (origin at the lid's top-left corner).
 */
export function Box({
  p,
  x,
  y,
  z,
  w,
  d,
  h,
  r = 0,
  lid = 'iso-face iso-top',
  top,
  front,
  side,
}: {
  p: Projection;
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  h: number;
  r?: number;
  lid?: string;
  top?: ReactNode;
  front?: ReactNode;
  side?: ReactNode;
}) {
  const edge = Math.min(r, h / 4);
  return (
    <g>
      <Face t={p.side(x + w, y + d, z + h)} w={d} h={h} r={edge}>
        {side}
      </Face>
      <Face t={p.front(x, y + d, z + h)} w={w} h={h} r={edge}>
        {front}
      </Face>
      <Face t={p.top(x, y, z + h)} w={w} h={d} r={r} className={lid}>
        {top}
      </Face>
    </g>
  );
}

/**
 * The plate a figure sits on: the drawing, then one row under it with the
 * control on the left and the live state on the right. The captions are
 * sentence case in the text face, like the rest of the site.
 */
export function Plate({
  label,
  readout,
  control,
  children,
}: {
  label: string;
  readout: string;
  control: ReactNode;
  children: ReactNode;
}) {
  return (
    <figure className="m-0 rounded-card bg-surface p-4 sm:p-6" aria-label={label}>
      {children}
      <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex flex-wrap items-center gap-3">{control}</div>
        <p role="status" aria-live="polite" className="m-0 text-base text-muted tabular-nums">
          {readout}
        </p>
      </figcaption>
    </figure>
  );
}
