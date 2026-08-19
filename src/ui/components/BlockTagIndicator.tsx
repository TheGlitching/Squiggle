import React from 'react';
import type { FourchesBlockId } from '../../engine/types';

/**
 * This file previously contained exactly one line - `export * from
 * './BlockTagIndicator';` - a self-referential module that exported nothing and
 * broke resolution for anything importing it.
 */

const BLOCK_LABELS: Record<FourchesBlockId, { short: string; label: string }> = {
  verdict: { short: 'V', label: 'Verdict' },
  scores: { short: 'S', label: 'Scores' },
  summary: { short: 'R', label: 'Résumé' },
  surface_corrections: { short: 'C1', label: 'Corrections de surface' },
  substantive_improvements: { short: 'C2', label: 'Améliorations de fond' },
  editorial_coherence: { short: 'CE', label: 'Cohérence éditoriale' },
  editorial_power: { short: 'PE', label: 'Puissance éditoriale' },
  prioritized_revision_plan: { short: 'PR', label: 'Plan de révision' },
};

export interface BlockTagIndicatorProps {
  blockId: FourchesBlockId | string;
  showLabel?: boolean;
}

export const BlockTagIndicator: React.FC<BlockTagIndicatorProps> = ({ blockId, showLabel }) => {
  const known = BLOCK_LABELS[blockId as FourchesBlockId];
  const short = known?.short ?? blockId.slice(0, 2).toUpperCase();
  const label = known?.label ?? blockId;

  return (
    <span
      title={label}
      className="inline-flex items-center gap-1 rounded-md bg-[#F5F5F4] dark:bg-[#27272A] px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide text-[#57534E] dark:text-[#D4D4D8]"
    >
      {short}
      {showLabel && <span className="font-sans font-normal">{label}</span>}
    </span>
  );
};
