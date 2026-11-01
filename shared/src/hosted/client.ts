/**
 * The client half of the hosted analysis protocol, for both entry points: the
 * extension (a signed install) and the web app (a browser session).
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
import { articleLength, articleTooLongMessage, MAX_ARTICLE_CHARS } from './limits';
import { articleTextHash } from './textHash';

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

/** The extension: every call is signed with the install's key, on `/v1/analyze/*`. */
export interface InstallClientConfig {
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

/**
 * The web app: it holds no key, so every call rides the reader's session
 * cookie on `/web/analyze/*`, where the server requires an allowed Origin
 * instead of a signature. A visitor without an account (`session: 'none'`)
 * walks `/web/anon/*` with no cookie at all, on the site's one analysis without one.
 * The stages, their order and their payloads are the extension's, so the
 * entry points cannot drift into separate protocols.
 */
export interface SessionClientConfig {
  /** Origin of the hosted API, without a trailing slash; empty when same-origin. */
  baseUrl: string;
  session: 'cookie' | 'none';
  fetchImpl?: typeof fetch;
}

export type HostedClientConfig = InstallClientConfig | SessionClientConfig;

export interface HostedAnalyzeInput {
  /**
   * The article's address. Only a text pasted into the web app may lack one;
   * the server then files the report by the text alone.
   */
  url?: string;
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

/**
 * How many research or source-check calls one run has in flight at once. Each
 * is several model and search calls on the server, so a handful at a time is
 * what divides the wait without bunching a run's calls on the provider.
 */
export const PARALLEL_CALLS = 3;

/**
 * `run` on every item, at most `limit` at once, the results in the items'
 * order. The first error is thrown; `run` itself decides what an error ends.
 */
async function inParallel<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await run(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** What the client asks the audit to answer in: its progress, one JSON object per line. */
const AUDIT_STREAM = 'application/x-ndjson';

/**
 * How long a streamed audit may stay silent before the run is given up. The
 * server sends a line at least every ten seconds while it works, so this much
 * silence means the connection or the server is gone, not that it is slow.
 */
export const AUDIT_SILENCE_MS = 45_000;

/** One line of the audit's stream, or null for a line that is not one. */
function parseLine(line: string): { progress?: { step?: string; findings?: number }; status?: unknown; body?: unknown } | null {
  if (!line.trim()) return null;
  try {
    const value = JSON.parse(line) as unknown;
    return value && typeof value === 'object' ? (value as ReturnType<typeof parseLine>) : null;
  } catch {
    return null;
  }
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
  /** `/v1/analyze` for a signed install, `/web/analyze` for a browser session, `/web/anon` for a visitor. */
  private readonly stages: string;
  private controller: AbortController | null = null;
  private notes: string[] = [];
  private lastProgress = 0;
  private onProgress?: (event: PipelineProgressEvent) => void;

  constructor(config: HostedClientConfig) {
    this.config = config;
    this.stages = 'privateKey' in config ? '/v1/analyze' : config.session === 'none' ? '/web/anon' : '/web/analyze';
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
      // 0. A text over the cap would only be refused by the audit, after the
      //    preflight. Saying so here costs no call and no credit.
      const chars = articleLength(input.blocks);
      if (chars > MAX_ARTICLE_CHARS) throw new HostedApiError('article_too_long', articleTooLongMessage(chars), 413);

      // 1. The preflight is the whole point of the shared cache: on a hit the
      //    article is never sent anywhere and no credit is spent.
      this.report('preparing_prompt', 'Recherche d’une analyse déjà publiée...', 5);
      const hit = await this.check(input);
      if (hit) {
        this.note('Analyse déjà disponible : aucun nouvel appel au modèle.');
        this.report('success', 'Analyse récupérée sans nouvel appel au modèle', 100);
        return hit;
      }

      // 2. The audit. One call, and the only one that carries the article.
      this.report('calling_provider', 'Audit critique en cours...', 15);
      this.throwIfAborted();
      const audit = await this.callAudit({
        url: input.url,
        title: input.title ?? '',
        author: input.author,
        outlet: input.outlet,
        blocks: input.blocks,
        citedSources: input.citedSources ?? [],
        partialAccess: input.partialAccess ?? false,
      });

      this.report('parsing_response', 'Audit reçu, vérification des constats...', RESEARCH_WINDOW.from);

      // 3. One call per factual finding, a few at a time. A failure here loses
      //    that finding's verification, never the run: the report says so,
      //    which is the same thing the BYOK pipeline does. The server files the
      //    answers in the findings' order, whatever order they come back in.
      const researchable = audit.researchable;
      let researched = 0;
      const progressResearch = () =>
        this.report(
          'researching',
          `Vérification des constats factuels (${researched}/${researchable.length})...`,
          this.place(researched / Math.max(1, researchable.length)),
        );
      progressResearch();
      const found = await inParallel(researchable, PARALLEL_CALLS, async (findingId) => {
        this.throwIfAborted();
        try {
          const res = await this.call<{ ok: true; claim: FactualClaim | null }>('POST', `${this.stages}/research`, {
            runId: audit.runId,
            findingId,
          });
          return res.claim;
        } catch (err) {
          this.rethrowIfAborted(err);
          this.note('Un constat n’a pas pu être vérifié ; il reste signalé comme non vérifié.');
          return null;
        } finally {
          researched += 1;
          progressResearch();
        }
      });
      const claims = found.filter((claim): claim is FactualClaim => claim !== null);

      // 4. One call per cited page, for the claims that have one. The server
      //    refuses any URL the article did not publish, so this only ever asks
      //    for links that came out of the page itself. Claims go a few at a
      //    time; a claim's own pages go in turn, since each reading re-rates
      //    the claim the next one starts from.
      const sources = input.citedSources ?? [];
      await inParallel(claims, PARALLEL_CALLS, async (claim) => {
        for (const source of sources.filter((s) => s.blockId === claim.blockId)) {
          this.throwIfAborted();
          this.note(`Lecture de la source citée : ${source.text || source.domain}`);
          try {
            await this.call('POST', `${this.stages}/source-check`, {
              runId: audit.runId,
              claimId: claim.id,
              sourceUrl: source.href,
            });
          } catch (err) {
            this.rethrowIfAborted(err);
            // One unreadable page is one unread citation, not a failed run.
          }
        }
      });

      // 5. Pure code on the server: reconcile, rescore, cache, one credit.
      this.throwIfAborted();
      this.report('scoring', 'Synthèse et calcul de la note...', 96);
      const finalized = await this.call<{ ok: true; report: AnalysisReport }>('POST', `${this.stages}/finalize`, {
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

  /**
   * The report already filed for this text, or null: the preflight alone, so it
   * spends nothing and never sends the article.
   */
  async cached(input: Pick<HostedAnalyzeInput, 'url' | 'blocks'>): Promise<AnalysisReport | null> {
    this.controller = new AbortController();
    try {
      return await this.check(input);
    } finally {
      this.controller = null;
    }
  }

  /**
   * A report is only served to a reader whose page yields the same text it was
   * built from, so the check carries the fingerprint of the text (not the text)
   * beside the address.
   */
  private async check(input: Pick<HostedAnalyzeInput, 'url' | 'blocks'>): Promise<AnalysisReport | null> {
    const textHash = await articleTextHash(input.blocks);
    const address = input.url === undefined ? '' : `url=${encodeURIComponent(input.url)}&`;
    const check = await this.call<CheckResponse>('GET', `${this.stages}/check?${address}text=${textHash}`);
    return check.hit && check.report ? check.report : null;
  }

  // -------------------------------------------------------------------------
  // Wire
  // -------------------------------------------------------------------------

  /**
   * One request, signed when this is an install. The body is serialized ONCE
   * and both signed and sent, because the signature covers a hash of the exact
   * bytes: signing one serialization and sending another is the classic way to
   * make this protocol fail only in production, where a key ordering differs.
   */
  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    return this.parse<T>(await this.send(method, path, body));
  }

  /**
   * The audit, watched as it goes: the server streams one JSON object per
   * line (`server/src/index.ts`, `streamedAudit`), what the model is at, a
   * heartbeat, then the response. A server that does not stream answers as
   * any other stage does.
   */
  private async callAudit(body: unknown): Promise<AuditResponse> {
    const response = await this.send('POST', `${this.stages}/audit`, body, AUDIT_STREAM);
    if (!response.headers.get('content-type')?.includes(AUDIT_STREAM) || !response.body) {
      return this.parse<AuditResponse>(response);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let silent = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const listen = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        silent = true;
        void reader.cancel().catch(() => {});
      }, AUDIT_SILENCE_MS);
    };
    let last: { status: number; body: unknown } | undefined;
    try {
      listen();
      for (;;) {
        let chunk: ReadableStreamReadResult<Uint8Array>;
        try {
          chunk = await reader.read();
        } catch (err) {
          this.rethrowIfAborted(err);
          break;
        }
        if (chunk.done) break;
        listen();
        buffer += decoder.decode(chunk.value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const message = parseLine(line);
          if (message?.progress) this.auditProgress(message.progress);
          if (message && 'status' in message) last = { status: Number(message.status), body: message.body };
        }
      }
    } finally {
      clearTimeout(timer);
    }
    this.throwIfAborted();
    if (!last) {
      throw new HostedApiError(
        silent ? 'audit_silent' : 'network',
        silent
          ? 'Le serveur Squiggle ne donne plus de nouvelles de l’audit. Relancez l’analyse.'
          : 'La connexion au serveur Squiggle a été coupée pendant l’audit. Relancez l’analyse.',
        0,
      );
    }
    return this.parse<AuditResponse>(new Response(JSON.stringify(last.body), { status: last.status }));
  }

  /** What the panel says while the audit runs: only what the server reported, never a guess. */
  private auditProgress(progress: { step?: string; findings?: number }): void {
    switch (progress.step) {
      case 'sent':
        this.report('calling_provider', 'Audit critique : l’article est confié au modèle...', 16);
        break;
      case 'thinking':
        this.report('calling_provider', 'Audit critique : le modèle lit et analyse l’article...', 20);
        break;
      case 'writing': {
        const n = Math.max(0, Number(progress.findings) || 0);
        this.report(
          'calling_provider',
          n === 0
            ? 'Audit critique : rédaction du rapport...'
            : `Audit critique : ${n} constat${n > 1 ? 's' : ''} rédigé${n > 1 ? 's' : ''}...`,
          Math.min(48, 30 + 2 * n),
        );
        break;
      }
      case 'retry':
        this.report('calling_provider', 'Audit critique : réponse illisible, le modèle est interrogé une seconde fois...', 18);
        break;
      case 'critique':
        this.report('calling_provider', 'Relecture critique des constats...', 50);
        break;
    }
  }

  /**
   * One request, signed when this is an install. The body is serialized ONCE
   * and both signed and sent, because the signature covers a hash of the exact
   * bytes: signing one serialization and sending another is the classic way to
   * make this protocol fail only in production, where a key ordering differs.
   */
  private async send(method: 'GET' | 'POST', path: string, body?: unknown, accept?: string): Promise<Response> {
    const rawBody = body === undefined ? undefined : JSON.stringify(body);
    const headers: Record<string, string> =
      'privateKey' in this.config ? await this.signedHeaders(this.config, method, path, rawBody) : {};
    if (rawBody !== undefined) headers['content-type'] = 'application/json';
    if (accept) headers.accept = accept;

    const fetchImpl = this.config.fetchImpl ?? fetch;
    try {
      return await fetchImpl(`${this.config.baseUrl}${path}`, {
        method,
        headers,
        body: rawBody,
        signal: this.controller?.signal,
        // The session cookie is the web app's only credential. Same-origin in
        // production; a dev build calls a local API on another port. A visitor
        // sends none, so their run is never tied to an account.
        ...('session' in this.config
          ? { credentials: this.config.session === 'none' ? ('omit' as const) : ('include' as const) }
          : {}),
      });
    } catch (err) {
      this.rethrowIfAborted(err);
      // No response at all: the server was never reached, which is neither the
      // model's doing nor something the reader can fix by waiting on it.
      throw new HostedApiError('network', 'Impossible de joindre le serveur Squiggle. Vérifiez votre connexion, puis réessayez.', 0);
    }
  }

  private async parse<T>(response: Response): Promise<T> {
    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      // A body that is not our JSON envelope came from something between the
      // reader and the application (a gateway, an outage page).
      throw new HostedApiError('server_unavailable', 'Le serveur Squiggle ne répond pas correctement pour le moment. Réessayez dans un instant.', response.status);
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

  private async signedHeaders(
    install: InstallClientConfig,
    method: string,
    path: string,
    rawBody: string | undefined,
  ): Promise<Record<string, string>> {
    const nonce = randomToken(16);
    const timestamp = Math.floor(Date.now() / 1000);
    const input = await buildSigningInput({ method, path, nonce, timestamp, body: rawBody ?? null });
    return {
      [SigningHeaders.authorization]: `Bearer ${install.token}`,
      [SigningHeaders.signature]: await signRequest(install.privateKey, input),
      [SigningHeaders.nonce]: nonce,
      [SigningHeaders.timestamp]: String(timestamp),
    };
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
