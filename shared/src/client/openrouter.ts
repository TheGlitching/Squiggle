import { BYOKError } from '../types/byok';
import type { CompletionOptions, ProviderConfig } from '../types/byok';
import type { GroundedAnswer, SearchResult } from './base';
import { OpenAIClient } from './openai';

/**
 * A model as the OpenRouter catalogue actually advertises it. The id is kept
 * verbatim because OpenRouter's ids are not predictable - its "latest" alias
 * for DeepSeek V4 Flash is literally `~deepseek/deepseek-v4-flash-latest`,
 * tilde and all - and the API rejects anything that is not exactly right.
 */
export interface OpenRouterModel {
  id: string;
  name: string;
  /** The org segment before the first `/`, for grouping in a picker. */
  author: string;
}

export const OPENROUTER_CATALOG_URL = 'https://openrouter.ai/api/v1/models';

/**
 * The single seam for OpenRouter's `openrouter:web_search` server tool. Parallel
 * `basic` is the default because it has broad language support (French
 * included) at $0.005/request, versus the $0.007 Exa fallback the deprecated
 * `:online` suffix selected. A later French-source quality spike can switch
 * `mode` to `turbo` ($0.001, English/Japanese only) here, in one place.
 *
 * The model decides how often to search inside one request, and OpenRouter
 * lets it go up to thirty times, each one billed. `maxUses` is the ceiling
 * when the caller names none: a lone query needs one search, a grounded
 * judgement of one claim a few.
 */
export const OPENROUTER_WEB_SEARCH = {
  engine: 'parallel',
  mode: 'basic',
  maxResults: 5,
  maxUses: 3,
} as const;

/**
 * Fetches OpenRouter's live model catalogue, public and keyless. The picker's
 * curent static preset rot - its note says it plainly: a closed list is a list
 * of models nobody can select - so this returns exactly what the API exposes,
 * including id aliases. Any failure (network, non-200, malformed payload)
 * resolves to `[]` so the caller keeps its static preset instead of erroring
 * out of the modal.
 */
export async function listOpenRouterModels(
  fetchImpl: typeof fetch = fetch
): Promise<OpenRouterModel[]> {
  try {
    const response = await fetchImpl(OPENROUTER_CATALOG_URL, {
      headers: { accept: 'application/json' }
    });
    if (!response.ok) return [];

    const payload = (await response.json()) as { data?: unknown };
    if (!Array.isArray(payload.data)) return [];

    const models: OpenRouterModel[] = [];
    for (const item of payload.data) {
      if (typeof item !== 'object' || item === null) continue;
      const id = (item as { id?: unknown }).id;
      if (typeof id !== 'string' || id.length === 0) continue;
      const slash = id.indexOf('/');
      const author = slash > 0 ? id.slice(0, slash).replace(/^[^a-zA-Z0-9]+/, '') : 'autre';
      const name = typeof (item as { name?: unknown }).name === 'string' ? (item as { name: string }).name : id;
      models.push({ id, name, author });
    }
    return models;
  } catch {
    return [];
  }
}

/**
 * OpenRouter's provider routing preferences, sent as the `provider` object of
 * a request. Only the fields Squiggle sets are typed.
 */
export interface OpenRouterProviderPreferences {
  /** Provider slugs, tried in this order. */
  order?: readonly string[];
  /** The only provider slugs the request may be routed to. */
  only?: readonly string[];
  /** `false`: fail rather than try a provider outside `order`. */
  allow_fallbacks?: boolean;
  /** Skip providers that would ignore a parameter, the response schema included. */
  require_parameters?: boolean;
  /** `deny`: skip providers that may store or train on the request. */
  data_collection?: 'allow' | 'deny';
  /** Route only to zero-data-retention endpoints. */
  zdr?: boolean;
}

/**
 * OpenRouter's `reasoning` request object. A model that reasons by default
 * does so at its own default effort unless the request says otherwise, and its
 * reasoning is paid for out of the same `max_tokens` as the answer.
 */
export interface OpenRouterReasoning {
  effort: 'none' | 'low' | 'medium' | 'high';
}

export class OpenRouterClient extends OpenAIClient {
  private readonly providerPreferences?: OpenRouterProviderPreferences;
  private readonly reasoning?: OpenRouterReasoning;

