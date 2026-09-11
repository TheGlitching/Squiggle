import React from 'react';
import { typographyTokens } from '../tokens/typography';

export type FindingCategory =
  | 'all'
  | 'sophisme'
  | 'unsupported'
  | 'overreach'
  | 'sourceAbsent'
  | 'framing'
  | 'strength';

/**
 * Category identity is label + glyph, never colour. The six historical hues are
 * gone; colour in this panel means gravity (severity), so every pill is neutral
 * and only the selected one wears the accent.
 */
export interface CategoryPillConfig {
  id: FindingCategory;
  label: string;
  frenchLabel: string;
  shortCode: string;
  icon: string;
}

export const CATEGORY_DEFINITIONS: CategoryPillConfig[] = [
  {
    id: 'all',
    label: 'All Findings',
    frenchLabel: 'Tous les constats',
    shortCode: 'ALL',
    icon: '◈',
  },
  {
    id: 'sophisme',
    label: 'Fallacy',
    frenchLabel: 'Sophisme',
    shortCode: 'SOPH',
    icon: '⚡',
  },
  {
    id: 'unsupported',
    label: 'Unsupported Claim',
    frenchLabel: 'Affirmation non étayée',
    shortCode: 'NON-ÉT',
    icon: '⚠',
  },
  {
    id: 'overreach',
    label: 'Overinterpretation',
    frenchLabel: 'Surinterprétation',
    shortCode: 'SUR-INT',
    icon: '⇗',
  },
  {
    id: 'sourceAbsent',
    label: 'Missing Source',
    frenchLabel: 'Source absente',
    shortCode: 'SRC-ABS',
    icon: '∅',
  },
  {
    id: 'framing',
    label: 'Biased Framing',
    frenchLabel: 'Biais de cadrage',
    shortCode: 'CADR',
    icon: '⧉',
  },
  {
    id: 'strength',
    label: 'Strength / Solid',
    frenchLabel: 'Point fort',
    shortCode: 'FORT',
    icon: '✦',
  },
];

export type FindingCounts = Partial<Record<FindingCategory, number>>;

export interface CategoryFilterBarProps {
  selectedCategory: FindingCategory;
  onSelectCategory: (category: FindingCategory) => void;
  counts?: FindingCounts;
  totalCount?: number;
  size?: 'sm' | 'md' | 'lg';
  showZeroCounts?: boolean;
  className?: string;
}

export const CategoryFilterBar: React.FC<CategoryFilterBarProps> = ({
  selectedCategory = 'all',
  onSelectCategory,
  counts = {},
  totalCount,
  size = 'md',
  showZeroCounts = true,
  className = '',
}) => {
  const calculatedTotal =
    totalCount !== undefined
      ? totalCount
      : Object.entries(counts).reduce((acc, [cat, val]) => {
          if (cat === 'all') return acc;
          return acc + (typeof val === 'number' ? val : 0);
        }, 0);

  const sizeStyles = {
    sm: {
      padding: '4px 10px',
      fontSize: typographyTokens.fontSizes.xs,
      gap: '6px',
      badgeSize: '16px',
      badgeFontSize: '10px',
      iconSize: '11px',
    },
    md: {
      padding: '6px 14px',
      fontSize: typographyTokens.fontSizes.sm,
      gap: '8px',
      badgeSize: '20px',
      badgeFontSize: '11px',
      iconSize: '13px',
    },
    lg: {
      padding: '8px 18px',
      fontSize: typographyTokens.fontSizes.base,
      gap: '10px',
      badgeSize: '24px',
      badgeFontSize: '12px',
      iconSize: '15px',
    },
  }[size];

  return (
    <nav
      aria-label="Filtres des constats par catégorie"
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: size === 'sm' ? '6px' : size === 'lg' ? '12px' : '8px',
        padding: '4px 0',
        fontFamily: typographyTokens.fontFamilies.sans,
      }}
    >
      {CATEGORY_DEFINITIONS.map((category) => {
        const isSelected = selectedCategory === category.id;
        const count =
          category.id === 'all'
            ? (counts.all !== undefined ? counts.all : calculatedTotal)
            : (counts[category.id] ?? 0);
        const hasFindings = count > 0;

        if (!showZeroCounts && !hasFindings && category.id !== 'all' && !isSelected) {
          return null;
        }

        return (
          <button
            key={category.id}
            type="button"
            onClick={() => onSelectCategory(category.id)}
            aria-pressed={isSelected}
            className={`inline-flex items-center justify-center rounded-full border transition-colors ${
              isSelected
                ? 'border-accent bg-accent/10 text-accent-hover font-semibold'
                : 'border-line bg-transparent text-muted hover:text-ink hover:border-line-heavy'
            }`}
            style={{
              gap: sizeStyles.gap,
              padding: sizeStyles.padding,
              fontSize: sizeStyles.fontSize,
              lineHeight: 1,
              cursor: 'pointer',
              outline: 'none',
              userSelect: 'none',
            }}
          >
            {/* Category glyph: identity without colour. */}
            <span
              className={isSelected ? 'text-accent-hover' : 'text-faint'}
              style={{ fontSize: sizeStyles.iconSize, display: 'inline-flex', alignItems: 'center' }}
              aria-hidden="true"
            >
              {category.icon}
            </span>

            {/* Label */}
            <span>{category.frenchLabel}</span>

            {/* Finding Count Badge */}
            <span
              className={`inline-flex items-center justify-center rounded-full font-semibold ${
                isSelected ? 'bg-accent text-accent-foreground' : 'bg-line-soft text-muted'
              }`}
              style={{
                minWidth: sizeStyles.badgeSize,
                height: sizeStyles.badgeSize,
                padding: '0 5px',
                fontSize: sizeStyles.badgeFontSize,
                fontFamily: typographyTokens.fontFamilies.mono,
              }}
            >
              {count}
            </span>
          </button>
        );
      })}
    </nav>
  );
};
