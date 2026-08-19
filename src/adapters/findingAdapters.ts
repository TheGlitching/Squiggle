/**
 * Dialect bridge.
 *
 * Three modules independently invented their own vocabulary for the same
 * concepts, so nothing could talk to anything else:
 *
 *   engine/types.ts   Finding.category = 'sophisme' | 'affirmation-non-etayee' | ...
 *                     Finding.severity = 1 | 2 | 3
 *   content/types.ts  FindingHighlightTarget.category = 'logical_fallacy' | ...
 *                     FindingHighlightTarget.severity = 'critical' | 'warning' | ...
 *   CategoryFilterBar FindingCategory = 'all' | 'sophisme' | 'unsupported' | ...
 *
 * The engine taxonomy is the source of truth because it is what the LLM
 * contract actually emits. Everything else is projected from it here, so the
 * mapping lives in exactly one place instead of being re-guessed per consumer.
 */

import type { Finding, FindingCategory as EngineCategory, SeverityLevel } from '../engine/types';
import type { FindingHighlightTarget } from '../content/types';
import type { FindingCategory as FilterCategory } from '../ui/components/CategoryFilterBar';

/** Engine category -> filter-bar/theme key (the filter key doubles as a ThemeColors lookup). */
const ENGINE_TO_FILTER: Record<EngineCategory, Exclude<FilterCategory, 'all'>> = {
  sophisme: 'sophisme',
  'affirmation-non-etayee': 'unsupported',
  surinterpretation: 'overreach',
  'source-absente': 'sourceAbsent',
  cadrage: 'framing',
  'point-fort': 'strength',
};

const FILTER_TO_ENGINE = Object.fromEntries(
  Object.entries(ENGINE_TO_FILTER).map(([engine, filter]) => [filter, engine])
) as Record<Exclude<FilterCategory, 'all'>, EngineCategory>;

/** Engine category -> content-script highlight category. */
const ENGINE_TO_HIGHLIGHT: Record<EngineCategory, FindingHighlightTarget['category']> = {
  sophisme: 'logical_fallacy',
  'affirmation-non-etayee': 'factual_error',
  surinterpretation: 'methodological_flaw',
  'source-absente': 'unverified_source',
  cadrage: 'editorial_bias',
  'point-fort': 'rigorous_journalism',
};

/** Human-readable French labels, used wherever a raw enum would otherwise leak into the UI. */
export const CATEGORY_LABELS_FR: Record<EngineCategory, string> = {
  sophisme: 'Sophisme',
  'affirmation-non-etayee': 'Affirmation non étayée',
  surinterpretation: 'Surinterprétation',
  'source-absente': 'Source absente',
  cadrage: 'Cadrage',
  'point-fort': 'Point fort',
};

export function engineCategoryToFilter(category: EngineCategory): Exclude<FilterCategory, 'all'> {
  return ENGINE_TO_FILTER[category] ?? 'sophisme';
}

export function filterCategoryToEngine(category: FilterCategory): EngineCategory | null {
  if (category === 'all') return null;
  return FILTER_TO_ENGINE[category] ?? null;
}

/**
 * A 'point-fort' is a strength, not a defect, so it maps to 'positive'
 * regardless of its numeric severity.
 */
function severityToHighlightSeverity(
  severity: SeverityLevel,
  category: EngineCategory
): FindingHighlightTarget['severity'] {
  if (category === 'point-fort') return 'positive';
  switch (severity) {
    case 3:
      return 'critical';
    case 2:
      return 'warning';
    default:
      return 'info';
  }
}

/**
 * The conversion the background worker was missing: it posted raw engine
 * `Finding[]` to the content script, which reads `findingId`/string severities.
 * Every field name differed, so `findingId` was undefined and anchoring failed
 * silently on every single finding.
 */
export function findingToHighlightTarget(finding: Finding): FindingHighlightTarget {
  return {
    findingId: finding.id,
    blockId: finding.blockId,
    quote: finding.quote,
    severity: severityToHighlightSeverity(finding.severity, finding.category),
    category: ENGINE_TO_HIGHLIGHT[finding.category] ?? 'missing_context',
    title: finding.label || CATEGORY_LABELS_FR[finding.category] || 'Constat',
    explanation: finding.explanation,
  };
}

export function findingsToHighlightTargets(findings: Finding[]): FindingHighlightTarget[] {
  return findings.filter((f) => f && f.quote).map(findingToHighlightTarget);
}

/** Counts keyed by filter-bar category, for the pill badges. */
export function countFindingsByFilterCategory(findings: Finding[]): Record<string, number> {
  const counts: Record<string, number> = { all: findings.length };
  for (const finding of findings) {
    const key = engineCategoryToFilter(finding.category);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export function filterFindings(findings: Finding[], category: FilterCategory): Finding[] {
  const engineCategory = filterCategoryToEngine(category);
  if (!engineCategory) return findings;
  return findings.filter((f) => f.category === engineCategory);
}
