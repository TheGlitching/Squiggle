import React from 'react';
import { lightTheme, darkTheme, ThemeColors } from '../tokens/colors';
import { typographyTokens } from '../tokens/typography';

export type FindingCategory =
  | 'all'
  | 'sophisme'
  | 'unsupported'
  | 'overreach'
  | 'sourceAbsent'
  | 'framing'
  | 'strength';

export interface CategoryPillConfig {
  id: FindingCategory;
  label: string;
  frenchLabel: string;
  shortCode: string;
  icon: string;
  colorKey: keyof Pick<
    ThemeColors,
    'accent' | 'sophisme' | 'unsupported' | 'overreach' | 'sourceAbsent' | 'framing' | 'strength'
  >;
  subtleColorKey: keyof Pick<
    ThemeColors,
    'accentSubtle' | 'sophismeSubtle' | 'unsupportedSubtle' | 'overreachSubtle' | 'sourceAbsentSubtle' | 'framingSubtle' | 'strengthSubtle'
  >;
  borderColorKey: keyof Pick<
    ThemeColors,
    'border' | 'sophismeBorder' | 'unsupportedBorder' | 'overreachBorder' | 'sourceAbsentBorder' | 'framingBorder' | 'strengthBorder'
  >;
}

export const CATEGORY_DEFINITIONS: CategoryPillConfig[] = [
  {
    id: 'all',
    label: 'All Findings',
    frenchLabel: 'Tous les constats',
    shortCode: 'ALL',
    icon: '◈',
    colorKey: 'accent',
    subtleColorKey: 'accentSubtle',
    borderColorKey: 'border',
  },
  {
    id: 'sophisme',
    label: 'Fallacy',
    frenchLabel: 'Sophisme',
    shortCode: 'SOPH',
    icon: '⚡',
    colorKey: 'sophisme',
    subtleColorKey: 'sophismeSubtle',
    borderColorKey: 'sophismeBorder',
  },
  {
    id: 'unsupported',
    label: 'Unsupported Claim',
    frenchLabel: 'Affirmation non étayée',
    shortCode: 'NON-ÉT',
    icon: '⚠',
    colorKey: 'unsupported',
    subtleColorKey: 'unsupportedSubtle',
    borderColorKey: 'unsupportedBorder',
  },
  {
    id: 'overreach',
    label: 'Overinterpretation',
    frenchLabel: 'Surinterprétation',
    shortCode: 'SUR-INT',
    icon: '⇗',
    colorKey: 'overreach',
    subtleColorKey: 'overreachSubtle',
    borderColorKey: 'overreachBorder',
  },
  {
    id: 'sourceAbsent',
    label: 'Missing Source',
    frenchLabel: 'Source absente',
    shortCode: 'SRC-ABS',
    icon: '∅',
    colorKey: 'sourceAbsent',
    subtleColorKey: 'sourceAbsentSubtle',
    borderColorKey: 'sourceAbsentBorder',
  },
  {
    id: 'framing',
    label: 'Biased Framing',
    frenchLabel: 'Biais de cadrage',
    shortCode: 'CADR',
    icon: '⧉',
    colorKey: 'framing',
    subtleColorKey: 'framingSubtle',
    borderColorKey: 'framingBorder',
  },
  {
    id: 'strength',
    label: 'Strength / Solid',
    frenchLabel: 'Point fort',
    shortCode: 'FORT',
    icon: '✦',
    colorKey: 'strength',
    subtleColorKey: 'strengthSubtle',
    borderColorKey: 'strengthBorder',
  },
];

export type FindingCounts = Partial<Record<FindingCategory, number>>;

export interface CategoryFilterBarProps {
  selectedCategory: FindingCategory;
  onSelectCategory: (category: FindingCategory) => void;
  counts?: FindingCounts;
  totalCount?: number;
  theme?: 'light' | 'dark';
  size?: 'sm' | 'md' | 'lg';
  showZeroCounts?: boolean;
  className?: string;
}

export const CategoryFilterBar: React.FC<CategoryFilterBarProps> = ({
  selectedCategory = 'all',
  onSelectCategory,
  counts = {},
  totalCount,
  theme = 'light',
  size = 'md',
  showZeroCounts = true,
  className = '',
}) => {
  const currentTheme = theme === 'dark' ? darkTheme : lightTheme;

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

        const categoryColor = currentTheme[category.colorKey] as string;
        const categorySubtle = currentTheme[category.subtleColorKey] as string;
        const categoryBorder = currentTheme[category.borderColorKey] as string;

        return (
          <button
            key={category.id}
            type="button"
            onClick={() => onSelectCategory(category.id)}
            aria-pressed={isSelected}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: sizeStyles.gap,
              padding: sizeStyles.padding,
              fontSize: sizeStyles.fontSize,
              fontWeight: isSelected
                ? typographyTokens.fontWeights.bold
                : typographyTokens.fontWeights.medium,
              lineHeight: 1,
              borderRadius: '9999px',
              cursor: 'pointer',
              transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
              outline: 'none',
              border: `1.5px solid ${
                isSelected
                  ? categoryColor
                  : currentTheme.border
              }`,
              backgroundColor: isSelected
                ? categorySubtle
                : currentTheme.surface,
              color: isSelected
                ? categoryColor
                : currentTheme.textMuted,
              boxShadow: isSelected
                ? `0 2px 8px -2px ${categoryColor}33, 0 1px 2px 0 rgba(0,0,0,0.05)`
                : '0 1px 2px 0 rgba(0,0,0,0.02)',
              userSelect: 'none',
            }}
            onMouseEnter={(e) => {
              if (!isSelected) {
                e.currentTarget.style.borderColor = categoryBorder;
                e.currentTarget.style.backgroundColor = currentTheme.surfaceHover;
                e.currentTarget.style.color = currentTheme.text;
              }
            }}
            onMouseLeave={(e) => {
              if (!isSelected) {
                e.currentTarget.style.borderColor = currentTheme.border;
                e.currentTarget.style.backgroundColor = currentTheme.surface;
                e.currentTarget.style.color = currentTheme.textMuted;
              }
            }}
          >
            {/* Category Icon */}
            <span
              style={{
                fontSize: sizeStyles.iconSize,
                color: isSelected ? categoryColor : currentTheme.textFaint,
                display: 'inline-flex',
                alignItems: 'center',
              }}
              aria-hidden="true"
            >
              {category.icon}
            </span>

            {/* Label */}
            <span>{category.frenchLabel}</span>

            {/* Finding Count Badge */}
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: sizeStyles.badgeSize,
                height: sizeStyles.badgeSize,
                padding: '0 5px',
                borderRadius: '9999px',
                fontSize: sizeStyles.badgeFontSize,
                fontFamily: typographyTokens.fontFamilies.mono,
                fontWeight: typographyTokens.fontWeights.semibold,
                backgroundColor: isSelected
                  ? categoryColor
                  : currentTheme.surfaceMuted,
                color: isSelected
                  ? '#FFFFFF'
                  : currentTheme.textMuted,
                transition: 'background-color 0.15s ease, color 0.15s ease',
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
