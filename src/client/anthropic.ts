import { BYOKError, providerError } from '@squiggle/shared';
import type {
  CompletionOptions,
  CompletionResponse,
  StreamCallbacks,
} from '@squiggle/shared';
import type { GroundedAnswer, SearchResult } from '@squiggle/shared';
import { BaseLLMClient } from '@squiggle/shared';

/**
 * Raw HTTP against the Messages API, on API version 2026-10-21.
 *
 * No request carries `temperature`: that version rejects every sampling
 * parameter on every model, and the current models (Claude 4.7 and later)
 * already rejected anything but the default under 2023-06-01.
 */
export class AnthropicClient extends BaseLLMClient {
  private get baseUrl(): string {
    return this.config.baseUrl || 'https://api.anthropic.com/v1';
  }

  private get model(): string {
    return this.config.model || 'claude-opus-5-5';
  }

  private get headers(): Record<string, string> {
    return {
      'content-type': 'application/json',
      'x-api-key': this.config.apiKey,
      'anthropic-version': '2026-10-21',
      'anthropic-dangerous-direct-browser-access': 'true',
      ...this.config.customHeaders,
    };
  }

  private buildBody(options: CompletionOptions, maxTokens: number): Record<string, unknown> {
    const { system, messages } = this.formatSystemAndUserMessages(options);
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: options.maxTokens || maxTokens,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    };
    if (system) {
      body.system = system;
    }
    if (options.jsonSchema) {
      body.output_config = { format: { type: 'json_schema', schema: options.jsonSchema } };
    }
    return body;
  }

  async complete(options: CompletionOptions): Promise<CompletionResponse> {
    const response = await this.postJson(`${this.baseUrl}/messages`, this.headers, this.buildBody(options, 16000), options.abortSignal);
    const data = await response.json() as {
      content?: unknown;
      model?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    return {
      // Current models think by default, so the answer is not the first block.
      content: this.extractText(data.content),
      model: data.model || this.model,
      usage: {
        promptTokens: data.usage?.input_tokens,
        completionTokens: data.usage?.output_tokens,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      },
      provider: 'anthropic',
      raw: data,
    };
  }

  async stream(options: CompletionOptions, callbacks: StreamCallbacks): Promise<CompletionResponse> {
    let fullText = '';
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const response = await this.postJson(
        `${this.baseUrl}/messages`,
        this.headers,
        { ...this.buildBody(options, 16000), stream: true },
        options.abortSignal
      );

      await this.readServerSentEvents(response, (event) => {
        const parsed = event as {
          type?: string;
          delta?: { text?: string };
          message?: { usage?: { input_tokens?: number } };
          usage?: { output_tokens?: number };
        };
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          fullText += parsed.delta.text;
          callbacks.onChunk(parsed.delta.text);
        } else if (parsed.type === 'message_start') {
          inputTokens = parsed.message?.usage?.input_tokens || 0;
        } else if (parsed.type === 'message_delta') {
          outputTokens = parsed.usage?.output_tokens || outputTokens;
        } else if (parsed.type === 'error') {
          // An overload can end a stream that started fine, after an HTTP 200.
          throw providerError('anthropic', event);
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
      provider: 'anthropic',
    };
  }

  /**
   * Claude's server-side search runs through the same messages endpoint as a
   * regular completion, gated by a tool declaration rather than a separate
   * API surface. The basic `web_search_20250305` variant is the one every
   * current model accepts.
   */
  override supportsWebSearch(): boolean {
    return true;
  }

  override async webSearch(query: string, opts?: { maxResults?: number }): Promise<SearchResult[]> {
    const maxUses = opts?.maxResults && opts.maxResults > 0 ? opts.maxResults : 5;

    const body = {
      model: this.model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: query }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: maxUses }],
    };

    const response = await this.postJson(`${this.baseUrl}/messages`, this.headers, body);
    const data = await response.json() as { content?: unknown };
    return this.parseWebSearchResults(data.content, opts?.maxResults);
  }

  /**
   * Grounding runs through the same tool declaration as `webSearch`, but the
   * model keeps searching and reasoning across turns and returns its own
   * prose alongside the sources it read, instead of a bare result list.
   */
  override supportsGroundedAnswer(): boolean {
    return true;
  }

  override async groundedAnswer(options: CompletionOptions & { maxSearches?: number }): Promise<GroundedAnswer> {
    const maxUses = options.maxSearches && options.maxSearches > 0 ? options.maxSearches : 5;
    const body = {
      ...this.buildBody({ ...options, jsonSchema: undefined }, 16000),
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: maxUses }],
    };

    const response = await this.postJson(`${this.baseUrl}/messages`, this.headers, body, options.abortSignal);
    const data = await response.json() as { content?: unknown };
    const blocks = Array.isArray(data.content) ? data.content : [];

    const content = this.extractText(blocks).trim();

    if (!content) {
      throw new BYOKError({ provider: 'anthropic', message: 'grounded answer returned no answer text' });
    }

    const citations = this.dedupeCitations([
      ...this.parseWebSearchResults(blocks),
      ...this.parseTextBlockCitations(blocks),
    ]);

    return { content, citations };
  }

  /**
   * The answer may follow a thinking block and be split across several
   * `text` blocks, interleaved with search tool-use blocks or cut where a
   * citation starts, so every text block is concatenated as written rather
   * than assuming the answer lives in a single fixed position.
   */
  private extractText(blocks: unknown): string {
    if (!Array.isArray(blocks)) {
      return '';
    }

    const parts: string[] = [];
    for (const block of blocks) {
      if (!block || typeof block !== 'object' || !('type' in block) || block.type !== 'text') {
        continue;
      }
      if ('text' in block && typeof block.text === 'string') {
        parts.push(block.text);
      }
    }
    return parts.join('');
  }

  /**
   * Text blocks may carry their own `citations` array pointing at sources the
   * model quoted directly, distinct from the `web_search_tool_result` blocks
   * that list everything the search itself turned up.
   */
  private parseTextBlockCitations(blocks: unknown): SearchResult[] {
    if (!Array.isArray(blocks)) {
      return [];
    }

    const results: SearchResult[] = [];
    for (const block of blocks) {
      if (!block || typeof block !== 'object' || !('citations' in block) || !Array.isArray(block.citations)) {
        continue;
      }
      for (const citation of block.citations) {
        if (!citation || typeof citation !== 'object' || !('url' in citation) || typeof citation.url !== 'string' || citation.url.length === 0) {
          continue;
        }
        const title = 'title' in citation && typeof citation.title === 'string' && citation.title.length > 0 ? citation.title : citation.url;
        results.push({ title, url: citation.url, snippet: '' });
      }
    }
    return results;
  }

  /**
   * A `web_search_tool_result` block wraps a list of `web_search_result`
   * items; Claude may also emit unrelated text/tool_use blocks in the same
   * response, so every field is checked before use rather than assumed.
   */
  private parseWebSearchResults(blocks: unknown, maxResults?: number): SearchResult[] {
    if (!Array.isArray(blocks)) {
      return [];
    }

    const results: SearchResult[] = [];
    for (const block of blocks) {
      if (!block || typeof block !== 'object' || !('type' in block) || block.type !== 'web_search_tool_result') {
        continue;
      }
      if (!('content' in block) || !Array.isArray(block.content)) {
        continue;
      }

      for (const item of block.content) {
        if (!item || typeof item !== 'object' || !('url' in item) || typeof item.url !== 'string' || item.url.length === 0) {
          continue;
        }
        const title = 'title' in item && typeof item.title === 'string' && item.title.length > 0 ? item.title : item.url;
        results.push({ title, url: item.url, snippet: '' });
        if (maxResults && results.length >= maxResults) {
          return results;
        }
      }
    }

    return results;
  }
}
