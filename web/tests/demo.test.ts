/**
 * The demo must paint with the extension's own severity logic and palette. If
 * this mapping drifts from `src/adapters/findingAdapters.ts`, the landing shows
 * a colour the extension would never show.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  computeFourchesCaudinesScore,
  determineScoreBand,
  getScoreBandLabel,
} from '../../shared/src/engine/scoring';
import { SCORE_DOMAINS, type ScoreDomainKey } from '../../shared/src/engine/types';
import {
  FACTUAL_FINDING_CATEGORIES,
  RESEARCHABLE_FINDING_CATEGORIES,
} from '../../shared/src/engine/validator';

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
  const byLabel = Object.fromEntries(EXAMPLES.map((example) => [example.label, example]));

  it('resolves each of the five examples to its shipped colour', () => {
    expect(byLabel['Étude non nommée'].sev).toBe('info');
    expect(byLabel['Faux dilemme'].sev).toBe('warning');
    expect(byLabel['Exagération'].sev).toBe('warning');
    expect(byLabel['Chiffre mis en doute'].sev).toBe('warning');
    expect(byLabel['Autorité non nommée'].sev).toBe('info');
  });

  it('points each severity at the extension palette entry', () => {
    expect(severityColor(byLabel['Faux dilemme'].sev)).toBe(SEVERITY_COLORS.warning);
    expect(severityColor(byLabel['Étude non nommée'].sev)).toBe(SEVERITY_COLORS.info);
  });
});

// Every finding the landing shows must be one the engine can produce, with the
// domain, the verification state and the marks it would give it.
describe('the demo, as the engine would produce it', () => {
  const CAT_DOMAIN: Record<string, ScoreDomainKey> = {
    'Robustesse factuelle': 'robustesse_factuelle',
    'Solidité logique': 'solidite_logique',
    'Cadrage et rhétorique': 'cadrage_manipulation',
  };
  const fullMarks = (Object.keys(SCORE_DOMAINS) as ScoreDomainKey[]).map((domain) => ({
    domain,
    score: SCORE_DOMAINS[domain].weight,
  }));
  const standing = (findings: typeof EXAMPLES) =>
    computeFourchesCaudinesScore(fullMarks, findings).normalizedCategories.map((category) => category.score);

  it('names the domain each finding is scored in, and a strength costs nothing', () => {
    const domains = Object.keys(SCORE_DOMAINS);
    for (const example of EXAMPLES) {
      const lowered = standing([example]).flatMap((score, index) =>
        score < fullMarks[index].score ? [domains[index]] : [],
      );
      expect(lowered, example.label).toEqual(example.category === 'point-fort' ? [] : [CAT_DOMAIN[example.cat]]);
    }
  });

  // Above 50 the engine must name a strength, so a 61 shows one.
  it('shows a strength, as the engine must above 50', () => {
    expect(EXAMPLES.some((example) => example.category === 'point-fort' && example.sev === 'positive')).toBe(true);
  });

  it('gives each finding a verification state the engine can reach', () => {
    for (const example of EXAMPLES) {
      if (!FACTUAL_FINDING_CATEGORIES[example.category]) {
        expect(example.verification, example.label).toBeUndefined();
      } else if (RESEARCHABLE_FINDING_CATEGORIES[example.category]) {
        // A claim the sources confirm is withdrawn, never shown as a finding.
        expect(['douteuse', 'non-verifiable'], example.label).toContain(example.verification);
      } else {
        expect(example.verification, example.label).toBe('non-sourcee');
      }
    }
  });

  it('counts as looked up only the claims the research stage takes', () => {
    const researched = EXAMPLES.filter((example) => RESEARCHABLE_FINDING_CATEGORIES[example.category]);
    const confronted = researched.filter((example) => example.verification === 'douteuse');
    expect(HERO_REPORT.research).toMatch(
      new RegExp(`^${confronted.length} affirmation sur ${researched.length} confrontée à une source,`),
    );
    expect(HERO_REPORT.claims).toBe(`${confronted.length} douteuse`);
  });

  it('keeps each mark within what the findings leave of its domain', () => {
    const ceilings = standing(EXAMPLES);
    HERO_REPORT.marks.forEach((mark, index) => {
      expect(mark).toBeLessThanOrEqual(ceilings[index]);
    });
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
