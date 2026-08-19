import React, { useState, useId } from 'react';
import { lightTheme, darkTheme, ThemeColors } from '../tokens/colors';
import { typographyTokens } from '../tokens/typography';

export type RevisionPriorityLevel = 'priority1_blocking' | 'priority2_major' | 'priority3_editorial_optimizations';

export interface RevisionPlanActionItem {
  id: string;
  problem: string;
  reason: string;
  action: string;
  blockId?: string;
  quote?: string;
  resolved?: boolean;
}

export interface PrioritizedRevisionPlanData {
  priority1_blocking: RevisionPlanActionItem[];
  priority2_major: RevisionPlanActionItem[];
  priority3_editorial_optimizations: RevisionPlanActionItem[];
}

export interface PriorityTierConfig {
  id: RevisionPriorityLevel;
  tierNumber: 1 | 2 | 3;
  label: string;
  frenchLabel: string;
  badgeLabel: string;
  shortCode: string;
  description: string;
  icon: string;
  colorKey: keyof Pick<ThemeColors, 'sophisme' | 'unsupported' | 'framing'>;
  subtleColorKey: keyof Pick<ThemeColors, 'sophismeSubtle' | 'unsupportedSubtle' | 'framingSubtle'>;
  borderColorKey: keyof Pick<ThemeColors, 'sophismeBorder' | 'unsupportedBorder' | 'framingBorder'>;
}

export const PRIORITY_TIERS: PriorityTierConfig[] = [
  {
    id: 'priority1_blocking',
    tierNumber: 1,
    label: 'Priority 1 (Blocking)',
    frenchLabel: 'Priorité 1 - Bloquant',
    badgeLabel: 'P1 Bloquant',
    shortCode: 'P1',
    description: 'Erreurs factuelles, sophismes graves, affirmations sans preuve centrale',
    icon: '⚡',
    colorKey: 'sophisme',
    subtleColorKey: 'sophismeSubtle',
    borderColorKey: 'sophismeBorder',
  },
  {
    id: 'priority2_major',
    tierNumber: 2,
    label: 'Priority 2 (Major)',
    frenchLabel: 'Priorité 2 - Majeur',
    badgeLabel: 'P2 Majeur',
    shortCode: 'P2',
    description: 'Nuances manquantes, transitions abruptes, sources incomplètes, surinterprétations',
    icon: '⚠',
    colorKey: 'unsupported',
    subtleColorKey: 'unsupportedSubtle',
    borderColorKey: 'unsupportedBorder',
  },
  {
    id: 'priority3_editorial_optimizations',
    tierNumber: 3,
    label: 'Priority 3 (Editorial Optimization)',
    frenchLabel: 'Priorité 3 - Optimisation éditoriale',
    badgeLabel: 'P3 Optimisation',
    shortCode: 'P3',
    description: 'Rythme, ton, accroche, chutes, renforcement de l’impact et de la voix d’auteur',
    icon: '✦',
    colorKey: 'framing',
    subtleColorKey: 'framingSubtle',
    borderColorKey: 'framingBorder',
  },
];

export interface RevisionPlanProps {
  plan: PrioritizedRevisionPlanData;
  onToggleItem?: (tier: RevisionPriorityLevel, itemId: string, resolved: boolean) => void;
  resolvedItemIds?: Record<string, boolean>;
  onNavigateToBlock?: (blockId: string) => void;
  theme?: 'light' | 'dark';
  className?: string;
  defaultExpandedTiers?: Partial<Record<RevisionPriorityLevel, boolean>>;
}

