/**
 * What a report holds, drawn rather than told: one finding card with its parts
 * numbered, the five domains as bars as long as their weight, and the four
 * answers a questioned fact can get.
 */
import type { CSSProperties, ReactNode } from 'react';

import {
  DOMAINS,
  EXAMPLES,
  HERO_REPORT,
  SCORE_BANDS,
  SEVERITY_COLORS,
  VERIFICATION_STATES,
  findingTone,
  scoreBand,
} from '../demo';
import { frenchSpacing } from '../format';
import { useSeen } from '../motion';

const SCORE = HERO_REPORT.marks.reduce((sum, mark) => sum + mark, 0);
const HEAVIEST = Math.max(...DOMAINS.map(([, weight]) => weight));
/** The doubted figure: the one finding whose card has every part. */
const EXAMPLE = EXAMPLES[HERO_REPORT.selected];

const PARTS = ['Le problème, nommé', 'La phrase exacte', 'La raison, en clair', 'L’avis des sources, si un fait est en doute'];

/** Short enough to read at a glance; the labels are the extension's own. */
const STATE_HINTS: Record<string, string> = {
  verifiee: 'Les sources confirment.',
  'non-sourcee': 'L’article ne cite rien à l’appui.',
  douteuse: 'Les sources le mettent en doute.',
  'non-verifiable': 'Trop flou pour être confronté.',
};

function Pin({ n }: { n: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent font-mono text-[13px] font-semibold text-accentForeground"
    >
      {n}
    </span>
  );
}

function Part({ n, children }: { n: number; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <Pin n={n} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function Ring() {
  const band = SCORE_BANDS[scoreBand(SCORE)];
  const radius = 44;
  const length = 2 * Math.PI * radius;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 104 104" className="h-24 w-24 -rotate-90" aria-hidden="true">
        <circle cx={52} cy={52} r={radius} fill="none" strokeWidth={8} className="stroke-border" />
        <circle
          cx={52}
          cy={52}
          r={radius}
          fill="none"
          strokeWidth={8}
          strokeLinecap="round"
          stroke={SEVERITY_COLORS[band.tone].color}
          strokeDasharray={length}
          strokeDashoffset={length * (1 - SCORE / 100)}
          className="ring-arc"
          style={{ '--ring': length } as CSSProperties}
        />
      </svg>
      <div>
        <p className="m-0 font-mono text-4xl leading-none font-bold tracking-tight">
          {SCORE}
          <span className="text-lg font-medium text-muted"> / 100</span>
        </p>
        <p className="mt-2 mb-0 text-base font-semibold" style={{ color: SEVERITY_COLORS[band.tone].text }}>
          {band.title}
        </p>
      </div>
    </div>
  );
}

export function ReportDiagram() {
  const [ref, seen] = useSeen<HTMLDivElement>(0.2);
  const tone = SEVERITY_COLORS[findingTone(EXAMPLE.severity, EXAMPLE.category)];
  const verification = VERIFICATION_STATES.find((state) => state.state === EXAMPLE.verification);

  return (
    <div ref={ref} data-seen={seen} className="grid gap-12">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
        <div>
          <h3 className="m-0 font-display text-2xl font-semibold">Une note, cinq domaines</h3>
          <div className="mt-6">
            <Ring />
          </div>
          <ol aria-label="Les cinq domaines" className="mt-8 grid list-none gap-4 p-0">
            {DOMAINS.map(([label, weight], index) => (
              <li key={label} className="grid gap-1.5">
                <span className="flex items-baseline justify-between gap-4 text-base">
                  <span className="min-w-0">{label}</span>
                  <span className="shrink-0 font-mono text-base text-muted tabular-nums">{weight}</span>
                </span>
                <span className="block h-2.5 overflow-hidden rounded-full bg-lineSoft">
                  <span
                    className="weight-bar block h-full rounded-full bg-accent"
                    style={{ width: `${(weight / HEAVIEST) * 100}%`, '--i': index } as CSSProperties}
                  />
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div>
          <h3 className="m-0 font-display text-2xl font-semibold">Chaque constat, à l’appui</h3>
          {/* A card drawn as a schematic: its parts, not its words, which the hero already shows. */}
          <div
            aria-hidden="true"
            className="mt-6 grid gap-5 rounded-card border border-border border-l-[3px] bg-surface p-5 sm:p-6"
            style={{ borderLeftColor: tone.color }}
          >
            <Part n={1}>
              <span className="block h-2.5 w-32 rounded-full" style={{ background: tone.text }} />
              <span className="mt-2.5 block h-4 w-3/5 rounded-full bg-foreground" />
            </Part>
            <Part n={2}>
              <span className="grid gap-2 rounded-control bg-paper p-3">
                <span className="flex gap-2">
                  <span className="sketch-mark block h-3.5 w-1/2 rounded-sm" style={{ '--sev-color': SEVERITY_COLORS[EXAMPLE.sev].color } as CSSProperties} />
                  <span className="block h-3.5 flex-1 rounded-sm bg-[#cdcac3]" />
                </span>
                <span className="block h-3.5 w-2/3 rounded-sm bg-[#cdcac3]" />
              </span>
            </Part>
            <Part n={3}>
              <span className="grid gap-2">
                {['w-full', 'w-11/12', 'w-3/4'].map((width) => (
                  <span key={width} className={`block h-2.5 rounded-full bg-border ${width}`} />
                ))}
              </span>
            </Part>
            {verification ? (
              <Part n={4}>
                <span className={`inline-block rounded-md border px-2 py-0.5 font-mono text-[13px] font-semibold ${verification.chip}`}>
                  {verification.label}
                </span>
              </Part>
            ) : null}
          </div>
          <ol className="mt-5 grid list-none gap-2 p-0 sm:grid-cols-2" aria-label="Les parties d’un constat">
            {PARTS.map((part, index) => (
              <li key={part} className="flex items-center gap-3 text-base text-muted">
                <Pin n={index + 1} />
                {part}
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div>
        <h3 className="m-0 font-display text-2xl font-semibold">{frenchSpacing('Jamais « vrai » ou « faux »')}</h3>
        <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {VERIFICATION_STATES.map(({ state, label, chip }) => (
            <div key={state} className="rounded-card border border-border bg-surface p-4">
              <dt>
                <span className={`inline-block rounded-md border px-2.5 py-1 text-[15px] font-medium ${chip}`}>{label}</span>
              </dt>
              <dd className="m-0 mt-3 text-base leading-snug text-muted">{frenchSpacing(STATE_HINTS[state])}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
