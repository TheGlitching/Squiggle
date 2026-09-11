import { BYOKError } from '../types/byok';
import type {
  CompletionOptions,
  CompletionResponse,
  StreamCallbacks,
} from '../types/byok';
import type { GroundedAnswer, SearchResult } from './base';
import { BaseLLMClient } from './base';

export class OpenAIClient extends BaseLLMClient {
  protected get defaultBaseUrl(): string {
    return 'https://api.openai.com/v1';
  }

  protected get defaultModel(): string {
    return 'gpt-4o';
  }

  protected get providerName(): 'openai' | 'openrouter' {
    return 'openai';
  }

  protected get baseUrl(): string {
    return this.config.baseUrl || this.defaultBaseUrl;
  }

  protected getHeaders(): Record<string, string> {
    return {
      'content-type': 'application/json',
      Authorization: `Bearer ${this.config.apiKey}`,
      ...this.config.customHeaders,
    };
  }

  /**
   * Only the search-preview family accepts `web_search_options`; every other
   * chat-completions model rejects the field, so support is tied to the
   * configured model id rather than assumed for the whole provider.
   */
  protected get searchCapableModelPattern(): RegExp {
    return /search-preview/i;
  }

  override supportsWebSearch(): boolean {
    return this.searchCapableModelPattern.test(this.config.model || this.defaultModel);
  }

  /**
   * Split out so OpenRouter, which searches via a `:online` model suffix
   * instead of this field, can override without duplicating the request.
   */
  protected resolveWebSearchModel(): string {
    return this.config.model || this.defaultModel;
  }

  protected buildWebSearchExtras(): Record<string, unknown> {
    return { web_search_options: {} };
  }

  async complete(options: CompletionOptions): Promise<CompletionResponse> {
    const { system, messages } = this.formatSystemAndUserMessages(options);

    const formattedMessages = [];
    if (system) {
      formattedMessages.push({ role: 'system', content: system });
    }
    for (const m of messages) {
      formattedMessages.push({ role: m.role, content: m.content });
    }

    const body: Record<string, unknown> = {
      model: this.config.model || this.defaultModel,
      messages: formattedMessages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens,
    };

    if (options.jsonSchema) {
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'analysis_response',
          strict: true,
          schema: options.jsonSchema,
        },
      };
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    if (!response.ok) {
      let errorData: unknown;
      let errorMessage = response.statusText || `${this.providerName} API request failed`;
      try {
        errorData = await response.json();
        if (typeof errorData === 'object' && errorData !== null && 'error' in errorData) {
          const errObj = (errorData as { error?: { message?: string } }).error;
          if (errObj?.message) {
            errorMessage = errObj.message;
          }
        }
      } catch {
        errorData = await response.text();
      }

      throw new BYOKError({
        provider: this.providerName,
        statusCode: response.status,
        message: errorMessage,
        raw: errorData,
      });
    }