  /**
   * Without preferences OpenRouter picks among every host of the model, and
   * the model reasons as much as it likes, which is what a BYOK reader gets on
   * their own key. Hosted mode passes both.
   */
  constructor(config: ProviderConfig, providerPreferences?: OpenRouterProviderPreferences, reasoning?: OpenRouterReasoning) {
    super(config);
    this.providerPreferences = providerPreferences;
    this.reasoning = reasoning;
  }

  protected override get defaultBaseUrl(): string {
    return 'https://openrouter.ai/api/v1';
  }

  protected override get defaultModel(): string {
    return 'deepseek/deepseek-v4.1-flash';
  }

  protected override get providerName(): 'openai' | 'openrouter' {
    return 'openrouter';
  }

  protected override getHeaders(): Record<string, string> {
    return {
      'content-type': 'application/json',
      Authorization: `Bearer ${this.config.apiKey}`,
      'HTTP-Referer': 'https://github.com/TheGlitching/Squiggle',
      'X-Title': 'Squiggle',
      ...this.config.customHeaders,
    };
  }

  /**
   * Every request of this client goes through here (completion, stream, web
   * search), so neither the provider preferences nor the reasoning effort can
   * be left off one of them.
   */
  protected override postJson(url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal): Promise<Response> {
    const routed = {
      ...(body as Record<string, unknown>),
      ...(this.providerPreferences ? { provider: this.providerPreferences } : {}),
      ...(this.reasoning ? { reasoning: this.reasoning } : {}),
    };
    return super.postJson(url, headers, routed, signal);
  }

  /**
   * OpenRouter takes `max_tokens` and `temperature` for every model and
   * drops what the routed provider does not support, so the low temperature
   * the analysis asks for still reaches the models that honour it.
   */
  protected override samplingParams(options: CompletionOptions): Record<string, unknown> {
    return { temperature: options.temperature ?? 0.2, max_tokens: options.maxTokens };
  }

  /**
   * Web search on OpenRouter is a server tool rather than a per-model
   * capability, so every routed model can search. It is requested through
   * the `openrouter:web_search` tool instead of the deprecated `:online`
   * model suffix, which silently fell back to Exa for models like DeepSeek
   * with no native search.
   */
  override supportsWebSearch(): boolean {
    return true;
  }

  private webSearchTool(maxUses: number): Record<string, unknown> {
    return {
      type: 'openrouter:web_search',
      parameters: {
        engine: OPENROUTER_WEB_SEARCH.engine,
        mode: OPENROUTER_WEB_SEARCH.mode,
        max_results: OPENROUTER_WEB_SEARCH.maxResults,
        max_uses: maxUses,
      },
    };
  }

  private async searchingCompletion(
    body: Record<string, unknown>,
    maxUses: number,
    signal?: AbortSignal
  ): Promise<{ content?: unknown; annotations?: unknown }> {
    const response = await this.postJson(
      `${this.baseUrl}/chat/completions`,
      this.getHeaders(),
      { model: this.model, ...body, tools: [this.webSearchTool(maxUses)] },
      signal
    );
    const data = await response.json() as { choices?: Array<{ message?: { content?: unknown; annotations?: unknown } }> };
    return data.choices?.[0]?.message ?? {};
  }

  override async webSearch(query: string, opts?: { maxResults?: number }): Promise<SearchResult[]> {
    const message = await this.searchingCompletion({ messages: [{ role: 'user', content: query }] }, 1);
    return this.parseAnnotations(message.annotations, opts?.maxResults);
  }

  override async groundedAnswer(options: CompletionOptions & { maxSearches?: number }): Promise<GroundedAnswer> {
    const body: Record<string, unknown> = {
      messages: this.formatMessages(options),
      ...this.responseFormat(options),
    };
    if (options.maxTokens) {
      body.max_tokens = options.maxTokens;
    }

    const maxUses = options.maxSearches && options.maxSearches > 0 ? options.maxSearches : OPENROUTER_WEB_SEARCH.maxUses;
    const message = await this.searchingCompletion(body, maxUses, options.abortSignal);
    const content = typeof message.content === 'string' ? message.content.trim() : '';
    if (!content) {
      throw new BYOKError({ provider: 'openrouter', message: 'grounded answer returned no answer text' });
    }

    return { content, citations: this.dedupeCitations(this.parseAnnotations(message.annotations, options.maxSearches)) };
  }
}
