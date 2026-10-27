import React from 'react';

import { reviewStore } from '../../review/reviewPrompt';

/**
 * The one-time store review request, under a finished report (see
 * `src/review/reviewPrompt.ts`). Quiet on purpose: a bordered note, never a
 * dialog, and nothing is offered in return for a review.
 */
export const ReviewPromptCard: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { url, name } = reviewStore(__TARGET__);
  return (
    <aside aria-label="Donner un avis" className="relative rounded-xl border border-line p-3 pr-9">
      <p className="text-xs leading-relaxed text-ink/80">
        Squiggle vous a servi ? Un avis aide d’autres lecteurs à le trouver.
      </p>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        onClick={onClose}
        className="mt-1.5 inline-block text-xs font-semibold text-accent-hover underline hover:text-ink"
      >
        Laisser un avis sur {name}
      </a>
      <button
        type="button"
        onClick={onClose}
        aria-label="Fermer, ne plus demander"
        className="absolute right-1.5 top-1.5 rounded-lg px-2 py-1 text-sm text-muted hover:bg-panel-muted hover:text-ink"
      >
        ×
      </button>
    </aside>
  );
};
