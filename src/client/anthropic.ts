import { BYOKError } from '../types/byok';
import type {
  CompletionOptions,
  CompletionResponse,
  StreamCallbacks,
} from '../types/byok';
import type { GroundedAnswer, SearchResult } from './base';
import { BaseLLMClient } from './base';

export class AnthropicClient extends BaseLLMClient {
  private get baseUrl(): string {
    return this.config.baseUrl || 'https://api.anthropic.com/v1';
  }

  async complete(options: CompletionOptions): Promise<CompletionResponse> {
    const { system, messages } = this.formatSystemAndUserMessages(options);

    const body: Record<string, unknown> = {
      model: this.config.model || 'claude-3-5-sonnet-20241022',
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 0.2,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    };

    if (system) {
      body.system = system;
    }

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-api-key': this.config.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      ...this.config.customHeaders,
    };

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    if (!response.ok) {
      let errorData: any;
      try {
        errorData = await response.json();
      } catch {
        errorData = await response.text();
      }
      throw new BYOKError({
        provider: 'anthropic',
        statusCode: response.status,
        message: errorData?.error?.message || response.statusText || 'Anthropic API request failed',
        raw: errorData,
      });
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || '';

    return {
      content,
      model: data.model || this.config.model,
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
    const { system, messages } = this.formatSystemAndUserMessages(options);

    const body: Record<string, unknown> = {
      model: this.config.model || 'claude-3-5-sonnet-20241022',
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 0.2,
      stream: true,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    };

    if (system) {
      body.system = system;
    }

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-api-key': this.config.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      ...this.config.customHeaders,
    };

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    if (!response.ok) {
      let errorData: any;
      try {
        errorData = await response.json();
      } catch {
        errorData = await response.text();
      }
      const err = new BYOKError({
        provider: 'anthropic',
        statusCode: response.status,
        message: errorData?.error?.message || response.statusText || 'Anthropic streaming request failed',
        raw: errorData,
      });
      callbacks.onError?.(err);
      throw err;
    }

    if (!response.body) {
      throw new BYOKError({
        provider: 'anthropic',
        message: 'Response body is empty',
      });
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
            const parsed = JSON.parse(dataStr);
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              const delta = parsed.delta.text;
              fullText += delta;
              callbacks.onChunk(delta);
            } else if (parsed.type === 'message_start' && parsed.message?.usage) {
              inputTokens = parsed.message.usage.input_tokens || 0;
            } else if (parsed.type === 'message_delta' && parsed.usage) {
              outputTokens = parsed.usage.output_tokens || 0;
            }
          } catch {
            // Ignore parse errors on SSE events
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
        provider: 'anthropic',
      };
    } catch (err: any) {
      callbacks.onError?.(err);
      throw err;
    }
  }

  /**
   * Claude's server-side search runs through the same messages endpoint as a
   * regular completion, gated by a tool declaration rather than a separate
   * API surface.
   */
  override supportsWebSearch(): boolean {
    return true;
  }

  override async webSearch(query: string, opts?: { maxResults?: number }): Promise<SearchResult[]> {
    const maxUses = opts?.maxResults && opts.maxResults > 0 ? opts.maxResults : 5;

    const body: Record<string, unknown> = {
      model: this.config.model || 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [{ role: 'user', content: query }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: maxUses }],
    };

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-api-key': this.config.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      ...this.config.customHeaders,
    };

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let errorData: unknown;
      let errorMessage = response.statusText || 'Anthropic web search request failed';
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
        provider: 'anthropic',
        statusCode: response.status,
        message: errorMessage,
        raw: errorData,
      });
    }

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
    const { system, messages } = this.formatSystemAndUserMessages(options);
    const maxUses = options.maxSearches && options.maxSearches > 0 ? options.maxSearches : 5;

    const body: Record<string, unknown> = {
      model: this.config.model || 'claude-3-5-sonnet-20241022',
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 0.2,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: maxUses }],
    };

    if (system) {
      body.system = system;
    }

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-api-key': this.config.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      ...this.config.customHeaders,
    };

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    if (!response.ok) {
      let errorData: unknown;
      let errorMessage = response.statusText || 'Anthropic grounded answer request failed';
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
        provider: 'anthropic',
        statusCode: response.status,
        message: errorMessage,
        raw: errorData,
      });
    }

    const data = await response.json() as { content?: unknown };
    const blocks = Array.isArray(data.content) ? data.content : [];

    const content = this.extractText(blocks).trim();

    if (!content) {
      throw new Error('anthropic grounded answer returned no answer text');
    }

    const citations = this.dedupeCitations([
      ...this.parseWebSearchResults(blocks),
      ...this.parseTextBlockCitations(blocks),
    ]);

    return { content, citations };
  }

  /**
   * The final answer may be split across several `text` blocks interleaved
   * with search tool-use blocks, so every text block is concatenated rather
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
    return parts.join('\n');
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
