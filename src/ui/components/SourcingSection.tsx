import React, { useState } from 'react';
import { SOURCE_NATURE_LABELS, type SourceNature, type SourcingEntry } from '@squiggle/shared';

/** The typology's own order: the most traceable sources first, nothing at all last. */
const NATURE_ORDER = Object.keys(SOURCE_NATURE_LABELS) as SourceNature[];

export interface SourcingSectionProps {
  sourcing: SourcingEntry[];
  /** Hosted mode only: BYOK sends nothing to our server, not even a counter. */
  onReport?: (nature: SourceNature) => void;
}

/**
 * The sources the text itself invokes, grouped by nature. It describes how the
 * text builds its credibility and never rates a source, and it is kept apart
 * from the findings' "Sources consultées", which are what Squiggle read.
 */
export const SourcingSection: React.FC<SourcingSectionProps> = ({ sourcing, onReport }) => {
  if (sourcing.length === 0) return null;
  const groups = NATURE_ORDER.map((nature) => ({
    nature,
    entries: sourcing.filter((entry) => entry.nature === nature),
  })).filter((group) => group.entries.length > 0);

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-ink">Sur quoi s’appuie le texte</h3>
      <p className="text-xs leading-relaxed text-muted">
        Les sources que le texte cite lui-même, classées par nature, sans juger de leur fiabilité. Celles
        que Squiggle a consultées figurent dans les constats.
      </p>
      <ul className="divide-y divide-line rounded-lg border border-line bg-panel px-3">
        {groups.map(({ nature, entries }) => (
          <li key={nature} className="py-2.5">
            <span className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-xs font-semibold uppercase tracking-wider text-muted">
                {SOURCE_NATURE_LABELS[nature]}
              </span>
              {onReport && <ReportNature label={SOURCE_NATURE_LABELS[nature]} onReport={() => onReport(nature)} />}
            </span>
            <ul className="mt-1 space-y-1">
              {entries.map((entry) => (
                <li key={`${entry.blockId}-${entry.charStart}`} className="font-serif text-xs italic text-ink/80">
                  « {entry.quote} »
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
};

/** One click per nature: only the nature shown is counted, never a passage. */
const ReportNature: React.FC<{ label: string; onReport: () => void }> = ({ label, onReport }) => {
  const [sent, setSent] = useState(false);
  if (sent) {
    return (
      <span role="status" className="text-xs text-muted">
        Merci, c’est noté.
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-label={`Signaler une erreur : ce n’est pas « ${label} »`}
      onClick={() => {
        onReport();
        setSent(true);
      }}
      className="shrink-0 rounded-xs text-xs text-muted underline decoration-line-heavy underline-offset-4 hover:text-ink focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-accent"
    >
      Signaler
    </button>
  );
};
