/**
 * A phone seen from the front, for the guides that show each step's screen
 * (/raccourci, /favori): the frame, placeholder lines of text, and labels,
 * with what to touch drawn in the accent.
 */
import type { ReactNode } from 'react';

export const W = 180;
export const H = 360;

/** An iPhone's island, or the punch-hole camera of an Android phone. */
export function Phone({ label, android = false, children }: { label: string; android?: boolean; children: ReactNode }) {
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full">
      <rect x={2} y={2} width={W - 4} height={H - 4} rx={28} className="fill-surface stroke-borderControl" strokeWidth={2} />
      {android ? (
        <circle cx={W / 2} cy={18} r={5} className="fill-background" />
      ) : (
        <rect x={68} y={14} width={44} height={12} rx={6} className="fill-background" />
      )}
      {children}
    </svg>
  );
}

/** A line of placeholder text, as the eye reads a paragraph from afar. */
export function Lines({ x, y, widths, gap = 10 }: { x: number; y: number; widths: number[]; gap?: number }) {
  return (
    <>
      {widths.map((w, i) => (
        <rect key={i} x={x} y={y + i * gap} width={w} height={4} rx={2} className="fill-border" />
      ))}
    </>
  );
}

/** Where to touch, in the order of the step's sentence. */
export function Tap({ x, y, n }: { x: number; y: number; n: number }) {
  return (
    <g aria-hidden="true">
      <circle cx={x} cy={y} r={9} className="fill-accent stroke-surface" strokeWidth={2} />
      <text x={x} y={y + 3.5} fontSize={10} textAnchor="middle" className="fill-accentForeground font-semibold">
        {n}
      </text>
    </g>
  );
}

export function Label({ x, y, children, accent = false, size = 9, anchor = 'start' }: { x: number; y: number; children: string; accent?: boolean; size?: number; anchor?: 'start' | 'middle' }) {
  return (
    <text x={x} y={y} fontSize={size} textAnchor={anchor} className={accent ? 'fill-accentForeground font-semibold' : 'fill-foreground'}>
      {children}
    </text>
  );
}
