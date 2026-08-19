import React from 'react';
import { Finding } from '../../engine/types';
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

export const FindingCard: React.FC<FindingCardProps> = ({
  finding,
  isSelected,
  isHovered,
  onSelect,
  onHover,
}) => {
  return (
    <div
      onClick={() => onSelect?.(finding.id)}
      onMouseEnter={() => onHover?.(finding.id)}
      onMouseLeave={() => onHover?.(null)}
      className={`p-3.5 rounded-lg border transition-all cursor-pointer ${
        isSelected
          ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20 shadow-sm'
          : isHovered
          ? 'border-stone-400 dark:border-stone-600 bg-stone-50/50 dark:bg-stone-800/40'
          : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="font-mono text-xs font-semibold uppercase tracking-wider text-stone-600 dark:text-stone-400">
          {CATEGORY_LABELS_FR[finding.category] ?? finding.category}
        </span>
        <span className="flex items-center gap-1.5">
          {finding.verification && <VerificationBadge verification={finding.verification} />}
          <SeverityBadge severity={finding.severity} />
        </span>
      </div>
      <h4 className="font-serif font-bold text-sm text-stone-900 dark:text-stone-100 mb-1">
        {finding.label}
      </h4>
      <p className="font-serif italic text-xs text-stone-600 dark:text-stone-400 border-l-2 border-amber-400 pl-2 mb-2">
        « {finding.quote} »
      </p>
      <p className="text-xs text-stone-700 dark:text-stone-300 leading-relaxed mb-2">
        {finding.explanation}
      </p>
      <SourceCitations sources={finding.sources ?? []} />
    </div>
  );
};
