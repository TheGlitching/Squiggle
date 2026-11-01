import { BYOKError } from '../types/byok';
import type {
  CompletionOptions,
  CompletionResponse,
  StreamCallbacks,
} from '../types/byok';
import type { GroundedAnswer, SearchResult } from './base';
import { BaseLLMClient, providerError } from './base';

export class OpenAIClient extends BaseLLMClient {
  protected get defaultBaseUrl(): string {
    return 'https://api.openai.com/v1';
  }

  protected get defaultModel(): string {
    return 'gpt-6.1-sol';
  }

  protected get providerName(): 'openai' | 'openrouter' {
    return 'openai';
  }

  protected get baseUrl(): string {
    return this.config.baseUrl || this.defaultBaseUrl;
  }

  protected get model(): string {
    return this.config.model || this.defaultModel;
  }

  protected getHeaders(): Record<string, string> {
    return {
      'content-type': 'application/json',
      Authorization: `Bearer ${this.config.apiKey}`,
      ...this.config.customHeaders,
    };
  }

  /**
   * OpenAI's current models are all reasoning models: they reject
   * `max_tokens` in favour of `max_completion_tokens`, and any `temperature`
   * but the default. Older models accept `max_completion_tokens` too, so one
   * shape serves every model the reader can pick.
   */
  protected samplingParams(options: CompletionOptions): Record<string, unknown> {
    return options.maxTokens ? { max_completion_tokens: options.maxTokens } : {};
  }

  protected formatMessages(options: CompletionOptions): Array<{ role: string; content: string }> {
    const { system, messages } = this.formatSystemAndUserMessages(options);
    const formatted = [];
    if (system) {
      formatted.push({ role: 'system', content: system });
    }
    for (const m of messages) {
      formatted.push({ role: m.role, content: m.content });
    }
    return formatted;
  }

