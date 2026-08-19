import type {
  ChatMessage,
  CompletionOptions,
  CompletionResponse,
  ProviderConfig,
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
