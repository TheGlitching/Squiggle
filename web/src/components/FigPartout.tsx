/**
 * Fig. 2, where Squiggle reads: on a computer, a button in the browser opens
 * the report beside the article; on a phone, the installed app shows it. The
 * drawing shows what the word "extension" means instead of saying it.
 */
import { useState, type CSSProperties } from 'react';

import { EXAMPLES, SEVERITY_COLORS } from '../demo';
import { Box, Plate, projection } from './Iso';

const p = projection(180, 196);

type Device = 'ordinateur' | 'telephone' | null;

/** Text lines of a page, with the passages Squiggle marks: [x, width, example index?]. */
const PAGE_LINES: Array<[number, number, number?]> = [
  [0, 132],
  [0, 118, 0],
  [0, 132],
  [0, 96, 1],
  [0, 132],
  [0, 124, 3],
  [0, 70],
];

function Lines({
  x,
  y,
  width,
  step,
}: {
  x: number;
  y: number;
  width: number;
  step: number;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {PAGE_LINES.map(([start, w, mark], index) => {
        const length = Math.min(w, width);
        const tone = mark === undefined ? null : SEVERITY_COLORS[EXAMPLES[mark].sev];
        return (
          <g key={index} transform={`translate(${start} ${index * step})`}>
            {tone ? (
              <g className="iso-mark" style={{ '--delay': `${120 + index * 70}ms` } as CSSProperties}>
                <rect x={-1.5} y={-2.5} width={length * 0.6 + 3} height={7} rx={1.5} fill={tone.tint} />
                <rect x={-1.5} y={4} width={length * 0.6 + 3} height={1.2} fill={tone.color} />
              </g>
            ) : null}
            <rect width={length} height={2.6} rx={1.3} className="iso-text" />
          </g>
        );
      })}
    </g>
  );
}

export function FigPartout() {
  const [device, setDevice] = useState<Device>(null);
  const laptop = device === 'ordinateur';
  const phone = device === 'telephone';

  const readout = laptop
    ? 'Ordinateur : le rapport s’ouvre à côté de l’article'
    : phone
      ? 'Téléphone : le rapport dans l’appli'
      : 'Choisissez un appareil';

  const choice = (value: Exclude<Device, null>, label: string) => (
    <button
      type="button"
      className="iso-button"
      aria-pressed={device === value}
      onClick={() => setDevice((current) => (current === value ? null : value))}
    >
      {label}
    </button>
  );

  return (
    <Plate
      label="Figure : Squiggle sur un ordinateur et sur un téléphone"
      readout={readout}
      control={
        <>
          {choice('ordinateur', 'Sur ordinateur')}
          {choice('telephone', 'Sur téléphone')}
        </>
      }
    >
      <svg
        viewBox="0 0 510 440"
        className="iso block h-auto w-full"
        role="img"
        aria-label="Un ordinateur portable et un téléphone. Sur l’ordinateur, un bouton du navigateur ouvre le rapport à côté de l’article ; sur le téléphone, l’appli affiche l’article surligné et sa note."
      >
        {/* The laptop's screen, behind its keyboard. */}
        <g className={laptop ? 'iso is-on' : 'iso'}>
          <Box
            p={p}
            x={0}
            y={-8}
            z={8}
            w={240}
            d={8}
            h={152}
            r={8}
            front={
              <>
                <rect x={8} y={8} width={224} height={136} rx={4} className="iso-glass" />
                <rect x={8} y={8} width={224} height={15} rx={4} className="iso-chrome" />
                <rect x={30} y={12.5} width={130} height={6} rx={3} className="iso-detail-fill" />
                {/* The Squiggle button in the browser's toolbar. */}
                <g
                  className={`iso-press ${laptop ? 'down' : ''}`}
                  onClick={() => setDevice(laptop ? null : 'ordinateur')}
                  aria-hidden="true"
                >
                  <rect x={208} y={10.5} width={16} height={10} rx={2.5} className="iso-accent" />
                  <path d="M211 17.5 q2 -3 4 0 q2 3 4 0" fill="none" strokeWidth={1.2} className="iso-glyph-line" />
                </g>
                <rect x={16} y={30} width={laptop ? 140 : 208} height={108} rx={2} className="iso-page" />
                <rect x={24} y={38} width={96} height={6} rx={2} className="iso-ink" />
                <Lines x={24} y={54} width={laptop ? 124 : 190} step={11} />
                {/* The side panel the button opens. */}
                <g className="iso-panel">
                  <rect x={162} y={30} width={62} height={108} rx={3} className="iso-chrome" />
                  <text x={170} y={58} className="iso-score-sm">
                    61
                  </text>
                  <text x={170} y={70} className="iso-tiny" fill={SEVERITY_COLORS.warning.text}>
                    Article fragile
                  </text>
                  {[0, 1, 2].map((row) => (
                    <rect key={row} x={170} y={82 + row * 16} width={46} height={11} rx={2} className="iso-detail-fill" />
                  ))}
                </g>
              </>
            }
          />
        </g>
        <Box
          p={p}
          x={0}
          y={0}
          z={0}
          w={240}
          d={160}
          h={8}
          r={8}
          top={
            <>
              {Array.from({ length: 5 }, (_, row) =>
                Array.from({ length: 12 }, (_, col) => (
                  <rect key={`${row}-${col}`} x={18 + col * 17.5} y={14 + row * 15} width={14} height={11} rx={2} className="iso-detail" />
                )),
              )}
              <rect x={78} y={96} width={84} height={50} rx={5} className="iso-detail" />
            </>
          }
        />

        {/* The phone, standing to the right. */}
        <g className={phone ? 'iso is-on' : 'iso'}>
          <Box
            p={p}
            x={300}
            y={40}
            z={0}
            w={74}
            d={10}
            h={150}
            r={12}
            front={
              <>
                <rect x={5} y={6} width={64} height={138} rx={9} className="iso-glass" />
                <rect x={9} y={16} width={56} height={phone ? 82 : 120} rx={3} className="iso-page" />
                <rect x={13} y={21} width={36} height={4.5} rx={1.5} className="iso-ink" />
                <Lines x={13} y={32} width={44} step={9.5} />
                <g className="iso-panel">
                  <rect x={9} y={102} width={56} height={36} rx={4} className="iso-chrome" />
                  <text x={14} y={120} className="iso-score-sm">
                    61
                  </text>
                  <text x={14} y={131} className="iso-tiny" fill={SEVERITY_COLORS.warning.text}>
                    Article fragile
                  </text>
                </g>
              </>
            }
          />
        </g>
      </svg>
    </Plate>
  );
}
