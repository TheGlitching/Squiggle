import React from 'react';
import { ScoreBand, ScoreDomainKey, SCORE_DOMAINS } from '../../engine/types';

export interface ScoreGaugeProps {
  score: number; // 0 to 100
  size?: number;
  strokeWidth?: number;
  showBandLabel?: boolean;
  scoreBand?: ScoreBand;
  className?: string;
}

export function getScoreBand(score: number): ScoreBand {
  if (score >= 85) return 'solide';
  if (score >= 70) return 'perfectible';
  if (score >= 50) return 'fragile';
  return 'problematique';
}

export function getScoreBandColor(band: ScoreBand): { stroke: string; text: string; bg: string } {
  switch (band) {
    case 'solide':
      return { stroke: '#059669', text: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40' };
    case 'perfectible':
      return { stroke: '#2563EB', text: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/40' };
    case 'fragile':
      return { stroke: '#D97706', text: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/40' };
    case 'problematique':
      return { stroke: '#DC2626', text: 'text-rose-700 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-950/40' };
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
  const effectiveBand = scoreBand || getScoreBand(score);
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
          className="text-stone-200 dark:text-stone-800 fill-none"
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
        <span className="font-mono text-2xl font-black text-stone-900 dark:text-stone-100 tracking-tight leading-none">
          {Math.round(clampedScore)}
        </span>
        <span className="font-sans text-[10px] text-stone-500 dark:text-stone-400 font-semibold uppercase tracking-widest mt-0.5">
          / 100
        </span>
      </div>

      {showBandLabel && (
        <span className={`mt-2 font-mono text-xs font-bold uppercase tracking-wider ${colors.text}`}>
          {effectiveBand}
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
 * 10-Domain individual gauge bar with criteria checklist and strengths/weaknesses breakdown
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
  const def = SCORE_DOMAINS[domainKey] || {
    key: domainKey,
    label: domainKey,
    weight: 10,
    description: '',
    criteria: [],
  };

  const weight = maxScore ?? def.weight;
  const percentage = Math.round((Math.max(0, Math.min(weight, score)) / weight) * 100);
  const band = getScoreBand(percentage);
  const colors = getScoreBandColor(band);

  return (
    <div
      className={`p-3 rounded border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 transition-colors ${className}`}
    >
      <div
        className="flex items-center justify-between cursor-pointer select-none"
        onClick={onToggle}
      >
        <div className="flex-1 pr-2">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-sans font-bold text-stone-800 dark:text-stone-200">
              {def.label}
            </span>
            <span className="font-mono font-semibold text-stone-600 dark:text-stone-400">
              <strong className="text-stone-900 dark:text-stone-100">{score}</strong> / {weight} pts
            </span>
          </div>

          {/* Progress Bar */}
          <div className="h-2 w-full bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${percentage}%`,
                backgroundColor: colors.stroke,
              }}
            />
          </div>
        </div>

        <div className="font-mono text-xs text-stone-400 pl-1">
          {expanded ? '▲' : '▼'}
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-stone-100 dark:border-stone-800 text-xs space-y-2">
          <p className="font-serif italic text-stone-600 dark:text-stone-400 text-[13px]">
            {def.description}
          </p>

          {def.criteria && def.criteria.length > 0 && (
            <div className="mt-2">
              <div className="font-sans uppercase text-[10px] font-bold text-stone-500 tracking-wider mb-1">
                Critères vérifiés
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-stone-700 dark:text-stone-300">
                {def.criteria.map((crit, idx) => (
                  <li key={idx} className="text-[12px]">{crit}</li>
                ))}
              </ul>
            </div>
          )}

          {strengths.length > 0 && (
            <div className="mt-2 text-emerald-700 dark:text-emerald-400">
              <span className="font-bold text-[11px] uppercase tracking-wide">Points forts:</span>
              <ul className="list-disc list-inside text-[12px] space-y-0.5 mt-0.5">
                {strengths.map((s, idx) => (
                  <li key={idx}>{s}</li>
                ))}
              </ul>
            </div>
          )}

          {weaknesses.length > 0 && (
            <div className="mt-2 text-rose-700 dark:text-rose-400">
              <span className="font-bold text-[11px] uppercase tracking-wide">Faiblesses / Vigilances:</span>
              <ul className="list-disc list-inside text-[12px] space-y-0.5 mt-0.5">
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
