import { describe, expect, it } from 'vitest';
import { enforceEvidenceHonesty, parseAndValidateLlmOutput, reconcileResearchedFindings } from '../src/engine/validator';
import { AnalysisInput, EvidenceSource, FactualClaim, Finding } from '../src/engine/types';

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

const sampleInput: AnalysisInput = {
  url: 'https://example.com/article-1',
  title: 'Une révolution technologique majeure',
  author: 'Jean Dupont',
  outlet: 'example.com',
  language: 'fr',
  blocks: [
    { id: 'b1', type: 'heading', text: 'Une révolution technologique majeure', charStart: 0 },
    {
      id: 'b2',
      type: 'paragraph',
      text: 'Les experts affirment que cette technologie va remplacer tous les serveurs existants.',
      charStart: 40
    }
  ]
};

describe('enforceEvidenceHonesty', () => {
  it('downgrades a contradicted factual finding with no sources to unverified', () => {
    const [result] = enforceEvidenceHonesty(
      [makeFinding({ category: 'affirmation-non-etayee', verification: 'contradicted', sources: [] })],
      {}
    );
    expect(result.verification).toBe('unverified');
  });

  it('keeps a contradicted factual finding backed by sources as contradicted', () => {
    const source: EvidenceSource = { title: 'INSEE', url: 'https://insee.fr/taux', origin: 'search' };
    const [result] = enforceEvidenceHonesty(
      [makeFinding({ category: 'affirmation-non-etayee', verification: 'contradicted', sources: [source] })],
      {}
    );
    expect(result.verification).toBe('contradicted');
    expect(result.sources).toEqual([source]);
  });

  it('defaults a factual finding with no verification at all to unverified', () => {
    const [result] = enforceEvidenceHonesty([makeFinding({ category: 'surinterpretation' })], {});
    expect(result.verification).toBe('unverified');
  });

  it('keeps verification undefined for editorial categories, even if the model set one', () => {
    const [sophisme] = enforceEvidenceHonesty(
      [makeFinding({ category: 'sophisme', verification: 'contradicted' })],
      {}
    );
    expect(sophisme.verification).toBeUndefined();

    const [pointFort] = enforceEvidenceHonesty([makeFinding({ category: 'point-fort' })], {});
    expect(pointFort.verification).toBeUndefined();

    const [cadrage] = enforceEvidenceHonesty([makeFinding({ category: 'cadrage' })], {});
    expect(cadrage.verification).toBeUndefined();
  });

  it('re-categorises source-absente on a block the article actually cited, attaching the article source', () => {
    const articleSource: EvidenceSource = {
      title: 'Rapport officiel',
      url: 'https://gouv.fr/rapport',
      origin: 'search'
    };
    const [result] = enforceEvidenceHonesty(
      [makeFinding({ blockId: 'b2', category: 'source-absente', label: 'Source absente' })],
      { b2: [articleSource] }
    );

    expect(result.category).toBe('affirmation-non-etayee');
    expect(result.verification).toBe('unverified');
    expect(result.sources).toHaveLength(1);
    expect(result.sources?.[0]).toMatchObject({ url: 'https://gouv.fr/rapport', origin: 'article' });
    expect(result.explanation).toContain('source');
  });

  it('leaves source-absente untouched when the block carries no cited source', () => {
    const [result] = enforceEvidenceHonesty(
      [makeFinding({ blockId: 'b1', category: 'source-absente' })],
      { b2: [{ title: 'Autre', url: 'https://example.com/x', origin: 'search' }] }
    );
    expect(result.category).toBe('source-absente');
    expect(result.verification).toBe('unverified');
  });
});

