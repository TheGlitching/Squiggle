import React from 'react';
import { ScoreBand, ScoreDomainKey, SCORE_DOMAINS } from '@squiggle/shared';
import { determineScoreBand, getScoreBandLabel } from '@squiggle/shared';

export interface ScoreGaugeProps {
  score: number; // 0 to 100
  size?: number;
  strokeWidth?: number;
  showBandLabel?: boolean;
  scoreBand?: ScoreBand;
  className?: string;
}

/**
 * Domain marks carry one decimal, and this panel is French: a raw `10.5` would
 * print an English decimal point in the middle of French copy.
 */
export function formatPoints(value: number): string {
  return value.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
}

export function getScoreBandColor(band: ScoreBand): { stroke: string; text: string; bg: string } {
  switch (band) {
    case 'solide':
      return { stroke: '#059669', text: 'text-severity-positive-ink', bg: 'bg-severity-positive/15' };
    case 'perfectible':
      return { stroke: '#2563EB', text: 'text-severity-info-ink', bg: 'bg-severity-info/15' };
    case 'fragile':
      return { stroke: '#D97706', text: 'text-severity-warning-ink', bg: 'bg-severity-warning/15' };
    case 'problematique':
      return { stroke: '#DC2626', text: 'text-severity-critical-ink', bg: 'bg-severity-critical/15' };
  }
}

export const ScoreGauge = (props: ScoreGaugeProps) => <ScoreRadialGauge {...props} />;
export const ScoreRadialGauge: React.FC<ScoreGaugeProps> = ({
  score,
  size = 110,
  strokeWidth = 9,
  showBandLabel = true,
  scoreBand,
  className = '',
}) => {
  const effectiveBand = scoreBand || determineScoreBand(score);
  const colors = getScoreBandColor(effectiveBand);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedScore = Math.max(0, Math.min(100, score));
  const strokeDashoffset = circumference - (clampedScore / 100) * circumference;

  return (
    <div className={`relative inline-flex flex-col items-center justify-center ${className}`}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Track background */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-line fill-none"
        />
        {/* Value circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="fill-none transition-all duration-700 ease-out"
        />
      </svg>

      {/* Center score readout */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-mono text-2xl font-black text-ink tracking-tight leading-none">
          {Math.round(clampedScore)}
        </span>
        <span className="font-sans text-[10px] text-muted font-semibold uppercase tracking-widest mt-0.5">
          / 100
        </span>
      </div>

      {/* The band key is an identifier, not copy: rendered raw it reached the
          reader as an unaccented "PROBLEMATIQUE". */}
      {showBandLabel && (
        <span className={`mt-2 font-mono text-xs font-bold uppercase tracking-wider text-center ${colors.text}`}>
          {getScoreBandLabel(effectiveBand).title}
        </span>
      )}
    </div>
  );
};

export interface DomainGaugeProps {
  domainKey: ScoreDomainKey;
  score: number; // domain raw score
  maxScore?: number; // default from SCORE_DOMAINS
  strengths?: string[];
  weaknesses?: string[];
  expanded?: boolean;
  onToggle?: () => void;
  className?: string;
}

/**
 * One bar per domain of the scoring grid, expandable onto its criteria and the
 * strengths and weaknesses found.
 */
export const DomainScoreGauge: React.FC<DomainGaugeProps> = ({
  domainKey,
  score,
  maxScore,
  strengths = [],
  weaknesses = [],
  expanded = false,
  onToggle,
  className = '',
}) => {
  // A stored analysis produced under an earlier grid can carry a domain this
  // build no longer knows. Its weight and criteria are gone, so there is no
  // honest denominator to draw a bar against: skip it rather than invent one.
  const def = SCORE_DOMAINS[domainKey];
  if (!def) return null;

  const weight = maxScore ?? def.weight;
  const percentage = Math.round((Math.max(0, Math.min(weight, score)) / weight) * 100);
  const band = determineScoreBand(percentage);
  const colors = getScoreBandColor(band);

  return (
    <div
      className={`p-3 rounded border border-line bg-panel transition-colors ${className}`}
    >
      <div
        className="flex items-start justify-between cursor-pointer select-none"
        onClick={onToggle}
      >
        <div className="flex-1 min-w-0 pr-2">
          {/* The side panel is narrow and these labels are long: the label owns
              the slack and wraps, the mark stays on one line and never shrinks. */}
          <div className="flex items-baseline justify-between gap-2 text-xs mb-1">
            <span className="font-sans font-bold text-ink min-w-0 break-words leading-snug">
              {def.label}
            </span>
            <span className="font-mono font-semibold text-muted shrink-0 whitespace-nowrap tabular-nums">
              <strong className="text-ink">{formatPoints(score)}</strong> / {formatPoints(weight)} pts
            </span>
          </div>

          {/* Progress Bar */}
          <div className="h-2 w-full bg-line-soft rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${percentage}%`,
                backgroundColor: colors.stroke,
              }}
            />
          </div>
        </div>

        {/* Anchored to the first line rather than centred: a label that wraps to
            two lines would otherwise pull the caret away from the row it opens. */}
        <div className="font-mono text-xs text-faint pl-1 shrink-0">
          {expanded ? '▲' : '▼'}
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-line-soft text-xs space-y-2">
          <p className="font-serif italic text-muted text-[13px]">
            {def.description}
          </p>

          {def.criteria && def.criteria.length > 0 && (
            <div className="mt-2">
              <div className="font-sans uppercase text-[10px] font-bold text-muted tracking-wider mb-1">
                Critères vérifiés
              </div>
              {/* Outside markers: at side-panel width most of these wrap, and an
                  inside marker sends the second line back under the bullet. */}
              <ul className="list-disc list-outside pl-4 space-y-0.5 text-ink/80">
                {def.criteria.map((crit, idx) => (
                  <li key={idx} className="text-[12px]">{crit}</li>
                ))}
              </ul>
            </div>
          )}

          {strengths.length > 0 && (
            <div className="mt-2 text-severity-positive-ink">
              <span className="font-bold text-[11px] uppercase tracking-wide">Points forts :</span>
              <ul className="list-disc list-outside pl-4 text-[12px] space-y-0.5 mt-0.5">
                {strengths.map((s, idx) => (
                  <li key={idx}>{s}</li>
                ))}
              </ul>
            </div>
          )}

          {weaknesses.length > 0 && (
            <div className="mt-2 text-severity-critical-ink">
              <span className="font-bold text-[11px] uppercase tracking-wide">Faiblesses relevées :</span>
              <ul className="list-disc list-outside pl-4 text-[12px] space-y-0.5 mt-0.5">
                {weaknesses.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
