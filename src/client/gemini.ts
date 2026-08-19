import { BYOKError } from '../types/byok';
import type {
  CompletionOptions,
  CompletionResponse,
  StreamCallbacks,
} from '../types/byok';
import { BaseLLMClient } from './base';

export class GeminiClient extends BaseLLMClient {
  private get baseUrl(): string {
    return this.config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
  }

  private get modelName(): string {
    return this.config.model || 'gemini-1.5-pro';
  }

  private formatContents(options: CompletionOptions): { systemInstruction?: { parts: Array<{ text: string }> }; contents: Array<{ role: string; parts: Array<{ text: string }> }> } {
    const { system, messages } = this.formatSystemAndUserMessages(options);

    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    let systemInstruction;
    if (system) {
      systemInstruction = {
        parts: [{ text: system }],
      };
    }

    return { systemInstruction, contents };
  }

  async complete(options: CompletionOptions): Promise<CompletionResponse> {
    const { systemInstruction, contents } = this.formatContents(options);

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: options.temperature ?? 0.2,
        maxOutputTokens: options.maxTokens,
      },
    };

    if (systemInstruction) {
      body.systemInstruction = systemInstruction;
    }

    if (options.jsonSchema) {
      (body.generationConfig as Record<string, unknown>).responseMimeType = 'application/json';
      (body.generationConfig as Record<string, unknown>).responseSchema = options.jsonSchema;
    }

    const endpoint = `${this.baseUrl}/models/${this.modelName}:generateContent?key=${this.config.apiKey}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...this.config.customHeaders,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    if (!response.ok) {
      let errorData: unknown;
      let errorMessage = response.statusText || 'Gemini API request failed';
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
        provider: 'gemini',
        statusCode: response.status,
        message: errorMessage,
        raw: errorData,
      });
    }

    const data = await response.json() as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
    };

    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return {
      content,
      model: this.modelName,
      usage: {
        promptTokens: data.usageMetadata?.promptTokenCount,
        completionTokens: data.usageMetadata?.candidatesTokenCount,
        totalTokens: data.usageMetadata?.totalTokenCount,
      },
      provider: 'gemini',
      raw: data,
    };
  }

  async stream(options: CompletionOptions, callbacks: StreamCallbacks): Promise<CompletionResponse> {
    const { systemInstruction, contents } = this.formatContents(options);

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: options.temperature ?? 0.2,
        maxOutputTokens: options.maxTokens,
      },
    };

    if (systemInstruction) {
      body.systemInstruction = systemInstruction;
    }

    if (options.jsonSchema) {
      (body.generationConfig as Record<string, unknown>).responseMimeType = 'application/json';
      (body.generationConfig as Record<string, unknown>).responseSchema = options.jsonSchema;
    }

    const endpoint = `${this.baseUrl}/models/${this.modelName}:streamGenerateContent?alt=sse&key=${this.config.apiKey}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...this.config.customHeaders,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    if (!response.ok) {
      let errorData: unknown;
      let errorMessage = response.statusText || 'Gemini streaming request failed';
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
        provider: 'gemini',
        statusCode: response.status,
        message: errorMessage,
        raw: errorData,
      });
      callbacks.onError?.(err);
      throw err;
    }

    if (!response.body) {
      const err = new BYOKError({
        provider: 'gemini',
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
              candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
              usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
            };

            const delta = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            if (delta) {
              fullText += delta;
              callbacks.onChunk(delta);
            }

            if (parsed.usageMetadata) {
              inputTokens = parsed.usageMetadata.promptTokenCount || inputTokens;
              outputTokens = parsed.usageMetadata.candidatesTokenCount || outputTokens;
            }
          } catch {
            // Ignore parse errors on individual SSE chunks
          }
        }
      }

      callbacks.onComplete?.(fullText);

      return {
        content: fullText,
        model: this.modelName,
        usage: {
          promptTokens: inputTokens,
          completionTokens: outputTokens,
          totalTokens: inputTokens + outputTokens,
        },
        provider: 'gemini',
      };
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      callbacks.onError?.(error);
      throw error;
    }
  }
}
