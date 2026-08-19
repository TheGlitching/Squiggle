import { describe, expect, it } from 'vitest';
import { enforceEvidenceHonesty, reconcileResearchedFindings } from '../src/engine/validator';
import { computeFourchesCaudinesScore, ScoreComputationResult } from '../src/engine/scoring';
import { EvidenceSource, FactualClaim, Finding, SCORE_DOMAINS } from '../src/engine/types';

/**
 * Method section 3.5 mandates exactly four states for a factual assertion:
 * vérifiée, vérifiable mais non sourcée dans le texte, douteuse, non
 * vérifiable telle qu'écrite. These tests pin the distinctions between them
 * that the old three-state 'confirmed' | 'contradicted' | 'unverified' model
 * could not express: an unsourced claim is not a doubted one, and the two
 * must never cost a reader's trust in the article the same amount.
 */

function makeFinding(overrides: Partial<Finding> & Pick<Finding, 'category'>): Finding {
  return {
    id: 'f1',
    blockId: 'b1',
    quote: 'le taux est passé de 3 % à 5 %',
    severity: 2,
    label: 'Constat',
    explanation: "L'affirmation n'est pas sourcée dans le texte.",
    confidence: 0.9,
    ...overrides
  };
}

/** Generous marks, as a lenient model tends to award them. */
const generousScores = () =>
  (Object.keys(SCORE_DOMAINS) as Array<keyof typeof SCORE_DOMAINS>).map((domain) => ({
    domain,
    score: SCORE_DOMAINS[domain].weight * 0.9
  }));

describe('the four-state classification', () => {
  it('lands an unsourced-but-checkable claim on non-sourcee, never on a doubt', () => {
    const [result] = enforceEvidenceHonesty([makeFinding({ category: 'source-absente', blockId: 'b1' })], {});

    expect(result.category).toBe('source-absente');
    expect(result.verification).toBe('non-sourcee');
    expect(result.verification).not.toBe('douteuse');
  });

  it('lands a claim the evidence undermines on douteuse', () => {
    const source: EvidenceSource = { title: 'Rapport officiel', url: 'https://gouv.fr/rapport', origin: 'search' };
    const finding = makeFinding({ id: 'f1', category: 'affirmation-non-etayee' });
    const claim: FactualClaim = {
      id: 'c1',
      findingId: 'f1',
      blockId: 'b1',
      quote: finding.quote,
      claim: finding.quote,
      verification: 'douteuse',
      sources: [source]
    };

    const { findings } = reconcileResearchedFindings([finding], [claim]);

    expect(findings[0].verification).toBe('douteuse');
    expect(findings[0].sources).toEqual([source]);
  });

  it('never counts a subscription pitch on a publisher subdomain as a cited source', () => {
    // Regression pin at the classification level: enforceEvidenceHonesty only
    // ever sees what the extractor decided counts as a citation, so a self-link
    // on another subdomain of the publisher must never reach articleSources in
    // the first place. See tests/extractorLinks.test.ts for the extractor-level
    // proof of the registrable-domain fix this depends on.
    const [result] = enforceEvidenceHonesty([makeFinding({ category: 'source-absente', blockId: 'b1' })], {
      b1: []
    });

    expect(result.verification).toBe('non-sourcee');
    expect(result.sources).toBeUndefined();
  });

  it('still yields the article\'s real citations when the canonical link was relative', () => {
    // Regression pin at the classification level: a relative canonical must not
    // silently empty articleSources for every block. See
    // tests/extractorLinks.test.ts for the extractor-level proof that a
    // relative canonical no longer discards every citation.
    const articleSource: EvidenceSource = { title: 'Insee', url: 'https://insee.fr/statistiques/12345', origin: 'article' };
    const [result] = enforceEvidenceHonesty([makeFinding({ category: 'source-absente', blockId: 'b1' })], {
      b1: [articleSource]
    });

    expect(result.verification).toBe('non-sourcee');
    expect(result.sources).toEqual([articleSource]);
  });

  it('costs a domain markedly less for non-sourcee than for douteuse', () => {
    const unsourced = computeFourchesCaudinesScore(generousScores(), [
      { category: 'source-absente', severity: 3, verification: 'non-sourcee' }
    ]);
    const doubted = computeFourchesCaudinesScore(generousScores(), [
      { category: 'source-absente', severity: 3, verification: 'douteuse' }
    ]);

    const marksFor = (result: ScoreComputationResult) =>
      result.normalizedCategories.find((c) => c.domain === 'robustesse_factuelle')!.score;

    const genericMark = SCORE_DOMAINS.robustesse_factuelle.weight * 0.9;
    const unsourcedLoss = genericMark - marksFor(unsourced);
    const doubtedLoss = genericMark - marksFor(doubted);

    expect(unsourcedLoss).toBeGreaterThan(0);
    expect(unsourcedLoss).toBeLessThan(doubtedLoss / 2);
  });

  it('never costs anything once a claim is verifiee', () => {
    const bare = computeFourchesCaudinesScore(generousScores(), []);
    const verified = computeFourchesCaudinesScore(generousScores(), [
      { category: 'source-absente', severity: 3, verification: 'verifiee' }
    ]);

    expect(verified.totalScore).toBe(bare.totalScore);
  });
});
