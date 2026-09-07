/**
 * The extension's half of the hosted analysis protocol.
 *
 * It lives beside `auth/signing.ts` and for the same reason: the server
 * implements the other half of exactly this conversation, and a disagreement
 * between the two about a route, a payload or an order of calls is a bug that
 * only shows up in production. Keeping both halves in the shared workspace is
 * what lets one test drive this client straight into the server's own request
 * handler, with no network and no deployment, and prove the wire actually
 * matches.
 *
 * It presents the same surface as `AnalysisPipeline` — `analyze(input)`,
 * `abort()`, the same `PipelineProgressEvent` stream — so the background
 * worker picks one or the other and everything downstream (the tab state
 * machine, the panel, the highlight targets) is untouched by the choice.
 *
 * What it does NOT do is decide anything about the analysis. Every judgement
 * is the server's; this walks the stages, degrades one failed finding without
 * losing the run, and reports progress.
 */
import {
  buildSigningInput,
  randomToken,
  signRequest,
  SigningHeaders,
} from '../auth/signing';
import type { CitedSource } from '../engine/research';
import type { AnalysisReport, FactualClaim, TextBlock } from '../engine/types';
import type { PipelineProgressEvent } from '../engine/pipeline';

/** An error the server named. The panel branches on `code`, never on the text. */
export class HostedApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'HostedApiError';
    this.code = code;
    this.status = status;
  }

  /** True for the refusals a reader can act on (subscribe, wait, resubscribe). */
  get isBilling(): boolean {
    return this.code === 'trial_exhausted' || this.code === 'subscription_required' || this.code === 'quota_exhausted';
  }
}

export interface HostedClientConfig {
  /** Origin of the hosted API, without a trailing slash. */
  baseUrl: string;
  /** The opaque extension token issued when this install signed in. */
  token: string;
  /**
   * The private half of this install's P-256 key. It never leaves the
   * extension: only signatures made with it do.
   */
  privateKey: CryptoKey;
  fetchImpl?: typeof fetch;
}

export interface HostedAnalyzeInput {
  url: string;
  title?: string;
  author?: string;
  outlet?: string;
  blocks: TextBlock[];
  citedSources?: CitedSource[];
  /** The extension could only read part of the page (a paywall). */
  partialAccess?: boolean;
}

export interface HostedAnalyzeOptions {
  onProgress?: (event: PipelineProgressEvent) => void;
  abortSignal?: AbortSignal;
}

/** The share of the bar the per-finding research loop owns, as in the BYOK pipeline. */
const RESEARCH_WINDOW = { from: 55, to: 92 } as const;

interface AuditResponse {
  ok: true;
  runId: string;
  report: AnalysisReport;
  researchable: string[];
}

interface CheckResponse {
  ok: true;
  hit: boolean;
  report?: AnalysisReport;
  cachedAt?: number;
}

export class HostedAnalysisClient {
  private readonly config: HostedClientConfig;
  private controller: AbortController | null = null;
  private notes: string[] = [];
  private lastProgress = 0;
  private onProgress?: (event: PipelineProgressEvent) => void;

  constructor(config: HostedClientConfig) {
    this.config = config;
  }

  /**
   * Cancel the run. The controller is deliberately NOT cleared here: it is
   * what every later stage checks and what signals the next fetch, so
   * dropping it would let an aborted run quietly carry on to the next stage.
   * `analyze` clears it in its own `finally`.
   */
  abort(): void {
    this.controller?.abort();
  }

