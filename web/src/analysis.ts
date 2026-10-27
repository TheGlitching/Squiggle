/**
 * The web app's hosted analysis: the shared client in its session mode, so a
 * pasted text walks exactly the stages, payloads and order the extension does,
 * on the reader's session cookie and the same quota, or, for a visitor without
 * an account, on the site's one analysis a day. Nothing about the analysis is
 * decided here.
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

function sourceOf(article: PastedArticle): string | undefined {
  return (article.source.trim() ? webAddress(article.source) : null) ?? undefined;
}

/**
 * The report, with the blocks it was made from: the page highlights in exactly
 * those. A transcript's times stay here: the server reads only the speech.
 * `visitor` runs it without an account, on the site's one analysis a day.
 */
export async function analyzePasted(
  article: PastedArticle,
  onProgress: (progress: Progress) => void,
  signal?: AbortSignal,
  visitor = false,
): Promise<{ report: AnalysisReport; blocks: TextBlock[]; times: Record<string, Start[]> | null }> {
  const client = new HostedAnalysisClient({ baseUrl: API_BASE, session: visitor ? 'none' : 'cookie' });
  const { blocks, times } = readPaste(article);
  const report = await client.analyze(
    {
      url: sourceOf(article),
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

/** The report already filed for this paste, or null: it costs nothing and sends only the text's fingerprint. */
export async function cachedReport(
  article: PastedArticle,
): Promise<{ report: AnalysisReport; blocks: TextBlock[]; times: Record<string, Start[]> | null } | null> {
  const { blocks, times } = readPaste(article);
  const report = await new HostedAnalysisClient({ baseUrl: API_BASE, session: 'cookie' }).cached({
    url: sourceOf(article),
    blocks,
  });
  return report ? { report, blocks, times } : null;
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
  | { kind: 'signin' }
  | { kind: 'billing'; code: string; message: string }
  /** A visitor whose analysis without an account is used, or the site's for the day: an account is the next step. */
  | { kind: 'signup'; message: string }
  | { kind: 'error'; message: string };

const VISITOR_REFUSALS: Record<string, string> = {
  anon_used: 'Votre analyse sans compte du jour est faite. Créez un compte gratuit pour analyser ce texte.',
  anon_closed: 'Les analyses sans compte de la journée sont toutes faites. Créez un compte gratuit pour analyser ce texte.',
};

export function analysisFailure(err: unknown): AnalysisFailure {
  if (err instanceof HostedApiError) {
    if (err.code === 'invalid_session') return { kind: 'signin' };
    if (err.code in VISITOR_REFUSALS) return { kind: 'signup', message: VISITOR_REFUSALS[err.code] };
    if (err.isBilling) return { kind: 'billing', code: err.code, message: err.message };
    return { kind: 'error', message: ANALYSIS_ERRORS[err.code] ?? err.message };
  }
  return { kind: 'error', message: 'L’analyse n’a pas abouti. Votre texte est toujours là : relancez-la.' };
}
