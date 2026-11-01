/**
 * The web app's hosted analysis: the shared client in its session mode, so a
 * pasted text walks exactly the stages, payloads and order the extension does,
 * on the reader's session cookie and the same quota, or, for a visitor without
 * an account, on the site's one analysis without one. Nothing about the analysis is
 * decided here.
 */
import { HostedAnalysisClient, HostedApiError } from '../../shared/src/hosted/client';
import type { PipelineProgressEvent } from '../../shared/src/engine/pipeline';
import type { AnalysisReport, TextBlock } from '../../shared/src/engine/types';
import { API_BASE } from './api';
import { FREE_ANALYSES } from './offer';
import { readPaste, webAddress, type PastedArticle } from './paste';
import type { Start } from '../../shared/src/extract/transcript';

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
 * `visitor` runs it without an account, on the site's one analysis without one.
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

/**
 * The report a reader using the extension already made for this link, or null.
 * Only the link is sent: the server looks it up among the reports it filed and
 * fetches nothing, so this is what a link shared from a phone app can find.
 * Any failure is a miss: the reader then pastes the text, as before.
 */
export async function reportByLink(link: string): Promise<{ report: AnalysisReport; cachedAt: number } | null> {
  try {
    const res = await fetch(`${API_BASE}/web/anon/link?url=${encodeURIComponent(link)}`, { credentials: 'omit' });
    const body = (await res.json()) as { ok?: boolean; hit?: boolean; report?: AnalysisReport; cachedAt?: number };
    return body.ok && body.hit && body.report ? { report: body.report, cachedAt: body.cachedAt ?? Date.now() } : null;
  } catch {
    return null;
  }
}

const X_HOSTS = new Set(['x.com', 'twitter.com', 'mobile.x.com', 'mobile.twitter.com']);

/** Whether a link is to X: the server reads those, and only those, from the platform itself. */
export function isXLink(link: string): boolean {
  try {
    return X_HOSTS.has(new URL(link).hostname.toLowerCase().replace(/^www\./, ''));
  } catch {
    return false;
  }
}

export type XRead =
  | { kind: 'ok'; article: PastedArticle; postsRead: number; partial: boolean }
  | { kind: 'error'; message: string };

/**
 * A publication on X (and its thread, when the author wrote one), read by the
 * server from X's own API for this link: the text comes back to be analysed
 * like a pasted one. Only the link is sent. Any failure says, in the server's
 * words, to paste the text instead.
 */
export async function readXPost(link: string, signedIn: boolean): Promise<XRead> {
  const fallback: XRead = {
    kind: 'error',
    message: 'Squiggle n’a pas pu lire cette publication X. Copiez son texte et collez-le.',
  };
  try {
    const res = await fetch(`${API_BASE}/web/${signedIn ? 'analyze' : 'anon'}/x-post?url=${encodeURIComponent(link)}`, {
      credentials: signedIn ? 'include' : 'omit',
    });
    const body = (await res.json()) as {
      ok?: boolean;
      message?: string;
      title?: string;
      url?: string;
      text?: string;
      postsRead?: number;
      partial?: boolean;
    };
    if (body.ok && body.text && body.title && body.url) {
      return { kind: 'ok', article: { title: body.title, source: body.url, text: body.text }, postsRead: body.postsRead ?? 1, partial: !!body.partial };
    }
    return body.message ? { kind: 'error', message: body.message } : fallback;
  } catch {
    return fallback;
  }
}

/**
 * The report of an e-mail the reader forwarded, by the fingerprint of its text
 * the reply's link carries: the same zero-credit cache lookup a pasted text's
 * preflight makes, on the reader's session. Null when it is no longer filed.
 */
export async function reportByFingerprint(fingerprint: string): Promise<AnalysisReport | null> {
  const res = await fetch(`${API_BASE}/web/analyze/check?text=${fingerprint}`, { credentials: 'include' });
  const body = (await res.json()) as { ok?: boolean; hit?: boolean; report?: AnalysisReport };
  return body.ok && body.hit && body.report ? body.report : null;
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
  anon_used: `Votre analyse offerte sans compte est déjà faite. Créez un compte gratuit : ${FREE_ANALYSES} analyses de plus vous sont offertes.`,
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
