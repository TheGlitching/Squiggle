import React from 'react';
import { EvidenceSource } from '../../engine/types';

/**
 * The reader weighs a source the article itself hyperlinked differently from one
 * dug up afterwards, so the provenance travels with every citation.
 */
const ORIGIN_LABELS: Record<EvidenceSource['origin'], string> = {
  article: 'cité par l’article',
  search: 'trouvé en recherche',
};

export function sourceDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export interface SourceCitationsProps {
  sources: EvidenceSource[];
  label?: string;
}

export const SourceCitations: React.FC<SourceCitationsProps> = ({
  sources,
  label = 'Sources consultées',
}) => {
  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-2" data-tour="finding-sources">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
        {label}
      </span>
      <ul className="mt-1 space-y-1.5">
        {sources.map((source, index) => (
          <li key={`${source.url}-${index}`} className="text-[11px] leading-snug">
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              // The enclosing card toggles selection on click; following a
              // citation must not also collapse the card it was read from.
              onClick={(event) => event.stopPropagation()}
              className="block text-amber-700 dark:text-amber-400 underline decoration-dotted decoration-from-font underline-offset-2 hover:decoration-solid"
            >
              <span className="font-mono text-stone-500 dark:text-stone-400">
                {sourceDomain(source.url)}
              </span>
              {' · '}
              {source.title || source.url}
            </a>
            <span className="block text-[10px] text-stone-500 dark:text-stone-400">
              {ORIGIN_LABELS[source.origin]}
            </span>
            {source.quote && (
              <p className="mt-0.5 pl-2 border-l border-stone-300 dark:border-stone-700 font-serif italic text-stone-500 dark:text-stone-400">
                « {source.quote} »
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};
