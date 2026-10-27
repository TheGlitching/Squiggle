import { describe, expect, it } from 'vitest';
import {
  AnalysisInput,
  buildFourchesCaudinesUserPrompt,
  computeFourchesCaudinesScore,
  determineScoreBand,
  FOURCHES_CAUDINES_SYSTEM_PROMPT,
  parseAndValidateLlmOutput,
  PROMPT_VERSION,
  SCORE_DOMAINS
} from '@squiggle/shared';

describe('Fourches Caudines Engine', () => {
  const sampleInput: AnalysisInput = {
    url: 'https://example.com/article-1',
    title: 'Une révolution technologique majeure',
    author: 'Jean Dupont',
    outlet: 'example.com',
    language: 'fr',
    blocks: [
      {
        id: 'b1',
        type: 'paragraph',
        text: 'Les nouvelles puces quantiques permettent de multiplier par mille la vitesse de calcul.',
        charStart: 0
      },
      {
        id: 'b2',
        type: 'paragraph',
        text: 'Selon une étude récente, cette technologie va remplacer tous les serveurs existants d’ici deux ans.',
        charStart: 87
      }
    ]
  };

  it('defines 5 score domains summing to 100 points', () => {
    const totalWeight = Object.values(SCORE_DOMAINS).reduce((acc, def) => acc + def.weight, 0);
    expect(totalWeight).toBe(100);
    expect(Object.keys(SCORE_DOMAINS)).toHaveLength(5);
  });

  it('builds prompts with Squiggle criteria', () => {
    expect(FOURCHES_CAUDINES_SYSTEM_PROMPT).toContain('Squiggle');
    const userPrompt = buildFourchesCaudinesUserPrompt(sampleInput);
    expect(userPrompt).toContain(sampleInput.title);
    expect(userPrompt).toContain('[Bloc ID: b1');
    expect(userPrompt).toContain('solidite_logique');
    expect(userPrompt).toContain('robustesse_factuelle');
  });

  it('keeps the borrowed method name out of reader-facing text', () => {
    // The prompt version is shown to readers and is part of the cache key.
    expect(PROMPT_VERSION).toBe('1.1.0');
    expect(FOURCHES_CAUDINES_SYSTEM_PROMPT).not.toMatch(/fourches|caudines/i);
    expect(buildFourchesCaudinesUserPrompt(sampleInput)).not.toMatch(/fourches|caudines/i);
  });

  it('calculates score and bands correctly', () => {
    expect(determineScoreBand(85)).toBe('solide');
    expect(determineScoreBand(75)).toBe('perfectible');
    expect(determineScoreBand(65)).toBe('fragile');
    expect(determineScoreBand(45)).toBe('problematique');

    const result = computeFourchesCaudinesScore([
      { domain: 'orthographe_grammaire', score: 5 },
      { domain: 'solidite_logique', score: 23 },
      { domain: 'robustesse_factuelle', score: 33 },
      { domain: 'cadrage_manipulation', score: 22 },
      { domain: 'deontologie', score: 9 }
    ]);

    expect(result.totalScore).toBe(92);
    expect(result.scoreBand).toBe('solide');
  });

  it('repairs and parses JSON responses from LLMs', () => {
    const rawLlmMarkdown = `
    Voici mon analyse :
    \`\`\`json
    {
      "summary": "Article intéressant mais affirmations à sourcer.",
      "scores": [
        { "domain": "orthographe_grammaire", "score": 4 },
        { "domain": "solidite_logique", "score": 18 },
        { "domain": "robustesse_factuelle", "score": 25 },
        { "domain": "cadrage_manipulation", "score": 18 },
        { "domain": "deontologie", "score": 5 }
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
    // The marks sum to 70, but the audit also reported an unsourced assertion of
    // severity 2 against factual robustness. Nothing could confirm it, so it
    // still costs that domain a share of its 25 awarded points rather than none.
    expect(report.score).toBe(65);
    expect(report.scoreBand).toBe('fragile');
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0].blockId).toBe('b2');
    expect(report.findings[0].charStart).toBeGreaterThan(0);
    expect(report.meta.model).toBe('gpt-4o');
  });

  it('keeps the valid findings, each with its id, when one finding in the answer is malformed', () => {
    const scores = Object.keys(SCORE_DOMAINS).map((domain) => ({ domain, score: 4, strengths: [], weaknesses: [] }));
    const finding = (blockId: string, quote: string) => ({
      blockId,
      quote,
      category: 'cadrage',
      severity: 1,
      label: 'Formule',
      explanation: 'Une formule oriente le lecteur.',
    });
    const raw = JSON.stringify({
      summary: 'Synthèse.',
      scores,
      findings: [
        finding('b1', 'multiplier par mille'),
        finding('b2', ''),
        finding('b2', 'va remplacer tous les serveurs'),
      ],
    });

    const report = parseAndValidateLlmOutput(raw, sampleInput);

    expect(report.findings.map((f) => f.quote)).toEqual(['multiplier par mille', 'va remplacer tous les serveurs']);
    const ids = report.findings.map((f) => f.id);
    expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(2);
  });
});
