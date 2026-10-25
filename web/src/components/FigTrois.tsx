/**
 * The three analyses an account starts with, drawn as three articles stacked
 * on the table, the top one already marked. Decoration beside a form: it
 * carries no action and is hidden from assistive technology.
 */
import { SEVERITY_COLORS } from '../demo';
import { Box, projection } from './Iso';

const p = projection(177, 60);
const LINES = [96, 110, 70, 110, 104, 88, 110, 60];

function Sheet({ x, y, z, marked }: { x: number; y: number; z: number; marked: boolean }) {
  return (
    <Box
      p={p}
      x={x}
      y={y}
      z={z}
      w={140}
      d={180}
      h={3}
      r={5}
      lid="iso-face iso-paper"
      top={
        <>
          <rect x={14} y={16} width={84} height={8} rx={2.5} className="iso-ink" />
          {LINES.map((width, index) => (
            <rect key={index} x={14} y={38 + index * 15} width={width} height={4.5} rx={2.25} className="iso-text" />
          ))}
          {marked ? (
            <>
              <rect x={12} y={34} width={64} height={11} rx={3} fill={SEVERITY_COLORS.warning.tint} />
              <rect x={12} y={44} width={64} height={1.6} fill={SEVERITY_COLORS.warning.color} />
              <rect x={40} y={94} width={72} height={11} rx={3} fill={SEVERITY_COLORS.info.tint} />
              <rect x={40} y={104} width={72} height={1.6} fill={SEVERITY_COLORS.info.color} />
              <rect x={12} y={139} width={86} height={11} rx={3} fill={SEVERITY_COLORS.positive.tint} />
              <rect x={12} y={149} width={86} height={1.6} fill={SEVERITY_COLORS.positive.color} />
            </>
          ) : null}
        </>
      }
    />
  );
}

export function FigTrois({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 340 250" aria-hidden="true" className={`iso block h-auto w-full ${className}`}>
      <Sheet x={0} y={0} z={0} marked={false} />
      <Sheet x={6} y={-6} z={14} marked={false} />
      <Sheet x={12} y={-12} z={28} marked />
    </svg>
  );
}
