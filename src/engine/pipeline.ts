import {
  FOURCHES_CAUDINES_SYSTEM_PROMPT,
  buildFourchesCaudinesUserPrompt,
} from './prompts';
import { parseAndValidateLlmOutput } from './validator';
import { AnalysisInput, AnalysisReport } from './types';
import { BaseLLMClient } from '../client/base';
import { DEMO_ARTICLE, DEMO_FOURCHES_CAUDINES_REPORT } from '../../tree/root/children/root-01/children/root-01-04/artifacts/demoFixture';

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

export interface AnalysisPipelineOptions {
  client?: BaseLLMClient;
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
    this.demoMode = options.demoMode ?? !options.client;
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

    if (this.demoMode || !this.client) {
      return this.runDemoAnalysis(input);
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
      const responseText = await this.client.complete({
        systemPrompt,
        userPrompt,
        temperature: 0.1,
        maxTokens: 4096,
        onStreamChunk: (chunk: string) => {
          accumulated += chunk;
          this.reportProgress('calling_provider', 'Réception continue de l’évaluation...', 70, {
            partialText: accumulated,
          });
        },
      });

      this.reportProgress('parsing_response', 'Validation et notation du rapport...', 90);

      const report = parseAndValidateLlmOutput(responseText, analysisInput, {
        modelName: this.client.getProvider(),
        durationMs: 1500,
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

  private async runDemoAnalysis(input: { text: string; title?: string }): Promise<AnalysisReport> {
    this.reportProgress('extracting', 'Extraction des arguments du texte...', 20);
    await new Promise((r) => setTimeout(r, 80));

    this.reportProgress('preparing_prompt', 'Application de la grille Fourches Caudines...', 40);
    await new Promise((r) => setTimeout(r, 80));

    this.reportProgress('calling_provider', 'Audit critique en cours (mode démo)...', 70);
    await new Promise((r) => setTimeout(r, 100));

    this.reportProgress('scoring', 'Synthèse et calcul de la note composite...', 90);
    await new Promise((r) => setTimeout(r, 50));

    const report: AnalysisReport = JSON.parse(JSON.stringify(DEMO_FOURCHES_CAUDINES_REPORT));
    if (input.title) {
      report.meta.model = 'demo-mode (Fourches Caudines)';
    }

    this.reportProgress('success', 'Audit Fourches Caudines finalisé', 100);
    return report;
  }
}
