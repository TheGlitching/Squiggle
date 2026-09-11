import React from 'react';
import { Finding } from '@squiggle/shared';
import { SeverityBadge } from './SeverityBadge';
import { VerificationBadge } from './VerificationBadge';
import { SourceCitations } from './SourceCitations';
import { CATEGORY_LABELS_FR } from '../../adapters/findingAdapters';

export interface FindingCardProps {
  finding: Finding;
  isSelected?: boolean;
  isHovered?: boolean;
  onSelect?: (id: string) => void;
  onHover?: (id: string | null) => void;
}

type FindingTone = 'critical' | 'warning' | 'info' | 'positive';

/**
 * Colour means gravity, never category. A `point-fort` is a strength whatever
 * its number, so it borrows the positive tone; everything else follows its
 * severity. The category itself stays legible through its label and glyph.
 */
function findingTone(finding: Finding): FindingTone {
  if (finding.category === 'point-fort') return 'positive';
  switch (finding.severity) {
    case 3:
      return 'critical';
    case 2:
      return 'warning';
    default:
      return 'info';
  }
}

const TONE_LEFT_BAR: Record<FindingTone, string> = {
  critical: 'border-l-severity-critical',
  warning: 'border-l-severity-warning',
  info: 'border-l-severity-info',
  positive: 'border-l-severity-positive',
};

const TONE_EYEBROW: Record<FindingTone, string> = {
  critical: 'text-severity-critical-ink',
  warning: 'text-severity-warning-ink',
  info: 'text-severity-info-ink',
  positive: 'text-severity-positive-ink',
};

const TONE_QUOTE: Record<FindingTone, string> = {
  critical: 'border-l-severity-critical/60',
  warning: 'border-l-severity-warning/60',
  info: 'border-l-severity-info/60',
  positive: 'border-l-severity-positive/60',
};

const TONE_DOT: Record<FindingTone, string> = {
  critical: 'bg-severity-critical',
  warning: 'bg-severity-warning',
  info: 'bg-severity-info',
  positive: 'bg-severity-positive',
};

export const FindingCard: React.FC<FindingCardProps> = ({
  finding,
  isSelected,
  isHovered,
  onSelect,
  onHover,
}) => {
  const tone = findingTone(finding);

  return (
    <div
      onClick={() => onSelect?.(finding.id)}
      onMouseEnter={() => onHover?.(finding.id)}
      onMouseLeave={() => onHover?.(null)}
      className={`rounded-lg border border-l-[3px] p-3.5 transition-all cursor-pointer bg-panel ${TONE_LEFT_BAR[tone]} ${
        isSelected
          ? 'border-accent shadow-sm'
          : isHovered
          ? 'border-line-heavy'
          : 'border-line'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mb-1.5">
        <span
          className={`inline-flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-wider ${TONE_EYEBROW[tone]}`}
        >
          <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-sm ${TONE_DOT[tone]}`} />
          {CATEGORY_LABELS_FR[finding.category] ?? finding.category}
        </span>
        <span className="flex flex-wrap items-center justify-end gap-1.5">
          {finding.verification && <VerificationBadge verification={finding.verification} />}
          <SeverityBadge severity={finding.severity} />
        </span>
      </div>
      <h4 className="font-serif font-bold text-sm text-ink mb-1">
        {finding.label}
      </h4>
      <p className={`font-serif italic text-xs text-muted border-l-2 pl-2 mb-2 ${TONE_QUOTE[tone]}`}>
        « {finding.quote} »
      </p>
      <p className="text-xs text-ink/80 leading-relaxed mb-2">
        {finding.explanation}
      </p>
      <SourceCitations sources={finding.sources ?? []} />
    </div>
  );
};