/**
 * The web app's hosted analysis: the shared client in its session mode, so a
 * pasted text walks exactly the stages, payloads and order the extension does,
 * on the reader's session cookie and the same quota. Nothing about the
 * analysis is decided here.
 */
import { HostedAnalysisClient, HostedApiError } from '../../shared/src/hosted/client';
import type { PipelineProgressEvent } from '../../shared/src/engine/pipeline';
import type { AnalysisReport, TextBlock } from '../../shared/src/engine/types';
import { API_BASE } from './api';
import { readPaste, webAddress, type PastedArticle } from './paste';
import type { Start } from './transcript';

export interface Progress {
  message: string;
  /** 0 to 100, never moving backwards. */
  percent: number;
  /** The server's stage, which the page draws as a step of the analysis. */
  stage?: PipelineProgressEvent['stage'];
}

/**
 * The report, with the blocks it was made from: the page highlights in exactly
 * those. A transcript's times stay here: the server reads only the speech.
 */
export async function analyzePasted(
  article: PastedArticle,
  onProgress: (progress: Progress) => void,
  signal?: AbortSignal,
): Promise<{ report: AnalysisReport; blocks: TextBlock[]; times: Record<string, Start[]> | null }> {
  const client = new HostedAnalysisClient({ baseUrl: API_BASE, session: 'cookie' });
  const source = article.source.trim() ? webAddress(article.source) : null;
  const { blocks, times } = readPaste(article);
  const report = await client.analyze(
    {
      url: source ?? undefined,
      title: article.title.trim(),
      blocks,
    },
    {
      abortSignal: signal,
      onProgress: (event: PipelineProgressEvent) => {
        if (event.status === 'analyzing')
          onProgress({ message: event.message, percent: event.progress, stage: event.stage });
      },
    },
  );
  return { report, blocks, times };
}

/** What the reader is told, by the code the server named. */
const ANALYSIS_ERRORS: Record<string, string> = {
  rate_limited: 'Une analyse est déjà en cours, ou le service est très demandé. Réessayez dans un instant.',
  provider_unavailable: 'Service momentanément indisponible. Votre texte est toujours là : réessayez dans quelques minutes.',
  provider_unreadable: 'La réponse du modèle n’a pas pu être lue. Relancez l’analyse.',
  network: 'Impossible de joindre Squiggle. Vérifiez votre connexion, puis relancez l’analyse.',
  server_unavailable: 'Squiggle ne répond pas correctement pour le moment. Réessayez dans un instant.',
  invalid_payload: 'Ce texte n’a pas pu être envoyé tel quel. Collez l’article seul, sans le reste de la page.',
  invalid_url: 'L’adresse source n’est pas celle d’une page web. Corrigez-la ou laissez-la vide.',
  run_not_found: 'L’analyse a été interrompue. Relancez-la.',
};

export type AnalysisFailure =
  { kind: 'signin' } | { kind: 'billing'; code: string; message: string } | { kind: 'error'; message: string };

export function analysisFailure(err: unknown): AnalysisFailure {
  if (err instanceof HostedApiError) {
    if (err.code === 'invalid_session') return { kind: 'signin' };
    if (err.isBilling) return { kind: 'billing', code: err.code, message: err.message };
    return { kind: 'error', message: ANALYSIS_ERRORS[err.code] ?? err.message };
  }
  return { kind: 'error', message: 'L’analyse n’a pas abouti. Votre texte est toujours là : relancez-la.' };
}