  protected responseFormat(options: CompletionOptions): Record<string, unknown> {
    if (!options.jsonSchema) return {};
    return {
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'analysis_response',
          strict: true,
          schema: options.jsonSchema,
        },
      },
    };
  }

  private chatBody(options: CompletionOptions): Record<string, unknown> {
    return {
      model: this.model,
      messages: this.formatMessages(options),
      ...this.samplingParams(options),
      ...this.responseFormat(options),
    };
  }

  async complete(options: CompletionOptions): Promise<CompletionResponse> {
    const response = await this.postJson(`${this.baseUrl}/chat/completions`, this.getHeaders(), this.chatBody(options), options.abortSignal);

    const data = await response.json() as {
      model?: string;
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };

    const content = data.choices?.[0]?.message?.content || '';

    return {
      content,
      model: data.model || this.model,
      usage: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        totalTokens: data.usage?.total_tokens,
      },
      provider: this.providerName,
      finishReason: data.choices?.[0]?.finish_reason,
      raw: data,
    };
  }

  async stream(options: CompletionOptions, callbacks: StreamCallbacks): Promise<CompletionResponse> {
    let fullText = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let finishReason: string | undefined;

    try {
      const response = await this.postJson(
        `${this.baseUrl}/chat/completions`,
        this.getHeaders(),
        { ...this.chatBody(options), stream: true, stream_options: { include_usage: true } },
        options.abortSignal
      );

      await this.readServerSentEvents(response, (event) => {
        const parsed = event as {
          error?: unknown;
          choices?: Array<{ delta?: { content?: string; reasoning?: string }; finish_reason?: string | null }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };

        // OpenRouter reports a provider failure after the 200 as a chunk
        // carrying `error`; what streamed before it is not an answer.
        if (parsed.error) {
          throw providerError(this.providerName, event);
        }

        const choice = parsed.choices?.[0];
        if (choice?.delta?.reasoning) callbacks.onReasoning?.(choice.delta.reasoning);
        const delta = choice?.delta?.content;
        if (delta) {
          fullText += delta;
          callbacks.onChunk(delta);
        }
        if (choice?.finish_reason) finishReason = choice.finish_reason;

        if (parsed.usage) {
          inputTokens = parsed.usage.prompt_tokens || inputTokens;
          outputTokens = parsed.usage.completion_tokens || outputTokens;
          this.streamedUsage(parsed.usage);
        }
      });
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      callbacks.onError?.(error);
      throw error;
    }

    callbacks.onComplete?.(fullText);

    return {
      content: fullText,
      model: this.model,
      usage: {
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      provider: this.providerName,
      finishReason,
    };
  }

  /** What a streamed answer's last chunk says it used; the JSON answers carry it in their body. */
  protected streamedUsage(_usage: unknown): void {}

  /**
   * Search runs through the Responses API's `web_search` tool, which every
   * current model accepts. Chat Completions only searches with dedicated
   * search models, the `-search-preview` ones of which were shut down on
   * 2026-07-23, and those search on every call - unusable for the audit.
   */
  override supportsWebSearch(): boolean {
    return true;
  }

  override async webSearch(query: string, opts?: { maxResults?: number }): Promise<SearchResult[]> {
    const output = await this.respondWithSearch({ input: query });
    const results = this.dedupeCitations(this.parseResponsesCitations(output));
    return opts?.maxResults ? results.slice(0, opts.maxResults) : results;
  }

  override supportsGroundedAnswer(): boolean {
    return this.supportsWebSearch();
  }

  override async groundedAnswer(options: CompletionOptions & { maxSearches?: number }): Promise<GroundedAnswer> {
    const { system, messages } = this.formatSystemAndUserMessages(options);
    const body: Record<string, unknown> = {
      input: messages.map((m) => ({ role: m.role, content: m.content })),
    };
    if (system) body.instructions = system;
    if (options.maxSearches && options.maxSearches > 0) body.max_tool_calls = options.maxSearches;
    if (options.maxTokens) body.max_output_tokens = options.maxTokens;
    if (options.jsonSchema) {
      body.text = { format: { type: 'json_schema', name: 'analysis_response', strict: true, schema: options.jsonSchema } };
    }

    const output = await this.respondWithSearch(body, options.abortSignal);
    const content = this.extractResponsesText(output).trim();
    if (!content) {
      throw new BYOKError({ provider: this.providerName, message: 'grounded answer returned no answer text' });
    }

    return { content, citations: this.dedupeCitations(this.parseResponsesCitations(output)) };
  }

  private async respondWithSearch(body: Record<string, unknown>, signal?: AbortSignal): Promise<unknown[]> {
    const response = await this.postJson(
      `${this.baseUrl}/responses`,
      this.getHeaders(),
      {
        model: this.model,
        tools: [{ type: 'web_search' }],
        // Every page the search consulted, not only the ones the answer cites.
        include: ['web_search_call.action.sources'],
        ...body,
      },
      signal
    );
    const data = await response.json() as { output?: unknown };
    return Array.isArray(data.output) ? data.output : [];
  }

  private messageParts(output: unknown[]): Array<Record<string, unknown>> {
    const parts: Array<Record<string, unknown>> = [];
    for (const item of output) {
      if (!item || typeof item !== 'object' || !('type' in item) || item.type !== 'message' || !('content' in item) || !Array.isArray(item.content)) {
        continue;
      }
      for (const part of item.content) {
        if (part && typeof part === 'object' && 'type' in part && part.type === 'output_text') {
          parts.push(part as Record<string, unknown>);
        }
      }
    }
    return parts;
  }

  private extractResponsesText(output: unknown[]): string {
    return this.messageParts(output)
      .map((part) => (typeof part.text === 'string' ? part.text : ''))
      .join('');
  }

  /**
   * The answer's own `url_citation` annotations first (they carry a title),
   * then every source the `web_search_call` items consulted.
   */
  private parseResponsesCitations(output: unknown[]): SearchResult[] {
    const results: SearchResult[] = [];
    for (const part of this.messageParts(output)) {
      results.push(...this.parseAnnotations(part.annotations));
    }
    for (const item of output) {
      if (!item || typeof item !== 'object' || !('type' in item) || item.type !== 'web_search_call' || !('action' in item)) {
        continue;
      }
      const action = item.action;
      const sources = action && typeof action === 'object' && 'sources' in action && Array.isArray(action.sources) ? action.sources : [];
      for (const source of sources) {
        if (source && typeof source === 'object' && 'url' in source && typeof source.url === 'string' && source.url.length > 0) {
          results.push({ title: source.url, url: source.url, snippet: '' });
        }
      }
    }
    return results;
  }

  /**
   * A `url_citation` annotation is nested under `url_citation` in Chat
   * Completions (OpenRouter) and flat in the Responses API (OpenAI).
   */
  protected parseAnnotations(annotations: unknown, maxResults?: number): SearchResult[] {
    if (!Array.isArray(annotations)) {
      return [];
    }

    const results: SearchResult[] = [];
    for (const entry of annotations) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      const citation = 'url_citation' in entry ? entry.url_citation : entry;
      if (!citation || typeof citation !== 'object' || !('url' in citation) || typeof citation.url !== 'string' || citation.url.length === 0) {
        continue;
      }
      const title = 'title' in citation && typeof citation.title === 'string' && citation.title.length > 0 ? citation.title : citation.url;
      const snippet = 'content' in citation && typeof citation.content === 'string' ? citation.content : '';
      results.push({ title, url: citation.url, snippet });
      if (maxResults && results.length >= maxResults) {
        break;
      }
    }

    return results;
  }
}