    const data = await response.json() as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };

    const content = data.choices?.[0]?.message?.content || '';

    return {
      content,
      model: data.model || this.config.model,
      usage: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        totalTokens: data.usage?.total_tokens,
      },
      provider: this.providerName,
      raw: data,
    };
  }

  async stream(options: CompletionOptions, callbacks: StreamCallbacks): Promise<CompletionResponse> {
    const { system, messages } = this.formatSystemAndUserMessages(options);

    const formattedMessages = [];
    if (system) {
      formattedMessages.push({ role: 'system', content: system });
    }
    for (const m of messages) {
      formattedMessages.push({ role: m.role, content: m.content });
    }

    const body: Record<string, unknown> = {
      model: this.config.model || this.defaultModel,
      messages: formattedMessages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens,
      stream: true,
      stream_options: { include_usage: true },
    };

    if (options.jsonSchema) {
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'analysis_response',
          strict: true,
          schema: options.jsonSchema,
        },
      };
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    if (!response.ok) {
      let errorData: unknown;
      let errorMessage = response.statusText || `${this.providerName} streaming request failed`;
      try {
        errorData = await response.json();
        if (typeof errorData === 'object' && errorData !== null && 'error' in errorData) {
          const errObj = (errorData as { error?: { message?: string } }).error;
          if (errObj?.message) {
            errorMessage = errObj.message;
          }
        }
      } catch {
        errorData = await response.text();
      }

      const err = new BYOKError({
        provider: this.providerName,
        statusCode: response.status,
        message: errorMessage,
        raw: errorData,
      });
      callbacks.onError?.(err);
      throw err;
    }

    if (!response.body) {
      const err = new BYOKError({
        provider: this.providerName,
        message: 'Response body is empty',
      });
      callbacks.onError?.(err);
      throw err;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let fullText = '';
    let buffer = '';
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const dataStr = trimmed.replace(/^data:\s*/, '');
          if (dataStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(dataStr) as {
              choices?: Array<{ delta?: { content?: string } }>;
              usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
            };

            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              callbacks.onChunk(delta);
            }

            if (parsed.usage) {
              inputTokens = parsed.usage.prompt_tokens || inputTokens;
              outputTokens = parsed.usage.completion_tokens || outputTokens;
            }
          } catch {
            // Ignore parse errors on individual SSE chunks
          }
        }
      }

      callbacks.onComplete?.(fullText);

      return {
        content: fullText,
        model: this.config.model,
        usage: {
          promptTokens: inputTokens,
          completionTokens: outputTokens,
          totalTokens: inputTokens + outputTokens,
        },
        provider: this.providerName,
      };
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      callbacks.onError?.(error);
      throw error;
    }
  }

  override async webSearch(query: string, opts?: { maxResults?: number }): Promise<SearchResult[]> {
    if (!this.supportsWebSearch()) {
      throw new Error(`${this.providerName} model "${this.config.model || this.defaultModel}" does not support web search`);
    }

    const body: Record<string, unknown> = {
      model: this.resolveWebSearchModel(),
      messages: [{ role: 'user', content: query }],
      ...this.buildWebSearchExtras(),
    };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let errorData: unknown;
      let errorMessage = response.statusText || `${this.providerName} web search request failed`;
      try {
        errorData = await response.json();
        if (errorData && typeof errorData === 'object' && 'error' in errorData) {
          const errObj = errorData.error;
          if (errObj && typeof errObj === 'object' && 'message' in errObj && typeof errObj.message === 'string') {
            errorMessage = errObj.message;
          }
        }
      } catch {
        errorData = await response.text();
      }
      throw new BYOKError({
        provider: this.providerName,
        statusCode: response.status,
        message: errorMessage,
        raw: errorData,
      });
    }

    const data = await response.json() as { choices?: unknown };
    const firstChoice = Array.isArray(data.choices) ? data.choices[0] : undefined;
    const message = firstChoice && typeof firstChoice === 'object' && 'message' in firstChoice ? firstChoice.message : undefined;
    const annotations = message && typeof message === 'object' && 'annotations' in message ? message.annotations : undefined;

    return this.parseAnnotations(annotations, opts?.maxResults);
  }

  /**
   * Grounded answers require the same search-preview model gating as
   * `webSearch`, since `web_search_options` is rejected by every other
   * chat-completions model.
   */
  override supportsGroundedAnswer(): boolean {
    return this.supportsWebSearch();
  }

  override async groundedAnswer(options: CompletionOptions & { maxSearches?: number }): Promise<GroundedAnswer> {
    if (!this.supportsGroundedAnswer()) {
      throw new Error(`${this.providerName} model "${this.config.model || this.defaultModel}" does not support grounded answers`);
    }

    const { system, messages } = this.formatSystemAndUserMessages(options);
    const formattedMessages = [];
    if (system) {
      formattedMessages.push({ role: 'system', content: system });
    }
    for (const m of messages) {
      formattedMessages.push({ role: m.role, content: m.content });
    }

    const body: Record<string, unknown> = {
      model: this.resolveWebSearchModel(),
      messages: formattedMessages,
      ...this.buildWebSearchExtras(),
    };

    if (options.maxTokens) {
      body.max_tokens = options.maxTokens;
    }

    if (options.jsonSchema) {
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'analysis_response',
          strict: true,
          schema: options.jsonSchema,
        },
      };
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    if (!response.ok) {
      let errorData: unknown;
      let errorMessage = response.statusText || `${this.providerName} grounded answer request failed`;
      try {
        errorData = await response.json();
        if (errorData && typeof errorData === 'object' && 'error' in errorData) {
          const errObj = errorData.error;
          if (errObj && typeof errObj === 'object' && 'message' in errObj && typeof errObj.message === 'string') {
            errorMessage = errObj.message;
          }
        }
      } catch {
        errorData = await response.text();
      }
      throw new BYOKError({
        provider: this.providerName,
        statusCode: response.status,
        message: errorMessage,
        raw: errorData,
      });
    }

    const data = await response.json() as { choices?: unknown };
    const firstChoice = Array.isArray(data.choices) ? data.choices[0] : undefined;
    const message = firstChoice && typeof firstChoice === 'object' && 'message' in firstChoice ? firstChoice.message : undefined;

    const content = message && typeof message === 'object' && 'content' in message && typeof message.content === 'string'
      ? message.content.trim()
      : '';
    if (!content) {
      throw new Error(`${this.providerName} grounded answer returned no answer text`);
    }

    const annotations = message && typeof message === 'object' && 'annotations' in message ? message.annotations : undefined;
    const citations = this.dedupeCitations(this.parseAnnotations(annotations, options.maxSearches));

    return { content, citations };
  }

  /**
   * OpenAI and OpenRouter both return citations as `url_citation` annotations
   * on the assistant message; OpenRouter extends this client and reuses the
   * parser for its own `:online` responses.
   */
  protected parseAnnotations(annotations: unknown, maxResults?: number): SearchResult[] {
    if (!Array.isArray(annotations)) {
      return [];
    }

    const results: SearchResult[] = [];
    for (const entry of annotations) {
      if (!entry || typeof entry !== 'object' || !('url_citation' in entry)) {
        continue;
      }
      const citation = entry.url_citation;
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
