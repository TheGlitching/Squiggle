import { describe, expect, it } from 'vitest';
import {
  AnalysisInput,
  buildFourchesCaudinesUserPrompt,
  computeFourchesCaudinesScore,
  determineScoreBand,
  FOURCHES_CAUDINES_SYSTEM_PROMPT,
  parseAndValidateLlmOutput,
  SCORE_DOMAINS
} from '../src/engine';

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

  it('defines 10 score domains summing to 100 points', () => {
    const totalWeight = Object.values(SCORE_DOMAINS).reduce((acc, def) => acc + def.weight, 0);
    expect(totalWeight).toBe(100);
    expect(Object.keys(SCORE_DOMAINS)).toHaveLength(10);
  });

  it('builds prompts with Fourches Caudines criteria', () => {
    expect(FOURCHES_CAUDINES_SYSTEM_PROMPT).toContain('Fourches Caudines');
    const userPrompt = buildFourchesCaudinesUserPrompt(sampleInput);
    expect(userPrompt).toContain(sampleInput.title);
    expect(userPrompt).toContain('[Bloc ID: b1');
    expect(userPrompt).toContain('solidite_logique');
    expect(userPrompt).toContain('robustesse_factuelle');
  });

  it('calculates score and bands correctly', () => {
    expect(determineScoreBand(85)).toBe('solide');
    expect(determineScoreBand(75)).toBe('perfectible');
    expect(determineScoreBand(65)).toBe('fragile');
    expect(determineScoreBand(45)).toBe('problematique');

    const result = computeFourchesCaudinesScore([
      { domain: 'orthographe_grammaire', score: 5 },
      { domain: 'clarte_lisibilite', score: 9 },
      { domain: 'structure_progression', score: 9 },
      { domain: 'solidite_logique', score: 14 },
      { domain: 'robustesse_factuelle', score: 18 },
      { domain: 'coherence_editoriale', score: 14 },
      { domain: 'angle_impact', score: 9 },
      { domain: 'connexion_quotidien', score: 4.5 },
      { domain: 'preservation_voix', score: 4.5 },
      { domain: 'format_calibrage', score: 5 }
    ]);

    expect(result.totalScore).toBe(92);
    expect(result.scoreBand).toBe('solide');
    expect(result.verdict).toBe('publier');
  });

  it('repairs and parses JSON responses from LLMs', () => {
    const rawLlmMarkdown = `
    Voici mon analyse :
    \`\`\`json
    {
      "verdict": "reviser_avant_publication",
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
