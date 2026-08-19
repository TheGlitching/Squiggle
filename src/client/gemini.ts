import { BYOKError } from '../types/byok';
import type {
  CompletionOptions,
  CompletionResponse,
  StreamCallbacks,
} from '../types/byok';
import type { GroundedAnswer, SearchResult } from './base';
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

  /**
   * Grounding with Google Search is a per-request tool, available on every
   * model this client targets, so support does not depend on the configured
   * model id the way OpenAI's search-preview gating does.
   */
  override supportsWebSearch(): boolean {
    return true;
  }

  override async webSearch(query: string, opts?: { maxResults?: number }): Promise<SearchResult[]> {
    const body: Record<string, unknown> = {
      contents: [{ role: 'user', parts: [{ text: query }] }],
      tools: [{ google_search: {} }],
    };

    const endpoint = `${this.baseUrl}/models/${this.modelName}:generateContent?key=${this.config.apiKey}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...this.config.customHeaders,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let errorData: unknown;
      let errorMessage = response.statusText || 'Gemini web search request failed';
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
        provider: 'gemini',
        statusCode: response.status,
        message: errorMessage,
        raw: errorData,
      });
    }

    const data = await response.json() as { candidates?: unknown };
    const firstCandidate = Array.isArray(data.candidates) ? data.candidates[0] : undefined;
    const groundingMetadata = firstCandidate && typeof firstCandidate === 'object' && 'groundingMetadata' in firstCandidate
      ? firstCandidate.groundingMetadata
      : undefined;

    return this.parseGroundingMetadata(groundingMetadata, opts?.maxResults);
  }

  /**
   * `groundingChunks` carries the sources; `groundingSupports` links each
   * chunk to the response text it backs. A chunk without a matching support
   * still yields a source, just with an empty snippet, since the citation
   * itself is not optional.
   */
  private parseGroundingMetadata(metadata: unknown, maxResults?: number): SearchResult[] {
    if (!metadata || typeof metadata !== 'object' || !('groundingChunks' in metadata) || !Array.isArray(metadata.groundingChunks)) {
      return [];
    }

    const snippetByChunkIndex = new Map<number, string>();
    if ('groundingSupports' in metadata && Array.isArray(metadata.groundingSupports)) {
      for (const support of metadata.groundingSupports) {
        if (!support || typeof support !== 'object' || !('segment' in support) || !('groundingChunkIndices' in support)) {
          continue;
        }
        const segment = support.segment;
        const indices = support.groundingChunkIndices;
        if (!segment || typeof segment !== 'object' || !('text' in segment) || typeof segment.text !== 'string' || !Array.isArray(indices)) {
          continue;
        }
        for (const index of indices) {
          if (typeof index === 'number' && !snippetByChunkIndex.has(index)) {
            snippetByChunkIndex.set(index, segment.text);
          }
        }
      }
    }

    const results: SearchResult[] = [];
    metadata.groundingChunks.forEach((chunk: unknown, index: number) => {
      if (!chunk || typeof chunk !== 'object' || !('web' in chunk)) {
        return;
      }
      const web = chunk.web;
      if (!web || typeof web !== 'object' || !('uri' in web) || typeof web.uri !== 'string' || web.uri.length === 0) {
        return;
      }
      const title = 'title' in web && typeof web.title === 'string' && web.title.length > 0 ? web.title : web.uri;
      results.push({ title, url: web.uri, snippet: snippetByChunkIndex.get(index) || '' });
    });

    return typeof maxResults === 'number' ? results.slice(0, maxResults) : results;
  }

  /**
   * Grounding runs through the same `google_search` tool as `webSearch`, but
   * the answer text is read from the candidate itself since the model's own
   * prose, not just the source list, is what the caller needs here.
   */
  override supportsGroundedAnswer(): boolean {
    return true;
  }

  override async groundedAnswer(options: CompletionOptions & { maxSearches?: number }): Promise<GroundedAnswer> {
    const { systemInstruction, contents } = this.formatContents(options);

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: options.temperature ?? 0.2,
        maxOutputTokens: options.maxTokens,
      },
      tools: [{ google_search: {} }],
    };

    if (systemInstruction) {
      body.systemInstruction = systemInstruction;
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
      let errorMessage = response.statusText || 'Gemini grounded answer request failed';
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
        provider: 'gemini',
        statusCode: response.status,
        message: errorMessage,
        raw: errorData,
      });
    }

    const data = await response.json() as { candidates?: unknown };
    const firstCandidate = Array.isArray(data.candidates) ? data.candidates[0] : undefined;

    const content = this.extractCandidateText(firstCandidate).trim();
    if (!content) {
      throw new Error('gemini grounded answer returned no answer text');
    }

    const groundingMetadata = firstCandidate && typeof firstCandidate === 'object' && 'groundingMetadata' in firstCandidate
      ? firstCandidate.groundingMetadata
      : undefined;

    const citations = this.dedupeCitations(this.parseGroundingMetadata(groundingMetadata, options.maxSearches));

    return { content, citations };
  }

  /**
   * A candidate's answer lives in `content.parts`, split across one part per
   * text segment when the model interleaves prose with tool activity.
   */
  private extractCandidateText(candidate: unknown): string {
    if (!candidate || typeof candidate !== 'object' || !('content' in candidate)) {
      return '';
    }
    const candidateContent = candidate.content;
    if (!candidateContent || typeof candidateContent !== 'object' || !('parts' in candidateContent) || !Array.isArray(candidateContent.parts)) {
      return '';
    }

    const parts: string[] = [];
    for (const part of candidateContent.parts) {
      if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
        parts.push(part.text);
      }
    }
    return parts.join('\n');
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
