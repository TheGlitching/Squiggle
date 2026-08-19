import {
  FOURCHES_CAUDINES_SYSTEM_PROMPT,
  buildFourchesCaudinesUserPrompt,
} from './prompts';
import { parseAndValidateLlmOutput, reconcileResearchedFindings } from './validator';
import { researchFindings, CitedSource } from './research';
import { AnalysisInput, AnalysisReport, EvidenceSource, TextBlock } from './types';
import { BaseLLMClient } from '../client/base';
import { DEMO_FOURCHES_CAUDINES_REPORT } from './demoFixture';

export type PipelineStage =
  | 'idle'
  | 'extracting'
  | 'preparing_prompt'
  | 'calling_provider'
  | 'parsing_response'
  | 'researching'
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
 * The share of the overall bar that the research stage owns.
 *
 * A stage that counts its own work from zero has no idea where it sits in the
 * run, so the pipeline places that count rather than passing it through. The
 * window stops short of 100 because the run is not finished when research is.
 */
const RESEARCH_WINDOW = { from: 65, to: 95 } as const;

/** Places a stage's own 0-100 count inside the window it occupies. */
function placeInWindow(pct: number, window: { from: number; to: number }): number {
  const share = Math.max(0, Math.min(100, pct)) / 100;
  return Math.round(window.from + (window.to - window.from) * share);
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
    /**
     * The article's real block structure. Without it every finding can only
     * point at one synthetic block, which makes a quote impossible to locate in
     * the page and leaves per-block citations unusable.
     */
    blocks?: TextBlock[];
    /** Links the article itself offers as backing for its claims. */
    citedSources?: CitedSource[];
    /** Pins "today" for the audit and its research; defaults to the real clock. */
    now?: Date;
  }): Promise<AnalysisReport> {
    this.abortController = new AbortController();

    if (this.demoMode) {
      return this.runDemoAnalysis();
    }

    if (!this.client) {
      throw new MissingProviderError();
    }

    try {
      this.reportProgress('preparing_prompt', 'Application de la grille des Fourches Caudines...', 10);

      const now = input.now ?? new Date();

      const analysisInput: AnalysisInput = {
        url: input.url || 'https://current-tab.local',
        title: input.title || 'Article sans titre',
        author: input.author,
        outlet: input.outlet,
        language: 'fr',
        blocks:
          input.blocks && input.blocks.length > 0
            ? input.blocks
            : [{ id: 'b1', type: 'paragraph', text: input.text, charStart: 0 }],
      };

      const citedSources = input.citedSources ?? [];

      // The validator checks a 'source-absente' finding against the block it was
      // raised on, so the same links have to be reachable by block id.
      const sourcesByBlock: Record<string, EvidenceSource[]> = {};
      for (const s of citedSources) {
        if (!s.blockId) continue;
        (sourcesByBlock[s.blockId] ??= []).push({
          title: s.text || s.domain,
          url: s.href,
          origin: 'article',
        });
      }

      // The audit runs first, on the article alone, and answers in one
      // strict-JSON stream. It cannot pause mid-answer to look anything up, so
      // nothing has been researched yet at this point - only the article's own
      // hyperlinked sources and today's date are available to it.
      const systemPrompt = FOURCHES_CAUDINES_SYSTEM_PROMPT;
      const userPrompt = buildFourchesCaudinesUserPrompt(analysisInput, { citedSources, now });

      this.reportProgress('calling_provider', 'Audit critique en cours par le modèle IA...', 20);

      let accumulated = '';
      const startedAt = Date.now();

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
            this.reportProgress('calling_provider', 'Réception continue de l’évaluation...', 45, {
              partialText: accumulated,
            });
          },
        }
      );

      this.reportProgress('parsing_response', 'Validation et notation du rapport...', 55);

      const auditedReport = parseAndValidateLlmOutput(response.content, analysisInput, {
        modelName: `${this.client.getProvider()}/${this.client.getModel()}`,
        durationMs: Date.now() - startedAt,
        articleSources: sourcesByBlock,
      });

      // Now the audit's own factual findings become the claims under test: the
      // audit's objections are checked against evidence instead of being
      // published straight from the model's memory.
      this.reportProgress('researching', "Vérification des constats factuels de l'audit...", RESEARCH_WINDOW.from);
      const { claims, research } = await researchFindings({
        client: this.client,
        input: analysisInput,
        findings: auditedReport.findings,
        citedSources,
        now,
        // The research stage counts its own claims from 0 to 100. Forwarding that
        // raw made the bar fall back to the start the moment research began, which
        // reads as the analysis having failed and started over. It is one stage of a
        // longer run, so its count belongs inside the share of the bar it owns.
        onProgress: (message, pct) =>
          this.reportProgress('researching', message, placeInWindow(pct, RESEARCH_WINDOW)),
        abortSignal: this.abortController?.signal,
      });

      const { findings, withdrawn } = reconcileResearchedFindings(auditedReport.findings, claims);

      const report: AnalysisReport = {
        ...auditedReport,
        findings,
        claims,
        research: { ...research, withdrawn },
      };

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
