/**
 * The seam that lets the background worker run a hosted analysis without
 * knowing it is not running the BYOK pipeline.
 *
 * `HostedAnalysisClient` already presents the same surface as
 * `AnalysisPipeline`; the only differences are where `onProgress` is handed in
 * and how a missing URL is defaulted. Wrapping that here means the background's
 * tab state machine, progress stream and highlight hand-off are shared by both
 * modes instead of forked: it holds a runner and calls `analyze`/`abort`.
 */
import { HostedAnalysisClient } from '@squiggle/shared';
import type {
  AnalysisReport,
  CitedSource,
  PipelineProgressEvent,
  TextBlock,
} from '@squiggle/shared';
import { HOSTED_ORIGIN } from './config';

export interface AnalysisRunInput {
  text: string;
  title?: string;
  url?: string;
  author?: string;
  outlet?: string;
  blocks?: TextBlock[];
  citedSources?: CitedSource[];
}

/** What the background needs from whichever engine is selected. */
export interface AnalysisRunner {
  abort(): void;
  analyze(input: AnalysisRunInput): Promise<AnalysisReport>;
}

export interface HostedRunnerSession {
  token: string;
  privateKey: CryptoKey;
}

export class HostedRunner implements AnalysisRunner {
  private readonly client: HostedAnalysisClient;
  private readonly onProgress?: (event: PipelineProgressEvent) => void;

  constructor(session: HostedRunnerSession, onProgress?: (event: PipelineProgressEvent) => void) {
    this.client = new HostedAnalysisClient({
      baseUrl: HOSTED_ORIGIN,
      token: session.token,
      privateKey: session.privateKey,
    });
    this.onProgress = onProgress;
  }

  public abort(): void {
    this.client.abort();
  }

  public analyze(input: AnalysisRunInput): Promise<AnalysisReport> {
    return this.client.analyze(
      {
        // The audit cache is keyed on this URL and the server never fetches it,
        // so a page with no canonical URL still needs a stable stand-in.
        url: input.url || 'https://current-tab.local',
        title: input.title,
        author: input.author,
        outlet: input.outlet,
        blocks:
          input.blocks && input.blocks.length > 0
            ? input.blocks
            : [{ id: 'b1', type: 'paragraph', text: input.text, charStart: 0 }],
        citedSources: input.citedSources,
      },
      { onProgress: this.onProgress }
    );
  }
}
