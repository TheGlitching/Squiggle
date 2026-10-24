/**
 * The demo must paint with the extension's own severity logic and palette. If
 * this mapping drifts from `src/adapters/findingAdapters.ts`, the landing shows
 * a colour the extension would never show.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { determineScoreBand, getScoreBandLabel } from '../../shared/src/engine/scoring';

import {
  CATEGORY_LABELS,
  EXAMPLES,
  HERO_ARTICLE,
  HERO_REPORT,
  SCORE_BANDS,
  SEVERITY_LABELS,
  findingTone,
  scoreBand,
  SEVERITY_COLORS,
  severityColor,
  severityToHighlightSeverity,
} from '../src/demo';

describe('severityToHighlightSeverity', () => {
  it('always reads a strength as positive', () => {
    expect(severityToHighlightSeverity(3, 'point-fort')).toBe('positive');
  });

  it('caps a non-sourced or verified finding at info', () => {
    expect(severityToHighlightSeverity(3, 'sophisme', 'non-sourcee')).toBe('info');
    expect(severityToHighlightSeverity(3, 'sophisme', 'verifiee')).toBe('info');
  });

  it('maps the remaining severity levels', () => {
    expect(severityToHighlightSeverity(3, 'sophisme', 'douteuse')).toBe('critical');
    expect(severityToHighlightSeverity(3, 'sophisme', 'non-verifiable')).toBe('warning');
    expect(severityToHighlightSeverity(2, 'cadrage')).toBe('warning');
    expect(severityToHighlightSeverity(1, 'surinterpretation')).toBe('info');
  });
});

describe('example -> severity -> colour', () => {
  const byCategory = Object.fromEntries(EXAMPLES.map((example) => [example.cat, example]));

  it('resolves each of the five examples to its shipped colour', () => {
    expect(byCategory['Robustesse factuelle'].sev).toBe('info');
    expect(byCategory['Solidité logique'].sev).toBe('critical');
    expect(byCategory['Cadrage et rhétorique'].sev).toBe('warning');
    expect(byCategory['Déontologie'].sev).toBe('warning');
    expect(byCategory['Soin de la langue'].sev).toBe('info');
  });

  it('points each severity at the extension palette entry', () => {
    expect(severityColor(byCategory['Solidité logique'].sev)).toBe(SEVERITY_COLORS.critical);
    expect(severityColor(byCategory['Déontologie'].sev)).toBe(SEVERITY_COLORS.warning);
    expect(severityColor(byCategory['Robustesse factuelle'].sev)).toBe(SEVERITY_COLORS.info);
  });
});

// The hero rebuilds the extension's panel, so its labels, bands and tones are
// mirrors of the panel's own and must not drift from them.
describe('the hero panel', () => {
  const source = (path: string) => readFileSync(resolve(__dirname, '../../src', path), 'utf8');

  it('names categories and severities with the panel’s own labels', () => {
    const adapters = source('adapters/findingAdapters.ts');
    for (const [key, label] of Object.entries(CATEGORY_LABELS)) {
      expect(adapters).toMatch(new RegExp(`'?${key}'?: '${label}'`));
    }
    const badge = source('ui/components/SeverityBadge.tsx');
    for (const label of Object.values(SEVERITY_LABELS)) {
      expect(badge).toContain(`return '${label}'`);
    }
  });

  it('bands a score exactly as the engine does', () => {
    for (let score = 0; score <= 100; score += 1) {
      const band = scoreBand(score);
      expect(band).toBe(determineScoreBand(score));
      expect(SCORE_BANDS[band].title).toBe(getScoreBandLabel(band).title);
    }
  });

  it('tones a finding card by severity alone, a strength aside', () => {
    expect(findingTone(2, 'affirmation-non-etayee')).toBe('warning');
    expect(findingTone(3, 'sophisme')).toBe('critical');
    expect(findingTone(1, 'surinterpretation')).toBe('info');
    expect(findingTone(3, 'point-fort')).toBe('positive');
  });

  it('reports a fragile 61, whose marks add up and stay within each domain', () => {
    const score = HERO_REPORT.marks.reduce((sum, mark) => sum + mark, 0);
    expect(score).toBe(61);
    expect(scoreBand(score)).toBe('fragile');
    expect(HERO_REPORT.marks).toHaveLength(5);
  });

  it('highlights every demo finding once in the article', () => {
    const shown = HERO_ARTICLE.paragraphs.flat().filter((part) => typeof part === 'number');
    expect([...shown].sort()).toEqual(EXAMPLES.map((_, index) => index));
    expect(shown).toContain(HERO_REPORT.selected);
  });
});
