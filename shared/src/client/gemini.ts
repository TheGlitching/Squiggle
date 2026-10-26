import { BYOKError } from '../types/byok';
import type {
  CompletionOptions,
  CompletionResponse,
  StreamCallbacks,
} from '../types/byok';
import type { GroundedAnswer, SearchResult } from './base';
import { BaseLLMClient } from './base';

export class GeminiClient extends BaseLLMClient {
  /**
   * The API key travels in a header, never in the query string.
   *
   * Google accepts `?key=…` and their own samples use it, but a URL is the
   * most-copied string in any system: it lands in a browser devtools network
   * panel, in a proxy access log, in an error report, in a `Referer`. The
   * header form keeps the key out of every one of those. It matters on both
   * sides — for a BYOK user this is *their* key in *their* devtools, and for
   * the hosted server it is ours.
   */
  private get authHeaders(): Record<string, string> {
    return {
      'content-type': 'application/json',
      'x-goog-api-key': this.config.apiKey,
      ...this.config.customHeaders,
    };
  }

  private get baseUrl(): string {
    return this.config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
  }

  private get modelName(): string {
    return this.config.model || 'gemini-3.8-flash';
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

  /**
   * `responseJsonSchema` takes a plain JSON Schema (`additionalProperties`
   * included). The older `responseSchema` takes an OpenAPI subset that
   * rejects `additionalProperties` outright, and is deprecated.
   */
  private buildBody(options: CompletionOptions): Record<string, unknown> {
    const { systemInstruction, contents } = this.formatContents(options);
    const generationConfig: Record<string, unknown> = {
      temperature: options.temperature ?? 0.2,
      maxOutputTokens: options.maxTokens,
    };
    if (options.jsonSchema) {
      generationConfig.responseMimeType = 'application/json';
      generationConfig.responseJsonSchema = options.jsonSchema;
    }
    const body: Record<string, unknown> = { contents, generationConfig };
    if (systemInstruction) {
      body.systemInstruction = systemInstruction;
    }
    return body;
  }

  async complete(options: CompletionOptions): Promise<CompletionResponse> {
    const response = await this.postJson(
      `${this.baseUrl}/models/${this.modelName}:generateContent`,
      this.authHeaders,
      this.buildBody(options),
      options.abortSignal
    );

    const data = await response.json() as {
      candidates?: unknown[];
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
    };

    return {
      content: this.extractCandidateText(data.candidates?.[0]),
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
   * model id.
   */
  override supportsWebSearch(): boolean {
    return true;
  }

  override async webSearch(query: string, opts?: { maxResults?: number }): Promise<SearchResult[]> {
    const body: Record<string, unknown> = {
      contents: [{ role: 'user', parts: [{ text: query }] }],
      tools: [{ google_search: {} }],
    };

    const response = await this.postJson(`${this.baseUrl}/models/${this.modelName}:generateContent`, this.authHeaders, body);

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
    const body = { ...this.buildBody({ ...options, jsonSchema: undefined }), tools: [{ google_search: {} }] };

    const response = await this.postJson(
      `${this.baseUrl}/models/${this.modelName}:generateContent`,
      this.authHeaders,
      body,
      options.abortSignal
    );

    const data = await response.json() as { candidates?: unknown };
    const firstCandidate = Array.isArray(data.candidates) ? data.candidates[0] : undefined;

    const content = this.extractCandidateText(firstCandidate).trim();
    if (!content) {
      throw new BYOKError({ provider: 'gemini', message: 'grounded answer returned no answer text' });
    }

    const groundingMetadata = firstCandidate && typeof firstCandidate === 'object' && 'groundingMetadata' in firstCandidate
      ? firstCandidate.groundingMetadata
      : undefined;

    const citations = this.dedupeCitations(this.parseGroundingMetadata(groundingMetadata, options.maxSearches));

    return { content, citations };
  }

  /**
   * A candidate's answer lives in `content.parts`, split across several parts
   * when the model interleaves prose with tool activity, and preceded by
   * `thought` parts when the model shares its reasoning. Those are not answer.
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
      if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string' && !('thought' in part && part.thought === true)) {
        parts.push(part.text);
      }
    }
    return parts.join('');
  }

  async stream(options: CompletionOptions, callbacks: StreamCallbacks): Promise<CompletionResponse> {
    let fullText = '';
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const response = await this.postJson(
        `${this.baseUrl}/models/${this.modelName}:streamGenerateContent?alt=sse`,
        this.authHeaders,
        this.buildBody(options),
        options.abortSignal
      );

      await this.readServerSentEvents(response, (event) => {
        const parsed = event as {
          candidates?: unknown[];
          usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
        };

        const delta = this.extractCandidateText(parsed.candidates?.[0]);
        if (delta) {
          fullText += delta;
          callbacks.onChunk(delta);
        }

        if (parsed.usageMetadata) {
          inputTokens = parsed.usageMetadata.promptTokenCount || inputTokens;
          outputTokens = parsed.usageMetadata.candidatesTokenCount || outputTokens;
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
      model: this.modelName,
      usage: {
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      provider: 'gemini',
    };
  }
}
