import { BYOKError } from '../types/byok';
import type {
  CompletionOptions,
  CompletionResponse,
  StreamCallbacks,
} from '../types/byok';
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
}
