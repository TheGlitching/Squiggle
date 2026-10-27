import React, { useState } from 'react';
import { Finding, FLAG_REASONS, type FlagReason } from '@squiggle/shared';
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
  /** Report the finding as wrong. Absent in BYOK mode, which sends nothing to our server. */
  onReport?: (reason: FlagReason) => void;
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
  onReport,
}) => {
  const tone = findingTone(finding);

  return (
    <div
      onClick={() => onSelect?.(finding.id)}
      onMouseEnter={() => onHover?.(finding.id)}
      onMouseLeave={() => onHover?.(null)}
      className={`rounded-lg border border-l-[3px] p-3.5 transition-all cursor-pointer bg-panel ${TONE_LEFT_BAR[tone]} ${
        isSelected
          ? 'border-accent shadow-xs'
          : isHovered
          ? 'border-line-heavy'
          : 'border-line'
      }`}
    >
      <div className="mb-1.5 flex flex-col items-start gap-1.5">
        <span
          className={`inline-flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-wider ${TONE_EYEBROW[tone]}`}
        >
          <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-xs ${TONE_DOT[tone]}`} />
          {CATEGORY_LABELS_FR[finding.category] ?? finding.category}
        </span>
        {/* Meaning-carrying badges are 14 px, so they get their own row instead of
            squeezing the category label. A strength is not graded: "Mineur" beside
            "Point fort" reads as a fault. */}
        {(finding.verification || finding.category !== 'point-fort') && (
          <span className="flex flex-wrap items-center gap-1.5">
            {finding.verification && <VerificationBadge verification={finding.verification} />}
            {finding.category !== 'point-fort' && <SeverityBadge severity={finding.severity} />}
          </span>
        )}
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
      {onReport && <ReportFinding onReport={onReport} />}
    </div>
  );
};

const REPORT_LINK =
  'text-xs text-muted underline decoration-line-heavy underline-offset-4 hover:text-ink focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-accent rounded-xs';

/**
 * "Signaler une erreur": one click opens the closed list of reasons, one more
 * sends it. Only the category and the reason are counted, never the text.
 */
const ReportFinding: React.FC<{ onReport: (reason: FlagReason) => void }> = ({ onReport }) => {
  const [state, setState] = useState<'closed' | 'open' | 'sent'>('closed');
  // The card selects its finding on click; a report must not.
  const stop = (event: React.MouseEvent) => event.stopPropagation();

  if (state === 'sent') {
    return (
      <p role="status" className="mt-2 text-xs text-muted">
        Merci, c’est noté. Seuls la catégorie et le motif sont comptés.
      </p>
    );
  }
  if (state === 'closed') {
    return (
      <button
        type="button"
        aria-expanded={false}
        onClick={(event) => {
          stop(event);
          setState('open');
        }}
        className={`mt-2 block whitespace-nowrap text-left ${REPORT_LINK}`}
      >
        Signaler une erreur
      </button>
    );
  }
  return (
    <div role="group" aria-label="Ce qui ne va pas dans ce constat" className="mt-2" onClick={stop}>
      <p className="text-xs text-muted mb-1.5">Qu’est-ce qui ne va pas ?</p>
      <div className="flex flex-wrap gap-1.5">
        {FLAG_REASONS.map(({ id, label }, index) => (
          <button
            key={id}
            type="button"
            autoFocus={index === 0}
            onClick={() => {
              onReport(id);
              setState('sent');
            }}
            className="whitespace-nowrap rounded-md border border-line px-2 py-1 text-xs text-ink hover:border-line-heavy focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-accent"
          >
            {label}
          </button>
        ))}
        <button type="button" onClick={() => setState('closed')} className={`whitespace-nowrap px-1 ${REPORT_LINK}`}>
          Annuler
        </button>
      </div>
    </div>
  );
};