import { BYOKError } from '../types/byok';
import type {
  CompletionOptions,
  CompletionResponse,
  StreamCallbacks,
} from '../types/byok';
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
}
