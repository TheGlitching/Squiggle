import {
  FOURCHES_CAUDINES_SYSTEM_PROMPT,
  buildFourchesCaudinesUserPrompt,
} from './prompts';
import { parseAndValidateLlmOutput } from './validator';
import { AnalysisInput, AnalysisReport } from './types';
import { BaseLLMClient } from '../client/base';
import { DEMO_FOURCHES_CAUDINES_REPORT } from './demoFixture';

export type PipelineStage =
  | 'idle'
  | 'extracting'
  | 'preparing_prompt'
  | 'calling_provider'
  | 'parsing_response'
  | 'scoring'
  | 'storing'
  | 'success'
  | 'error';

export interface PipelineProgressEvent {
  status: 'idle' | 'extracting' | 'analyzing' | 'completed' | 'error';
  stage: PipelineStage;
  message: string;
  progress: number;
  partialText?: string;
  error?: string;
}

/**
 * Thrown when an analysis is requested with no provider configured. It is a
 * distinct type because the only honest response is to ask the user for a key,
 * never to return a report.
 */
export class MissingProviderError extends Error {
  constructor() {
    super('No LLM provider is configured');
    this.name = 'MissingProviderError';
  }
}

export interface AnalysisPipelineOptions {
  client?: BaseLLMClient;
  /**
   * Return the bundled sample report instead of calling a provider. Opt-in
   * only: a missing client must never silently select it, because a fabricated
   * report is indistinguishable from a real one once it reaches the panel.
   */
  demoMode?: boolean;
  onProgress?: (event: PipelineProgressEvent) => void;
}

export class AnalysisPipeline {
  private client?: BaseLLMClient;
  private demoMode: boolean;
  private onProgress?: (event: PipelineProgressEvent) => void;
  private abortController: AbortController | null = null;

  constructor(options: AnalysisPipelineOptions = {}) {
    this.client = options.client;
    this.demoMode = options.demoMode === true;
    this.onProgress = options.onProgress;
  }

  public abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private reportProgress(stage: PipelineStage, message: string, progress: number, extra?: Partial<PipelineProgressEvent>): void {
    if (!this.onProgress) return;
    const status =
      stage === 'idle'
        ? 'idle'
        : stage === 'extracting'
        ? 'extracting'
        : stage === 'success'
        ? 'completed'
        : stage === 'error'
        ? 'error'
        : 'analyzing';

    this.onProgress({
      status,
      stage,
      message,
      progress,
      ...extra,
    });
  }

  public async analyze(input: {
    text: string;
    title?: string;
    url?: string;
    author?: string;
    outlet?: string;
  }): Promise<AnalysisReport> {
    this.abortController = new AbortController();

    if (this.demoMode) {
      return this.runDemoAnalysis();
    }

    if (!this.client) {
      throw new MissingProviderError();
    }

    try {
      this.reportProgress('preparing_prompt', 'Application de la grille des Fourches Caudines...', 20);

      const analysisInput: AnalysisInput = {
        url: input.url || 'https://current-tab.local',
        title: input.title || 'Article sans titre',
        author: input.author,
        outlet: input.outlet,
        language: 'fr',
        blocks: [
          {
            id: 'b1',
            type: 'paragraph',
            text: input.text,
            charStart: 0,
          },
        ],
      };

      const systemPrompt = FOURCHES_CAUDINES_SYSTEM_PROMPT;
      const userPrompt = buildFourchesCaudinesUserPrompt(analysisInput);

      this.reportProgress('calling_provider', 'Audit critique en cours par le modèle IA...', 50);

      let accumulated = '';
      const startedAt = Date.now();

      // The client contract is `stream(options, callbacks)` / `complete(options)`
      // with a `messages` array, returning a CompletionResponse object. The
      // previous call passed `userPrompt`/`onStreamChunk` (neither exists on
      // CompletionOptions) and treated the result as a bare string, so this
      // branch could never have run successfully.
      const response = await this.client.stream(
        {
          messages: [{ role: 'user', content: userPrompt }],
          systemPrompt,
          temperature: 0.1,
          maxTokens: 4096,
          abortSignal: this.abortController?.signal,
        },
        {
          onChunk: (delta: string) => {
            accumulated += delta;
            this.reportProgress('calling_provider', 'Réception continue de l’évaluation...', 70, {
              partialText: accumulated,
            });
          },
        }
      );

      this.reportProgress('parsing_response', 'Validation et notation du rapport...', 90);

      const report = parseAndValidateLlmOutput(response.content, analysisInput, {
        modelName: `${this.client.getProvider()}/${this.client.getModel()}`,
        durationMs: Date.now() - startedAt,
      });

      this.reportProgress('success', 'Analyse terminée avec succès', 100);
      return report;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.reportProgress('error', errorMsg, 0, { error: errorMsg });
      throw err;
    } finally {
      this.abortController = null;
    }
  }

  /** Returns the bundled sample. It takes no input because it reads none. */
  private async runDemoAnalysis(): Promise<AnalysisReport> {
    this.reportProgress('extracting', 'Extraction des arguments du texte...', 20);
    await new Promise((r) => setTimeout(r, 80));

    this.reportProgress('preparing_prompt', 'Application de la grille Fourches Caudines...', 40);
    await new Promise((r) => setTimeout(r, 80));

    this.reportProgress('calling_provider', 'Audit critique en cours (mode démo)...', 70);
    await new Promise((r) => setTimeout(r, 100));

    this.reportProgress('scoring', 'Synthèse et calcul de la note composite...', 90);
    await new Promise((r) => setTimeout(r, 50));

    // This is a fixed sample, not an analysis of `input`. Label it every time,
    // never only when a title happened to be supplied, so it cannot be read as
    // a verdict on the page in front of the user.
    const report: AnalysisReport = JSON.parse(JSON.stringify(DEMO_FOURCHES_CAUDINES_REPORT));
    report.meta.model = 'exemple de démonstration (aucune analyse réelle)';

    this.reportProgress('success', 'Audit Fourches Caudines finalisé', 100);
    return report;
  }
}