export const PrioritizedRevisionPlan: React.FC<RevisionPlanProps> = ({
  plan,
  onToggleItem,
  resolvedItemIds = {},
  onNavigateToBlock,
  theme = 'light',
  className = '',
  defaultExpandedTiers = {
    priority1_blocking: true,
    priority2_major: true,
    priority3_editorial_optimizations: true,
  },
}) => {
  const currentTheme = theme === 'dark' ? darkTheme : lightTheme;
  const baseId = useId();

  const [expandedTiers, setExpandedTiers] = useState<Record<RevisionPriorityLevel, boolean>>({
    priority1_blocking: defaultExpandedTiers.priority1_blocking ?? true,
    priority2_major: defaultExpandedTiers.priority2_major ?? true,
    priority3_editorial_optimizations: defaultExpandedTiers.priority3_editorial_optimizations ?? true,
  });

  const [localResolved, setLocalResolved] = useState<Record<string, boolean>>({});

  const isItemResolved = (itemId: string, itemPropResolved?: boolean): boolean => {
    if (resolvedItemIds[itemId] !== undefined) return resolvedItemIds[itemId];
    if (localResolved[itemId] !== undefined) return localResolved[itemId];
    return !!itemPropResolved;
  };

  const handleToggle = (tier: RevisionPriorityLevel, item: RevisionPlanActionItem) => {
    const currentStatus = isItemResolved(item.id, item.resolved);
    const nextStatus = !currentStatus;

    setLocalResolved((prev) => ({
      ...prev,
      [item.id]: nextStatus,
    }));

    if (onToggleItem) {
      onToggleItem(tier, item.id, nextStatus);
    }
  };

  const toggleTierAccordion = (tierId: RevisionPriorityLevel) => {
    setExpandedTiers((prev) => ({
      ...prev,
      [tierId]: !prev[tierId],
    }));
  };

  const tierStats = PRIORITY_TIERS.map((tier) => {
    const items = plan[tier.id] || [];
    const total = items.length;
    const resolved = items.filter((item) => isItemResolved(item.id, item.resolved)).length;
    const pending = total - resolved;
    const percent = total > 0 ? Math.round((resolved / total) * 100) : 100;
    return {
      tier,
      items,
      total,
      resolved,
      pending,
      percent,
    };
  });

  const totalItems = tierStats.reduce((acc, curr) => acc + curr.total, 0);
  const totalResolved = tierStats.reduce((acc, curr) => acc + curr.resolved, 0);
  const totalPending = totalItems - totalResolved;
  const overallPercent = totalItems > 0 ? Math.round((totalResolved / totalItems) * 100) : 100;

  return (
    <section
      aria-labelledby={`${baseId}-heading`}
      className={className}
      style={{
        fontFamily: typographyTokens.fontFamilies.sans,
        color: currentTheme.text,
        backgroundColor: currentTheme.surface,
        borderRadius: '8px',
        border: `1px solid ${currentTheme.border}`,
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          padding: '16px 20px',
          borderBottom: `1px solid ${currentTheme.border}`,
          backgroundColor: currentTheme.surfaceElevated,
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                backgroundColor: currentTheme.accentSubtle,
                color: currentTheme.accent,
                fontSize: '14px',
                fontWeight: typographyTokens.fontWeights.bold,
              }}
              aria-hidden="true"
            >
              §8
            </span>
            <div>
              <h2
                id={`${baseId}-heading`}
                style={{
                  margin: 0,
                  fontSize: typographyTokens.fontSizes.lg,
                  fontWeight: typographyTokens.fontWeights.bold,
                  letterSpacing: '-0.02em',
                  fontFamily: typographyTokens.fontFamilies.sans,
                  color: currentTheme.text,
                  lineHeight: 1.2,
                }}
              >
                Plan de révision priorisé
              </h2>
              <p
                style={{
                  margin: '2px 0 0 0',
                  fontSize: typographyTokens.fontSizes.xs,
                  color: currentTheme.textMuted,
                  fontFamily: typographyTokens.fontFamilies.serif,
                }}
              >
                Recommandations hiérarchisées pour mise en conformité éditoriale
              </p>
            </div>
          </div>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 12px',
              borderRadius: '9999px',
              backgroundColor: currentTheme.surfaceMuted,
              border: `1px solid ${currentTheme.borderSubtle}`,
            }}
          >
            <span
              style={{
                fontSize: typographyTokens.fontSizes.xs,
                fontFamily: typographyTokens.fontFamilies.mono,
                fontWeight: typographyTokens.fontWeights.semibold,
                color: currentTheme.textMuted,
              }}
            >
              PROGRÈS :
            </span>
            <span
              style={{
                fontSize: typographyTokens.fontSizes.xs,
                fontFamily: typographyTokens.fontFamilies.mono,
                fontWeight: typographyTokens.fontWeights.bold,
                color: totalPending === 0 ? currentTheme.strength : currentTheme.accent,
              }}
            >
              {totalResolved}/{totalItems} résolus ({overallPercent}%)
            </span>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '8px',
            marginTop: '4px',
          }}
          aria-label="Statistiques par niveau de priorité"
        >
          {tierStats.map(({ tier, resolved, pending }) => {
            const tierColor = currentTheme[tier.colorKey] as string;
            const tierSubtle = currentTheme[tier.subtleColorKey] as string;
            const tierBorder = currentTheme[tier.borderColorKey] as string;

            return (
              <div
                key={tier.id}
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  backgroundColor: tierSubtle,
                  border: `1px solid ${tierBorder}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span
                    style={{
                      fontSize: '12px',
                      color: tierColor,
                      display: 'inline-flex',
                    }}
                  >
                    {tier.icon}
                  </span>
                  <span
                    style={{
                      fontSize: typographyTokens.fontSizes.xs,
                      fontWeight: typographyTokens.fontWeights.bold,
                      color: tierColor,
                    }}
                  >
                    {tier.shortCode}
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontFamily: typographyTokens.fontFamilies.mono,
                    fontSize: typographyTokens.fontSizes.xs,
                  }}
                >
                  <span
                    title={`${pending} restant(s)`}
                    style={{
                      color: pending > 0 ? tierColor : currentTheme.textFaint,
                      fontWeight: typographyTokens.fontWeights.bold,
                    }}
                  >
                    {pending} en attente
                  </span>
                  <span style={{ color: currentTheme.textFaint }}>/</span>
                  <span
                    title={`${resolved} résolu(s)`}
                    style={{
                      color: resolved > 0 ? currentTheme.strength : currentTheme.textMuted,
                    }}
                  >
                    {resolved} résolu{resolved > 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {tierStats.map(({ tier, items, total, resolved, pending }) => {
          const isExpanded = expandedTiers[tier.id];
          const tierColor = currentTheme[tier.colorKey] as string;
          const tierSubtle = currentTheme[tier.subtleColorKey] as string;
          const tierBorder = currentTheme[tier.borderColorKey] as string;
          const sectionId = `${baseId}-tier-${tier.id}`;

          return (
            <div
              key={tier.id}
              style={{
                borderBottom: `1px solid ${currentTheme.border}`,
              }}
            >
              <button
                type="button"
                onClick={() => toggleTierAccordion(tier.id)}
                aria-expanded={isExpanded}
                aria-controls={sectionId}
                style={{
                  width: '100%',
                  padding: '12px 20px',
                  backgroundColor: currentTheme.surface,
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background-color 0.15s ease',
                  outline: 'none',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = currentTheme.surfaceHover;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = currentTheme.surface;
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      fontSize: typographyTokens.fontSizes.xs,
                      fontWeight: typographyTokens.fontWeights.bold,
                      backgroundColor: tierSubtle,
                      color: tierColor,
                      border: `1px solid ${tierBorder}`,
                      fontFamily: typographyTokens.fontFamilies.mono,
                    }}
                  >
                    <span>{tier.icon}</span>
                    <span>{tier.badgeLabel}</span>
                  </span>

                  <div>
                    <span
                      style={{
                        fontSize: typographyTokens.fontSizes.sm,
                        fontWeight: typographyTokens.fontWeights.bold,
                        color: currentTheme.text,
                        marginRight: '8px',
                      }}
                    >
                      {tier.frenchLabel}
                    </span>
                    <span
                      style={{
                        fontSize: typographyTokens.fontSizes.xs,
                        color: currentTheme.textMuted,
                        fontFamily: typographyTokens.fontFamilies.serif,
                      }}
                    >
                      ({tier.description})
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span
                    style={{
                      fontSize: typographyTokens.fontSizes.xs,
                      fontFamily: typographyTokens.fontFamilies.mono,
                      fontWeight: typographyTokens.fontWeights.semibold,
                      padding: '2px 8px',
                      borderRadius: '9999px',
                      backgroundColor: pending === 0 ? currentTheme.strengthSubtle : currentTheme.surfaceMuted,
                      color: pending === 0 ? currentTheme.strength : currentTheme.textMuted,
                      border: `1px solid ${pending === 0 ? currentTheme.strengthBorder : currentTheme.borderSubtle}`,
                    }}
                  >
                    {resolved}/{total}
                  </span>
                  <span
                    style={{
                      fontSize: '12px',
                      color: currentTheme.textMuted,
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s ease',
                      display: 'inline-block',
                    }}
                    aria-hidden="true"
                  >
                    ▼
                  </span>
                </div>
              </button>

              {isExpanded && (
                <div
                  id={sectionId}
                  style={{
                    backgroundColor: currentTheme.surfaceElevated,
                    padding: '8px 20px 16px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  {items.length === 0 ? (
                    <div
                      style={{
                        padding: '14px 16px',
                        borderRadius: '6px',
                        backgroundColor: currentTheme.surfaceMuted,
                        color: currentTheme.textMuted,
                        fontSize: typographyTokens.fontSizes.sm,
                        fontStyle: 'italic',
                        textAlign: 'center',
                        border: `1px dashed ${currentTheme.border}`,
                      }}
                    >
                      Aucune action requise pour ce niveau de priorité.
                    </div>
                  ) : (
                    items.map((item, idx) => {
                      const resolved = isItemResolved(item.id, item.resolved);
                      const checkboxId = `${baseId}-item-${item.id}`;

                      return (
                        <div
                          key={item.id || idx}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                            padding: '12px 14px',
                            borderRadius: '6px',
                            backgroundColor: resolved ? currentTheme.surfaceMuted : currentTheme.surface,
                            border: `1px solid ${resolved ? currentTheme.borderSubtle : currentTheme.border}`,
                            opacity: resolved ? 0.75 : 1,
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              justifyContent: 'space-between',
                              gap: '12px',
                            }}
                          >
                            <label
                              htmlFor={checkboxId}
                              style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '10px',
                                cursor: 'pointer',
                                flex: 1,
                              }}
                            >
                              <input
                                id={checkboxId}
                                type="checkbox"
                                checked={resolved}
                                onChange={() => handleToggle(tier.id, item)}
                                style={{
                                  marginTop: '2px',
                                  width: '16px',
                                  height: '16px',
                                  cursor: 'pointer',
                                  accentColor: tierColor,
                                }}
                              />
                              <div>
                                <span
                                  style={{
                                    fontSize: typographyTokens.fontSizes.sm,
                                    fontWeight: typographyTokens.fontWeights.bold,
                                    color: resolved ? currentTheme.textMuted : currentTheme.text,
                                    textDecoration: resolved ? 'line-through' : 'none',
                                    lineHeight: 1.4,
                                    display: 'block',
                                  }}
                                >
                                  {item.action}
                                </span>
                              </div>
                            </label>

                            {item.blockId && (
                              <button
                                type="button"
                                onClick={() => onNavigateToBlock && onNavigateToBlock(item.blockId!)}
                                title={`Atteindre le paragraphe ${item.blockId}`}
                                style={{
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                  backgroundColor: currentTheme.surfaceHighlight,
                                  border: `1px solid ${currentTheme.borderHeavy}`,
                                  fontSize: typographyTokens.fontSizes.xs,
                                  fontFamily: typographyTokens.fontFamilies.mono,
                                  color: currentTheme.textMuted,
                                  cursor: onNavigateToBlock ? 'pointer' : 'default',
                                  whiteSpace: 'nowrap',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                              >
                                <span>§</span>
                                <span>{item.blockId}</span>
                              </button>
                            )}
                          </div>

                          <div
                            style={{
                              marginLeft: '26px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '4px',
                              fontSize: typographyTokens.fontSizes.xs,
                            }}
                          >
                            <div style={{ color: currentTheme.textMuted }}>
                              <strong style={{ color: tierColor }}>Problème constaté : </strong>
                              <span style={{ fontFamily: typographyTokens.fontFamilies.serif }}>
                                {item.problem}
                              </span>
                            </div>
                            <div style={{ color: currentTheme.textMuted }}>
                              <strong style={{ color: currentTheme.text }}>Justification : </strong>
                              <span style={{ fontFamily: typographyTokens.fontFamilies.serif }}>
                                {item.reason}
                              </span>
                            </div>

                            {item.quote && (
                              <blockquote
                                style={{
                                  margin: '4px 0 0 0',
                                  padding: '4px 10px',
                                  borderLeft: `2px solid ${tierColor}`,
                                  backgroundColor: tierSubtle,
                                  fontFamily: typographyTokens.fontFamilies.serif,
                                  fontStyle: 'italic',
                                  color: currentTheme.text,
                                  borderRadius: '0 4px 4px 0',
                                }}
                              >
                                « {item.quote} »
                              </blockquote>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
