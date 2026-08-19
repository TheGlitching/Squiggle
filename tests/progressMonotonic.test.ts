import { describe, expect, it } from 'vitest';
import { BaseLLMClient, GroundedAnswer, SearchResult } from '../src/client/base';
import { AnalysisPipeline, PipelineProgressEvent } from '../src/engine/pipeline';
import type { CompletionOptions, CompletionResponse, StreamCallbacks } from '../src/types/byok';

/**
 * The bar used to fall back to the start partway through: the research stage
 * counts its own claims from zero, and that count was forwarded as the whole
 * run's progress. A bar that retreats reads as the analysis having failed and
 * started over, so it is worth pinning that it only ever moves forward.
 */

const AUDIT = JSON.stringify({
  summary: "Audit portant sur l'article transmis.",
  scores: [
    { domain: 'robustesse_factuelle', score: 30 },
    { domain: 'solidite_logique', score: 22 },
    { domain: 'cadrage_manipulation', score: 22 },
    { domain: 'deontologie', score: 9 },
    { domain: 'orthographe_grammaire', score: 4 },
  ],
  findings: [
    {
      blockId: 'b1',
      quote: "L'usine a licencié 200 salariés en 2023.",
      category: 'affirmation-non-etayee',
      severity: 2,
      label: 'Chiffre avancé sans source',
      explanation: "Le nombre de licenciements est donné sans référence.",
      confidence: 0.9,
    },
    {
      blockId: 'b1',
      quote: 'Le plan portait sur 120 postes.',
      category: 'source-absente',
      severity: 2,
      label: 'Second chiffre sans source',
      explanation: 'Aucune source ne vient appuyer ce chiffre.',
      confidence: 0.9,
    },
  ],
});

/** Answers the audit once, then every claim judgement, with no network. */
class ProgressStubClient extends BaseLLMClient {
  constructor() {
    super({ provider: 'anthropic', apiKey: 'test-key', model: 'stub-model' });
  }

  protected async doComplete(): Promise<CompletionResponse> {
    return { content: AUDIT, model: 'stub-model', provider: 'anthropic', raw: {} };
  }

  public async complete(): Promise<CompletionResponse> {
    return { content: AUDIT, model: 'stub-model', provider: 'anthropic', raw: {} };
  }

  public async stream(_options: CompletionOptions, callbacks?: StreamCallbacks): Promise<CompletionResponse> {
    callbacks?.onChunk?.(AUDIT);
    return { content: AUDIT, model: 'stub-model', provider: 'anthropic', raw: {} };
  }

  public supportsWebSearch(): boolean {
    return true;
  }

  public async webSearch(): Promise<SearchResult[]> {
    return [];
  }

  public supportsGroundedAnswer(): boolean {
    return false;
  }

  public async groundedAnswer(): Promise<GroundedAnswer> {
    throw new Error('not used');
  }
}

describe('the analysis progress bar', () => {
  it('never moves backwards, including once research starts', async () => {
    const events: PipelineProgressEvent[] = [];
    const pipeline = new AnalysisPipeline({
      client: new ProgressStubClient(),
      onProgress: (event) => events.push(event),
    });

    await pipeline.analyze({
      text: "L'usine a licencié 200 salariés en 2023. Le plan portait sur 120 postes.",
      title: 'Un plan social contesté',
      blocks: [
        {
          id: 'b1',
          type: 'paragraph',
          text: "L'usine a licencié 200 salariés en 2023. Le plan portait sur 120 postes.",
          charStart: 0,
        },
      ],
    });

    const progress = events.map((e) => e.progress);
    expect(progress.length).toBeGreaterThan(3);

    const retreats = progress
      .map((value, i) => ({ from: progress[i - 1], to: value, at: i }))
      .filter((step) => step.at > 0 && step.to < step.from);

    expect(retreats).toEqual([]);
    expect(progress.at(-1)).toBe(100);
  });

  it('reports research under its own stage rather than borrowing another', async () => {
    const events: PipelineProgressEvent[] = [];
    const pipeline = new AnalysisPipeline({
      client: new ProgressStubClient(),
      onProgress: (event) => events.push(event),
    });

    await pipeline.analyze({
      text: "L'usine a licencié 200 salariés en 2023.",
      title: 'Un plan social contesté',
      blocks: [
        { id: 'b1', type: 'paragraph', text: "L'usine a licencié 200 salariés en 2023.", charStart: 0 },
      ],
    });

    const researching = events.filter((e) => e.stage === 'researching');
    expect(researching.length).toBeGreaterThan(0);

    // Whatever the stage counts internally, it stays inside the share of the bar
    // it owns, so it can neither retreat nor claim the run is finished.
    for (const event of researching) {
      expect(event.progress).toBeGreaterThanOrEqual(65);
      expect(event.progress).toBeLessThanOrEqual(95);
    }
  });
});
