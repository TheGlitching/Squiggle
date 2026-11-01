import { BYOKError } from '../types/byok';
import type {
  ChatMessage,
  CompletionOptions,
  CompletionResponse,
  LLMProvider,
  ProviderConfig,
  ProviderErrorKind,
  StreamCallbacks,
} from '../types/byok';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface GroundedAnswer {
  /** The model's answer text. Strict JSON when the caller asked for JSON. */
  content: string;
  /** Sources the provider actually fetched and fed into the model's context. */
  citations: SearchResult[];
}

function classifyProviderError(statusCode: number | undefined, code: string, message: string): ProviderErrorKind {
  if (
    statusCode === 401 ||
    statusCode === 403 ||
    ['API_KEY_INVALID', 'invalid_api_key', 'authentication_error', 'permission_error'].includes(code)
  ) {
    return 'auth';
  }
  if (
    statusCode === 402 ||
    statusCode === 429 ||
    ['insufficient_quota', 'rate_limit_error', 'RESOURCE_EXHAUSTED'].includes(code) ||
    /credit balance is too low/i.test(message)
  ) {
    return 'quota';
  }
  if (statusCode === 404 || ['model_not_found', 'not_found_error', 'NOT_FOUND'].includes(code) || /not a valid model/i.test(message)) {
    return 'model';
  }
  if ((statusCode !== undefined && statusCode >= 500) || ['overloaded_error', 'api_error', 'UNAVAILABLE'].includes(code)) {
    return 'unavailable';
  }
  return 'other';
}

/**
 * All four APIs answer an error as `{ error: { message, ... } }`, and say what
 * kind it is in a different field each: Anthropic's `type`, OpenAI's string
 * `code`, Gemini's `status` and `details[].reason`, OpenRouter's numeric
 * `code` (an HTTP status, which is all a mid-stream error carries).
 */
export function providerError(
  provider: LLMProvider,
  payload: unknown,
  statusCode?: number,
  fallbackMessage = 'request failed'
): BYOKError {
  const error = payload && typeof payload === 'object' && 'error' in payload ? payload.error : undefined;
  const field = (name: string): unknown => (error && typeof error === 'object' && name in error ? (error as Record<string, unknown>)[name] : undefined);

  const message = typeof field('message') === 'string' && field('message') ? String(field('message')) : fallbackMessage;
  const details = field('details');
  const reason = Array.isArray(details)
    ? details.map((d) => (d && typeof d === 'object' && 'reason' in d ? d.reason : undefined)).find((r) => typeof r === 'string')
    : undefined;
  const rawCode = field('code');
  const code = [reason, field('type'), typeof rawCode === 'string' ? rawCode : undefined, field('status')].find(
    (c): c is string => typeof c === 'string' && c.length > 0
  );
  const status = statusCode ?? (typeof rawCode === 'number' ? rawCode : undefined);

  return new BYOKError({
    provider,
    statusCode: status,
    message,
    code,
    kind: classifyProviderError(status, code ?? '', message),
    raw: payload,
  });
}

export abstract class BaseLLMClient {
  protected config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  abstract complete(options: CompletionOptions): Promise<CompletionResponse>;
  abstract stream(options: CompletionOptions, callbacks: StreamCallbacks): Promise<CompletionResponse>;

  /**
   * Public identity accessors. `config` is protected, so callers such as the
   * analysis pipeline had no legal way to report which provider/model produced
   * a report and were reaching for a `getProvider()` that never existed.
   */
  getProvider(): ProviderConfig['provider'] {
    return this.config.provider;
  }

  getModel(): string {
    return this.config.model;
  }

  /**
   * The clients one answer is asked of at once when how long it takes matters
   * more than what it costs: the caller keeps the first good answer and aborts
   * the others. Just this client, unless whoever built it asked for a race.
   */
  racers(): BaseLLMClient[] {
    return [this];
  }

  /**
   * Whether this provider/model combination can run server-side web search.
   * Defaults to false so an unsupporting provider is never silently treated
   * as one that searched and simply found nothing.
   */
  supportsWebSearch(): boolean {
    return false;
  }

  /**
   * Runs a provider-native web search. The base implementation throws rather
   * than resolving to `[]`, because an empty array here would be
   * indistinguishable from "searched, no hits" to a caller deciding whether a
   * claim is corroborated.
   */
  async webSearch(_query: string, _opts?: { maxResults?: number }): Promise<SearchResult[]> {
    throw new Error(`${this.config.provider} client does not support web search`);
  }

  /**
   * Whether this provider/model combination can run a single call in which
   * the provider itself performs the searches and feeds the retrieved page
   * content into the model's own context. Defaults to false for the same
   * reason `supportsWebSearch` does.
   */
  supportsGroundedAnswer(): boolean {
    return false;
  }

  /**
   * Runs a provider-native grounded answer: one call where the model reads
   * pages it fetched itself, rather than a judge reading a snippet we chose.
   * The base implementation throws rather than resolving an empty answer,
   * because an empty `content` here would be indistinguishable from a real
   * but unreadable verdict to a caller parsing it downstream.
   */
  async groundedAnswer(_options: CompletionOptions & { maxSearches?: number }): Promise<GroundedAnswer> {
    throw new Error(`${this.config.provider} client does not support grounded answers`);
  }

  /**
   * Shared by every provider's `groundedAnswer`: a citation is only useful
   * once, so repeats of the same url collapse into the first occurrence.
   */
  protected dedupeCitations(results: SearchResult[]): SearchResult[] {
    const seen = new Set<string>();
    const deduped: SearchResult[] = [];
    for (const result of results) {
      if (seen.has(result.url)) continue;
      seen.add(result.url);
      deduped.push(result);
    }
    return deduped;
  }

  /** POSTs JSON, and turns any non-2xx answer into a classified `BYOKError`. */
  protected async postJson(url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal): Promise<Response> {
    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal });
    if (!response.ok) {
      const text = await response.text();
      let payload: unknown = text;
      try {
        payload = JSON.parse(text);
      } catch {
        // Not JSON: a proxy or gateway page. The status still classifies it.
      }
      throw providerError(this.config.provider, payload, response.status, response.statusText || 'request failed');
    }
    return response;
  }

  /**
   * Feeds each `data:` payload of a server-sent-event body to `onEvent`. A
   * malformed line is skipped, but whatever `onEvent` throws (a mid-stream
   * error event) ends the stream: a half-written answer must not pass for a
   * whole one.
   */
  protected async readServerSentEvents(response: Response, onEvent: (data: unknown) => void): Promise<void> {
    if (!response.body) {
      throw new BYOKError({ provider: this.config.provider, message: 'Response body is empty' });
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    const handle = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) return;
      const dataStr = trimmed.replace(/^data:\s*/, '');
      if (dataStr === '[DONE]') return;
      let data: unknown;
      try {
        data = JSON.parse(dataStr);
      } catch {
        return;
      }
      onEvent(data);
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      lines.forEach(handle);
    }
    handle(buffer + decoder.decode());
  }

  protected formatSystemAndUserMessages(options: CompletionOptions): { system?: string; messages: ChatMessage[] } {
    let system = options.systemPrompt;
    const remainingMessages: ChatMessage[] = [];

    for (const msg of options.messages) {
      if (msg.role === 'system' && !system) {
        system = msg.content;
      } else {
        remainingMessages.push(msg);
      }
    }

    return { system, messages: remainingMessages };
  }
}
