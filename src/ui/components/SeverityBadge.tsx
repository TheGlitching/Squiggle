import React from 'react';
import { SeverityLevel } from '../../engine/types';

export interface SeverityBadgeProps {
  severity: SeverityLevel;
}

export const SeverityBadge: React.FC<SeverityBadgeProps> = ({ severity }) => {
  const getBadgeStyle = () => {
    switch (severity) {
      case 3:
        return 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300 dark:border-rose-800';
      case 2:
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-800';
      case 1:
      default:
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300 dark:border-blue-800';
    }
  };

  const getLabel = () => {
    switch (severity) {
      case 3:
        return 'Critique';
      case 2:
        return 'Majeur';
      case 1:
      default:
        return 'Mineur';
    }
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase tracking-wider border ${getBadgeStyle()}`}
    >
      {getLabel()}
    </span>
  );
};