  async analyze(input: HostedAnalyzeInput, options: HostedAnalyzeOptions = {}): Promise<AnalysisReport> {
    this.controller = new AbortController();
    if (options.abortSignal) {
      options.abortSignal.addEventListener('abort', () => this.controller?.abort(), { once: true });
    }
    this.onProgress = options.onProgress;
    this.notes = [];
    this.lastProgress = 0;

    try {
      // 1. The preflight is the whole point of the shared cache: on a hit the
      //    article is never sent anywhere and no credit is spent.
      this.report('preparing_prompt', 'Recherche d’une analyse déjà publiée...', 5);
      const check = await this.call<CheckResponse>('GET', `/v1/analyze/check?url=${encodeURIComponent(input.url)}`);
      if (check.hit && check.report) {
        this.note('Analyse déjà disponible : aucun nouvel appel au modèle.');
        this.report('success', 'Analyse récupérée sans nouvel appel au modèle', 100);
        return check.report;
      }

      // 2. The audit. One call, and the only one that carries the article.
      this.report('calling_provider', 'Audit critique en cours...', 15);
      this.throwIfAborted();
      const audit = await this.call<AuditResponse>('POST', '/v1/analyze/audit', {
        url: input.url,
        title: input.title ?? '',
        author: input.author,
        outlet: input.outlet,
        blocks: input.blocks,
        citedSources: input.citedSources ?? [],
        partialAccess: input.partialAccess ?? false,
      });

      this.report('parsing_response', 'Audit reçu, vérification des constats...', RESEARCH_WINDOW.from);

      // 3. One call per factual finding. A failure here loses that finding's
      //    verification, never the run: the report says so, which is the same
      //    thing the BYOK pipeline does.
      const claims: FactualClaim[] = [];
      const researchable = audit.researchable;
      for (let i = 0; i < researchable.length; i += 1) {
        this.throwIfAborted();
        this.report(
          'researching',
          `Vérification des constats factuels (${i + 1}/${researchable.length})...`,
          this.place(i / Math.max(1, researchable.length)),
        );
        try {
          const res = await this.call<{ ok: true; claim: FactualClaim | null }>('POST', '/v1/analyze/research', {
            runId: audit.runId,
            findingId: researchable[i],
          });
          if (res.claim) claims.push(res.claim);
        } catch (err) {
          this.rethrowIfAborted(err);
          this.note('Un constat n’a pas pu être vérifié ; il reste signalé comme non vérifié.');
        }
      }

      // 4. One call per cited page, for the claims that have one. The server
      //    refuses any URL the article did not publish, so this only ever asks
      //    for links that came out of the page itself.
      const sources = input.citedSources ?? [];
      for (const claim of claims) {
        for (const source of sources.filter((s) => s.blockId === claim.blockId)) {
          this.throwIfAborted();
          this.note(`Lecture de la source citée : ${source.text || source.domain}`);
          try {
            await this.call('POST', '/v1/analyze/source-check', {
              runId: audit.runId,
              claimId: claim.id,
              sourceUrl: source.href,
            });
          } catch (err) {
            this.rethrowIfAborted(err);
            // One unreadable page is one unread citation, not a failed run.
          }
        }
      }

      // 5. Pure code on the server: reconcile, rescore, cache, one credit.
      this.throwIfAborted();
      this.report('scoring', 'Synthèse et calcul de la note...', 96);
      const finalized = await this.call<{ ok: true; report: AnalysisReport }>('POST', '/v1/analyze/finalize', {
        runId: audit.runId,
      });

      this.report('success', 'Analyse terminée', 100);
      return finalized.report;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.report('error', message, 0, { error: message });
      throw err;
    } finally {
      this.controller = null;
    }
  }

  // -------------------------------------------------------------------------
  // Wire
  // -------------------------------------------------------------------------

  /**
   * One signed request. The body is serialized ONCE and both signed and sent,
   * because the signature covers a hash of the exact bytes: signing one
   * serialization and sending another is the classic way to make this protocol
   * fail only in production, where a key ordering differs.
   */
  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const rawBody = body === undefined ? undefined : JSON.stringify(body);
    const nonce = randomToken(16);
    const timestamp = Math.floor(Date.now() / 1000);
    const input = await buildSigningInput({ method, path, nonce, timestamp, body: rawBody ?? null });
    const signature = await signRequest(this.config.privateKey, input);

    const headers: Record<string, string> = {
      [SigningHeaders.authorization]: `Bearer ${this.config.token}`,
      [SigningHeaders.signature]: signature,
      [SigningHeaders.nonce]: nonce,
      [SigningHeaders.timestamp]: String(timestamp),
    };
    if (rawBody !== undefined) headers['content-type'] = 'application/json';

    const fetchImpl = this.config.fetchImpl ?? fetch;
    const response = await fetchImpl(`${this.config.baseUrl}${path}`, {
      method,
      headers,
      body: rawBody,
      signal: this.controller?.signal,
    });

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      throw new HostedApiError('internal', 'Réponse illisible du serveur.', response.status);
    }

    const payload = parsed as { ok?: boolean; error?: string; message?: string };
    if (!response.ok || payload.ok !== true) {
      throw new HostedApiError(
        payload.error ?? 'internal',
        payload.message ?? 'Le serveur a refusé la demande.',
        response.status,
      );
    }
    return parsed as T;
  }

  // -------------------------------------------------------------------------
  // Progress
  // -------------------------------------------------------------------------

  private place(share: number): number {
    const clamped = Math.max(0, Math.min(1, share));
    return Math.round(RESEARCH_WINDOW.from + (RESEARCH_WINDOW.to - RESEARCH_WINDOW.from) * clamped);
  }

  private note(note: string): void {
    if (!this.onProgress || this.notes.includes(note)) return;
    this.notes.push(note);
    this.onProgress({
      status: 'analyzing',
      stage: 'researching',
      message: note,
      progress: this.lastProgress,
      notes: [...this.notes],
    });
  }

  private report(
    stage: PipelineProgressEvent['stage'],
    message: string,
    progress: number,
    extra?: Partial<PipelineProgressEvent>,
  ): void {
    this.lastProgress = progress;
    if (!this.onProgress) return;
    const status: PipelineProgressEvent['status'] =
      stage === 'success' ? 'completed' : stage === 'error' ? 'error' : 'analyzing';
    this.onProgress({ status, stage, message, progress, notes: [...this.notes], ...extra });
  }

  private throwIfAborted(): void {
    if (this.controller?.signal.aborted) throw new DOMException('Analysis aborted', 'AbortError');
  }

  private rethrowIfAborted(err: unknown): void {
    if (this.controller?.signal.aborted || (err instanceof Error && err.name === 'AbortError')) throw err;
  }
}
