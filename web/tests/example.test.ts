/**
 * The example a reader opens without an account is written in advance, so it
 * is held to what the engine would produce on the same text: a strength above
 * 50, the band of its score, each quote found in the text it was made from,
 * and only the states a finding of its category can reach.
 */
import { describe, expect, it } from 'vitest';

import { determineScoreBand } from '../../shared/src/engine/scoring';
import { SCORE_DOMAINS } from '../../shared/src/engine/types';
import { FACTUAL_FINDING_CATEGORIES, RESEARCHABLE_FINDING_CATEGORIES } from '../../shared/src/engine/validator';
import { EXAMPLES, HERO_REPORT } from '../src/demo';
import { EXAMPLE_ARTICLE, EXAMPLE_BLOCKS, EXAMPLE_REPORT } from '../src/example';
import { locateFindings } from '../src/report';

describe('the example report', () => {
  it('scores the sum of its domains, in the engine’s band for it', () => {
    const total = EXAMPLE_REPORT.categories.reduce((sum, category) => sum + category.score, 0);
    expect(EXAMPLE_REPORT.score).toBe(total);
    expect(EXAMPLE_REPORT.scoreBand).toBe(determineScoreBand(total));
    expect(EXAMPLE_REPORT.categories.map((category) => [category.domain, category.maxScore])).toEqual(
      Object.entries(SCORE_DOMAINS).map(([domain, { weight }]) => [domain, weight]),
    );
  });

  it('names a strength, as the engine must above 50', () => {
    expect(EXAMPLE_REPORT.score).toBeGreaterThan(50);
    expect(EXAMPLE_REPORT.findings.some((finding) => finding.category === 'point-fort')).toBe(true);
  });

  it('finds every quote in the text, in the block it names', () => {
    const { located } = locateFindings(EXAMPLE_BLOCKS, EXAMPLE_REPORT.findings);
    expect(located.size).toBe(EXAMPLE_REPORT.findings.length);
    for (const finding of EXAMPLE_REPORT.findings) {
      expect(EXAMPLE_BLOCKS.find((block) => block.id === finding.blockId)?.text, finding.label).toContain(finding.quote);
    }
    expect(EXAMPLE_BLOCKS[0]).toMatchObject({ type: 'heading', text: EXAMPLE_ARTICLE.title });
  });

  it('gives each finding only a state its category can reach, and sources to a doubt', () => {
    for (const finding of EXAMPLE_REPORT.findings) {
      if (!FACTUAL_FINDING_CATEGORIES[finding.category]) expect(finding.verification, finding.label).toBeUndefined();
      else if (RESEARCHABLE_FINDING_CATEGORIES[finding.category])
        expect(['douteuse', 'non-verifiable'], finding.label).toContain(finding.verification);
      else expect(finding.verification, finding.label).toBe('non-sourcee');
      if (finding.verification === 'douteuse') expect(finding.sources?.length, finding.label).toBeGreaterThan(0);
    }
  });

  it('is the hero’s example: the same findings, the same research', () => {
    expect(EXAMPLE_REPORT.findings.map((finding) => finding.label)).toEqual(EXAMPLES.map((example) => example.label));
    expect(HERO_REPORT.research).toContain(`${EXAMPLE_REPORT.research.queries.length} recherches menées`);
    expect(EXAMPLE_REPORT.claims.map((claim) => claim.verification)).toEqual(['douteuse']);
  });
});
