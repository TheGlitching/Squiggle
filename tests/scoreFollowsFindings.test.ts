import { describe, it, expect } from 'vitest';
import { computeFourchesCaudinesScore } from '../src/engine/scoring';
import { SCORE_DOMAINS } from '../src/engine/types';

/**
 * The reported defect: a hit piece quoting an invented poll - no institute, no
 * methodology, no date - scored 59/100 overall and 9.5/20 on factual
 * robustness, while the audit's own weakness note for that domain described the
 * missing institute, methodology and date exactly. The mark and the findings
 * disagreed, and the mark was what the reader saw.
 *
 * The mark is now coupled to the findings: each defect removes a share of the
 * marks awarded in its domain. These tests pin that coupling and, deliberately,
 * the absence of any ceiling - two articles the audit judged differently must
 * still be scored differently once their defects are counted, which is exactly
 * the distinction a cap destroys.
 */

/** Generous marks, as a lenient model tends to award them. */
const generous = () =>
  (Object.keys(SCORE_DOMAINS) as Array<keyof typeof SCORE_DOMAINS>).map((domain) => ({
    domain,
    score: SCORE_DOMAINS[domain].weight * 0.9,
  }));

const marksFor = (result: ReturnType<typeof computeFourchesCaudinesScore>, domain: string) =>
  result.normalizedCategories.find((c) => c.domain === domain)!.score;

describe('a domain mark follows the defects the audit reported in it', () => {
  it('removes the greater share for a graver defect', () => {
    const minor = computeFourchesCaudinesScore(generous(), [
      { category: 'source-absente', severity: 1 },
    ]);
    const grave = computeFourchesCaudinesScore(generous(), [
      { category: 'source-absente', severity: 3 },
    ]);

    expect(marksFor(grave, 'robustesse_factuelle')).toBeLessThan(
      marksFor(minor, 'robustesse_factuelle'),
    );
  });

  it('compounds several defects in the same domain', () => {
    const one = computeFourchesCaudinesScore(generous(), [
      { category: 'source-absente', severity: 2 },
    ]);
    const two = computeFourchesCaudinesScore(generous(), [
      { category: 'source-absente', severity: 2 },
      { category: 'affirmation-non-etayee', severity: 2 },
    ]);

    expect(marksFor(two, 'robustesse_factuelle')).toBeLessThan(
      marksFor(one, 'robustesse_factuelle'),
    );
  });

  it('leaves a domain alone when the defects belong to another one', () => {
    const result = computeFourchesCaudinesScore(generous(), [
      { category: 'sophisme', severity: 3 },
    ]);

    expect(marksFor(result, 'robustesse_factuelle')).toBeCloseTo(
      SCORE_DOMAINS.robustesse_factuelle.weight * 0.9,
      1,
    );
    expect(marksFor(result, 'solidite_logique')).toBeLessThan(
      SCORE_DOMAINS.solidite_logique.weight * 0.9,
    );
  });

  it('never lets a strength move a mark', () => {
    const bare = computeFourchesCaudinesScore(generous(), []);
    const praised = computeFourchesCaudinesScore(generous(), [
      { category: 'point-fort', severity: 1 },
    ]);

    expect(praised.totalScore).toBe(bare.totalScore);
  });

  it('weighs an unproven suspicion less than a defect the evidence confirmed', () => {
    const suspected = computeFourchesCaudinesScore(generous(), [
      { category: 'source-absente', severity: 3, verification: 'non-verifiable' },
    ]);
    const proven = computeFourchesCaudinesScore(generous(), [
      { category: 'source-absente', severity: 3, verification: 'douteuse' },
    ]);

    expect(marksFor(proven, 'robustesse_factuelle')).toBeLessThan(
      marksFor(suspected, 'robustesse_factuelle'),
    );
  });

  /**
   * The property a ceiling cannot have. Two articles the audit judged
   * differently, carrying the same defect, stay apart afterwards; a cap would
   * flatten both onto its limit and lose the difference for good.
   */
  it('keeps two differently judged articles apart once their defects are counted', () => {
    const sameDefect = [{ category: 'source-absente' as const, severity: 3 as const }];

    const weaker = computeFourchesCaudinesScore(
      generous().map((s) =>
        s.domain === 'robustesse_factuelle' ? { ...s, score: s.score * 0.5 } : s,
      ),
      sameDefect,
    );
    const stronger = computeFourchesCaudinesScore(generous(), sameDefect);

    expect(marksFor(stronger, 'robustesse_factuelle')).toBeGreaterThan(
      marksFor(weaker, 'robustesse_factuelle'),
    );
  });

  it('sinks the reported case well below the score it used to get', () => {
    // Generous marks everywhere, yet the audit reported the fabricated poll as a
    // grave sourcing defect and the piece's framing as a grave one too.
    const result = computeFourchesCaudinesScore(generous(), [
      { category: 'source-absente', severity: 3, verification: 'douteuse' },
      { category: 'cadrage', severity: 3 },
      { category: 'sophisme', severity: 2 },
    ]);

    expect(result.totalScore).toBeLessThan(59);
  });
});
