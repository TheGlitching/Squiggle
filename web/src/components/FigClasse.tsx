/**
 * Fig. 3, in class: on the left, the passages the pupils underlined in
 * pencil; on the right, the ones Squiggle marked. "Comparer" lays a tick on
 * the passages both found and a ring on those only one side saw: the
 * discussion starts from the difference.
 */
import { useState, type CSSProperties } from 'react';

import { SEVERITY_COLORS } from '../demo';
import { Box, Plate, projection } from './Iso';

const p = projection(206, 28);
const LINES = [120, 110, 124, 96, 124, 116, 124, 70, 118, 104];
const LINE_Y = (index: number) => 40 + index * 15;

/** Lines the class underlined, and lines Squiggle marked (with its tone). */
const PUPILS = [1, 4, 6];
const SQUIGGLE: Array<[number, 'warning' | 'info']> = [
  [1, 'warning'],
  [3, 'info'],
  [6, 'warning'],
];
const BOTH = PUPILS.filter((line) => SQUIGGLE.some(([l]) => l === line));

function Lines() {
  return (
    <>
      <rect x={14} y={16} width={90} height={8} rx={2.5} className="iso-ink" />
      {LINES.map((width, index) => (
        <rect key={index} x={14} y={LINE_Y(index)} width={width} height={4.5} rx={2.25} className="iso-text" />
      ))}
    </>
  );
}

/** A tick where both found it, a ring where one side alone did. */
function Verdict({ line, both }: { line: number; both: boolean }) {
  const { color } = SEVERITY_COLORS[both ? 'positive' : 'info'];
  return (
    <g className="iso-mark" style={{ '--delay': `${120 + line * 40}ms` } as CSSProperties} transform={`translate(140 ${LINE_Y(line) + 2})`}>
      <circle r={5.5} fill="none" stroke={color} strokeWidth={1.4} />
      {both ? <path d="M-2.6 0.2 l1.8 1.8 l3.4 -3.6" fill="none" stroke={color} strokeWidth={1.4} strokeLinecap="round" /> : null}
    </g>
  );
}

export function FigClasse() {
  const [compared, setCompared] = useState(false);
  const pupilsOnly = PUPILS.filter((line) => !BOTH.includes(line)).length;
  const squiggleOnly = SQUIGGLE.filter(([line]) => !BOTH.includes(line)).length;
  const readout = compared
    ? `${BOTH.length} passages en commun · ${pupilsOnly} vu par la classe seule · ${squiggleOnly} par Squiggle seul`
    : 'Deux lectures du même article';

  return (
    <Plate
      label="Figure : la lecture de la classe à côté de celle de Squiggle"
      readout={readout}
      control={
        <button type="button" className="iso-button" aria-pressed={compared} onClick={() => setCompared((on) => !on)}>
          {compared ? 'Masquer' : 'Comparer'}
        </button>
      }
    >
      <svg
        viewBox="0 0 520 320"
        className={`iso block h-auto w-full ${compared ? 'is-on' : ''}`}
        role="img"
        aria-label="Deux copies du même article. À gauche, les passages soulignés au crayon par la classe ; à droite, ceux que Squiggle a surlignés. Deux passages sont communs."
      >
        <Box
          p={p}
          x={0}
          y={0}
          z={0}
          w={150}
          d={200}
          h={3}
          r={5}
          lid="iso-face iso-paper"
          top={
            <>
              <Lines />
              {PUPILS.map((line) => (
                <path
                  key={line}
                  d={`M14 ${LINE_Y(line) + 8} q4 -3 8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0 t8 0`}
                  fill="none"
                  stroke="#4d4c52"
                  strokeWidth={1.3}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {compared ? PUPILS.map((line) => <Verdict key={line} line={line} both={BOTH.includes(line)} />) : null}
            </>
          }
        />
        <Box
          p={p}
          x={175}
          y={0}
          z={0}
          w={150}
          d={200}
          h={3}
          r={5}
          lid="iso-face iso-paper"
          top={
            <>
              {SQUIGGLE.map(([line, tone]) => (
                <g key={line}>
                  <rect x={12} y={LINE_Y(line) - 3.5} width={96} height={11} rx={3} fill={SEVERITY_COLORS[tone].tint} />
                  <rect x={12} y={LINE_Y(line) + 6.5} width={96} height={1.6} fill={SEVERITY_COLORS[tone].color} />
                </g>
              ))}
              <Lines />
              {compared ? SQUIGGLE.map(([line]) => <Verdict key={line} line={line} both={BOTH.includes(line)} />) : null}
            </>
          }
        />
      </svg>
    </Plate>
  );
}
