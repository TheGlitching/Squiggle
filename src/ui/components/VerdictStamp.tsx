import React from 'react';
import { EditorialVerdict } from '../../engine/types';

export interface VerdictConfig {
  label: string;
  sublabel: string;
  colorVar: string;
  bgLight: string;
  borderLight: string;
  textLight: string;
  bgDark: string;
  borderDark: string;
  textDark: string;
  iconName: string;
  latinMotto: string;
}

export const VERDICT_CONFIGS: Record<EditorialVerdict, VerdictConfig> = {
  publier: {
    label: 'PUBLIER',
    sublabel: 'Texte rigoureux & prêt à diffusion',
    colorVar: '--color-verdict-publier',
    bgLight: 'bg-emerald-50 text-emerald-900 border-emerald-600',
    borderLight: '#059669',
    textLight: '#065F46',
    bgDark: 'dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-500',
    borderDark: '#34D399',
    textDark: '#A7F3D0',
    iconName: 'check-circle',
    latinMotto: 'NIHIL OBSTAT • IMPRIMATUR',
  },
  publier_apres_corrections_mineures: {
    label: 'PUBLIER APRÈS CORRECTIONS',
    sublabel: 'Retouches factuelles ou formelles requises',
    colorVar: '--color-verdict-corrections',
    bgLight: 'bg-blue-50 text-blue-900 border-blue-600',
    borderLight: '#2563EB',
    textLight: '#1E40AF',
    bgDark: 'dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-400',
    borderDark: '#60A5FA',
    textDark: '#BFDBFE',
    iconName: 'edit-3',
    latinMotto: 'CORRIGE ET EMITTE',
  },
  reviser_avant_publication: {
    label: 'RÉVISER AVANT PUBLICATION',
    sublabel: 'Faiblesses logiques ou documentaires majeures',
    colorVar: '--color-verdict-reviser',
    bgLight: 'bg-amber-50 text-amber-900 border-amber-600',
    borderLight: '#D97706',
    textLight: '#92400E',
    bgDark: 'dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-400',
    borderDark: '#FBBF24',
    textDark: '#FDE68A',
    iconName: 'alert-triangle',
    latinMotto: 'REVISIO NECESSARIA',
  },
  bloquer: {
    label: 'BLOQUER',
    sublabel: 'Refus éditorial - Défaillances critiques',
    colorVar: '--color-verdict-bloquer',
    bgLight: 'bg-rose-50 text-rose-900 border-rose-600',
    borderLight: '#DC2626',
    textLight: '#991B1B',
    bgDark: 'dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-500',
    borderDark: '#F87171',
    textDark: '#FECACA',
    iconName: 'shield-alert',
    latinMotto: 'NON CONCEDITUR • NON IMPRIMATUR',
  },
};

export interface VerdictStampProps {
  verdict: EditorialVerdict;
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
  score?: number;
  className?: string;
}

/**
 * Authentic editorial seal / verdict stamp
 * Features classic double-ruled border, ink-stamp rotation, vintage editorial typography
 */
export const VerdictStamp: React.FC<VerdictStampProps> = ({
  verdict,
  size = 'md',
  animated = false,
  score,
  className = '',
}) => {
  const config = VERDICT_CONFIGS[verdict] || VERDICT_CONFIGS.reviser_avant_publication;

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs tracking-wider border-2 gap-1.5',
    md: 'px-4 py-2 text-sm tracking-widest border-2 gap-2',
    lg: 'px-6 py-3.5 text-base tracking-[0.2em] border-[3px] gap-3',
  }[size];

  const rotationClass = {
    publier: '-rotate-1',
    publier_apres_corrections_mineures: '-rotate-0.5',
    reviser_avant_publication: 'rotate-1',
    bloquer: 'rotate-2',
  }[verdict];

  return (
    <div
      className={`inline-flex flex-col items-center justify-center font-sans font-extrabold uppercase select-none rounded-sm transition-transform duration-300 ${sizeClasses} ${config.bgLight} ${config.bgDark} ${rotationClass} shadow-sm ${
        animated ? 'animate-stamp' : ''
      } ${className}`}
      style={{
        boxShadow: 'inset 0 0 0 1px currentColor, 0 2px 8px -2px rgba(0,0,0,0.1)',
      }}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-[0.65em] opacity-75 font-semibold">
          {config.latinMotto.split('•')[0].trim()}
        </span>
        {score !== undefined && (
          <span className="font-mono px-1.5 py-0.5 bg-current text-white dark:text-stone-900 rounded text-[0.7em] font-bold">
            {Math.round(score)}/100
          </span>
        )}
      </div>

      <div className="font-black text-center leading-none tracking-widest my-0.5">
        {config.label}
      </div>

      {size !== 'sm' && (
        <div className="font-serif normal-case text-[0.7em] font-normal italic tracking-normal opacity-90 text-center">
          {config.sublabel}
        </div>
      )}
    </div>
  );
};