describe('parseAndValidateLlmOutput honesty and evidence wiring', () => {
  const rawWithContradiction = JSON.stringify({
    summary: 'Article globalement solide.',
    scores: [
      { domain: 'orthographe_grammaire', score: 5 },
      { domain: 'clarte_lisibilite', score: 9 },
      { domain: 'structure_progression', score: 9 },
      { domain: 'solidite_logique', score: 10 },
      { domain: 'robustesse_factuelle', score: 13 },
      { domain: 'coherence_editoriale', score: 10 },
      { domain: 'angle_impact', score: 8 },
      { domain: 'connexion_quotidien', score: 4 },
      { domain: 'preservation_voix', score: 4 },
      { domain: 'format_calibrage', score: 4 }
    ],
    findings: [
      {
        blockId: 'b2',
        quote: 'cette technologie va remplacer tous les serveurs',
        category: 'source-absente',
        severity: 2,
        label: 'Source absente',
        explanation: "Le bloc affirme un fait sans citer de source.",
        confidence: 0.9,
        verification: 'contradicted'
      }
    ]
  });

  it('populates claims and research even when the response and options carry none', () => {
    const report = parseAndValidateLlmOutput(rawWithContradiction, sampleInput, {});
    expect(report.claims).toEqual([]);
    expect(report.research).toMatchObject({ performed: false });
    expect(report.research.skippedReason).toBeTruthy();
  });

  it('carries through claims and research passed via options', () => {
    const report = parseAndValidateLlmOutput(rawWithContradiction, sampleInput, {
      claims: [
        {
          id: 'c1',
          blockId: 'b2',
          quote: 'cette technologie va remplacer tous les serveurs',
          claim: 'La technologie remplacera tous les serveurs.',
          verification: 'unverified',
          sources: []
        }
      ],
      research: { performed: true, provider: 'anthropic', queries: ['remplacement serveurs technologie'], withdrawn: [] }
    });
    expect(report.claims).toHaveLength(1);
    expect(report.research.performed).toBe(true);
    expect(report.research.provider).toBe('anthropic');
  });

  it('re-categorises a source-absente finding on a block the article cited, via articleSources', () => {
    const report = parseAndValidateLlmOutput(rawWithContradiction, sampleInput, {
      articleSources: {
        b2: [{ title: 'Étude citée', url: 'https://example.com/etude', origin: 'search' }]
      }
    });

    expect(report.findings).toHaveLength(1);
    const [finding] = report.findings;
    expect(finding.category).toBe('affirmation-non-etayee');
    expect(finding.verification).toBe('unverified');
    expect(finding.sources).toHaveLength(1);
    expect(finding.sources?.[0].origin).toBe('article');
  });

  it('downgrades an uncited contradicted finding to unverified instead of publishing a contradiction', () => {
    const report = parseAndValidateLlmOutput(rawWithContradiction, sampleInput, {});
    const [finding] = report.findings;
    expect(finding.verification).toBe('unverified');
    expect(finding.sources).toEqual([]);
  });

  it('leaves the pre-existing parse and score behaviour unchanged', () => {
    const rawLlmMarkdown = `
    Voici mon analyse :
    \`\`\`json
    {
      "summary": "Article intéressant mais affirmations à sourcer.",
      "scores": [
        { "domain": "orthographe_grammaire", "score": 4 },
        { "domain": "clarte_lisibilite", "score": 8 },
        { "domain": "structure_progression", "score": 8 },
        { "domain": "solidite_logique", "score": 10 },
        { "domain": "robustesse_factuelle", "score": 12 },
        { "domain": "coherence_editoriale", "score": 10 },
        { "domain": "angle_impact", "score": 7 },
        { "domain": "connexion_quotidien", "score": 3 },
        { "domain": "preservation_voix", "score": 4 },
        { "domain": "format_calibrage", "score": 4 }
      ],
      "findings": [
        {
          "blockId": "b2",
          "quote": "cette technologie va remplacer tous les serveurs",
          "category": "affirmation-non-etayee",
          "severity": 2,
          "label": "Généralisation et certitude non étayée",
          "explanation": "L'affirmation manque d'une source précise.",
          "confidence": 0.95
        }
      ]
    }
    \`\`\`
    `;

    const report = parseAndValidateLlmOutput(rawLlmMarkdown, sampleInput, {
      modelName: 'gpt-4o',
      durationMs: 1500
    });

    expect(report.summary).toContain('Article intéressant');
    expect(report.score).toBe(70);
    expect(report.scoreBand).toBe('perfectible');
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0].blockId).toBe('b2');
    expect(report.findings[0].charStart).toBeGreaterThan(0);
    expect(report.meta.model).toBe('gpt-4o');
  });
});

describe('reconcileResearchedFindings', () => {
  function makeClaim(overrides: Partial<FactualClaim> & Pick<FactualClaim, 'findingId' | 'verification'>): FactualClaim {
    return {
      id: 'c1',
      blockId: 'b1',
      quote: 'Éric Ciotti est maire de Nice.',
      claim: 'Éric Ciotti est maire de Nice.',
      sources: [],
      ...overrides
    };
  }

  it('withdraws a factual finding whose objection evidence refutes, recording it with the quote, block id, reason and sources - the reported false-accusation defect', () => {
    const finding = makeFinding({
      id: 'f_ciotti',
      category: 'affirmation-non-etayee',
      blockId: 'b1',
      quote: 'Éric Ciotti est maire de Nice.',
      label: 'Fait inexact : Christian Estrosi est maire de Nice, pas Éric Ciotti'
    });
    const source: EvidenceSource = { title: 'Mairie de Nice', url: 'https://nice.fr/maire', origin: 'search' };
    const claim = makeClaim({ findingId: finding.id, verification: 'confirmed', sources: [source] });

    const { findings, withdrawn } = reconcileResearchedFindings([finding], [claim]);

    expect(findings).toEqual([]);
    expect(withdrawn).toHaveLength(1);
    expect(withdrawn[0]).toMatchObject({
      blockId: 'b1',
      quote: 'Éric Ciotti est maire de Nice.',
      sources: [source]
    });
    expect(withdrawn[0].reason).toBeTruthy();
  });

  it('keeps a finding the evidence contradicts, carrying the claim\'s sources and a contradicted verification', () => {
    const finding = makeFinding({ id: 'f1', category: 'affirmation-non-etayee' });
    const source: EvidenceSource = { title: 'Rapport', url: 'https://example.com/rapport', origin: 'search' };
    const claim = makeClaim({ findingId: 'f1', verification: 'contradicted', sources: [source] });

    const { findings, withdrawn } = reconcileResearchedFindings([finding], [claim]);

    expect(withdrawn).toEqual([]);
    expect(findings).toHaveLength(1);
    expect(findings[0].verification).toBe('contradicted');
    expect(findings[0].sources).toEqual([source]);
  });

  it('keeps a finding nothing was actually read for as an unverified reserve, not an established fault', () => {
    const finding = makeFinding({ id: 'f1', category: 'affirmation-non-etayee' });
    const claim = makeClaim({ findingId: 'f1', verification: 'unverified', sources: [] });

    const { findings, withdrawn } = reconcileResearchedFindings([finding], [claim]);

    expect(withdrawn).toEqual([]);
    expect(findings).toHaveLength(1);
    expect(findings[0].verification).toBe('unverified');
  });

  it('passes an editorial finding through unchanged, since it was never researched and carries no claim', () => {
    const finding = makeFinding({ id: 'f1', category: 'sophisme' });

    const { findings, withdrawn } = reconcileResearchedFindings([finding], []);

    expect(withdrawn).toEqual([]);
    expect(findings).toEqual([finding]);
  });
});
