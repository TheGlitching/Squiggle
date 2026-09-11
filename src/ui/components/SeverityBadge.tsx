import React from 'react';
import { SeverityLevel } from '@squiggle/shared';

export interface SeverityBadgeProps {
  severity: SeverityLevel;
}

export const SeverityBadge: React.FC<SeverityBadgeProps> = ({ severity }) => {
  const getBadgeStyle = () => {
    switch (severity) {
      case 3:
        return 'bg-severity-critical/15 text-severity-critical-ink border-severity-critical/50';
      case 2:
        return 'bg-severity-warning/15 text-severity-warning-ink border-severity-warning/50';
      case 1:
      default:
        return 'bg-severity-info/15 text-severity-info-ink border-severity-info/50';
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
