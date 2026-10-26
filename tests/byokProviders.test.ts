import { describe, it, expect, vi, afterEach } from 'vitest';
import { BYOKError, GeminiClient, OpenAIClient, OpenRouterClient } from '@squiggle/shared';
import type { BaseLLMClient, LLMProvider } from '@squiggle/shared';
import { AnthropicClient } from '../src/client/anthropic';
import { createLLMClient } from '../src/client/factory';

/**
 * Each provider's request and response shapes, checked against doubles that
 * behave like the provider's documented API: they accept what the current docs
 * accept, reject what the docs say is rejected, and answer in the documented
 * shape. No test here reaches a network or uses a real key.
 */

interface Call {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function stubFetch(handler: (call: Call) => Response): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const call: Call = {
      url,
      headers: { ...(init.headers as Record<string, string>) },
      body: JSON.parse(String(init.body)),
    };
    calls.push(call);
    return handler(call);
  }));
  return calls;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function sse(events: unknown[]): Response {
  const text = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  return new Response(text, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

async function caught(promise: Promise<unknown>): Promise<BYOKError> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(BYOKError);
    return err as BYOKError;
  }
  throw new Error('expected a rejection');
}

const KEY = 'sk-test-0123456789abcdef';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Anthropic Messages API', () => {
  const anthropicError = (status: number, type: string, message: string) =>
    json({ type: 'error', error: { type, message } }, status);

  /** Current models (and API version 2026-10-21) reject every sampling parameter with a 400. */
  const messagesApi = (answer: Record<string, unknown>) => (call: Call) => {
    for (const field of ['temperature', 'top_p', 'top_k']) {
      if (field in call.body) {
        return anthropicError(400, 'invalid_request_error', `${field}: is not supported`);
      }
    }
    return json(answer);
  };

  it('sends no sampling parameter, so a current model accepts the request', async () => {
    const calls = stubFetch(messagesApi({
      model: 'claude-sonnet-5-5',
      content: [{ type: 'text', text: 'OK' }],
      usage: { input_tokens: 10, output_tokens: 1 },
    }));
    const client = new AnthropicClient({ provider: 'anthropic', apiKey: KEY, model: 'claude-sonnet-5-5' });

    const response = await client.complete({ messages: [{ role: 'user', content: 'Réponds OK' }], temperature: 0 });

    expect(response.content).toBe('OK');
    expect(calls[0].url).toBe('https://api.anthropic.com/v1/messages');
    expect(calls[0].headers['x-api-key']).toBe(KEY);
    expect(calls[0].headers['anthropic-version']).toBe('2026-10-21');
    expect(calls[0].headers['anthropic-dangerous-direct-browser-access']).toBe('true');
  });

  it('reads the answer after the thinking block current models open with', async () => {
    stubFetch(messagesApi({
      model: 'claude-opus-5-5',
      content: [
        { type: 'thinking', thinking: '', signature: 'sig' },
        { type: 'text', text: '{"ok":' },
        { type: 'text', text: 'true}' },
      ],
      usage: { input_tokens: 10, output_tokens: 5 },
    }));
    const client = new AnthropicClient({ provider: 'anthropic', apiKey: KEY, model: 'claude-opus-5-5' });

    const response = await client.complete({ messages: [{ role: 'user', content: 'q' }] });

    expect(response.content).toBe('{"ok":true}');
  });

  it('asks for structured output through output_config.format when given a schema', async () => {
    const calls = stubFetch(messagesApi({ content: [{ type: 'text', text: '{}' }] }));
    const client = new AnthropicClient({ provider: 'anthropic', apiKey: KEY, model: 'claude-sonnet-5-5' });
    const schema = { type: 'object', properties: { a: { type: 'string' } }, required: ['a'], additionalProperties: false };

    await client.complete({ messages: [{ role: 'user', content: 'q' }], jsonSchema: schema });

    expect(calls[0].body.output_config).toEqual({ format: { type: 'json_schema', schema } });
  });

  it('sends no sampling parameter on a stream, a search or a grounded answer either', async () => {
    const calls = stubFetch((call) => {
      if (call.body.stream) {
        return sse([
          { type: 'message_start', message: { usage: { input_tokens: 3 } } },
          { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'OK' } },
          { type: 'message_delta', usage: { output_tokens: 1 } },
          { type: 'message_stop' },
        ]);
      }
      return messagesApi({ content: [{ type: 'text', text: 'OK' }] })(call);
    });
    const client = new AnthropicClient({ provider: 'anthropic', apiKey: KEY, model: 'claude-sonnet-5-5' });

    await client.stream({ messages: [{ role: 'user', content: 'q' }], temperature: 0.1 }, { onChunk: () => {} });
    await client.webSearch('q');
    await client.groundedAnswer({ messages: [{ role: 'user', content: 'q' }], temperature: 0.1 });

    for (const call of calls) {
      expect(call.body).not.toHaveProperty('temperature');
    }
  });

  it('fails a stream that the API interrupts with an error event, instead of returning the partial text', async () => {
    stubFetch(() => sse([
      { type: 'message_start', message: { usage: { input_tokens: 3 } } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '{"partial' } },
      { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } },
    ]));
    const client = new AnthropicClient({ provider: 'anthropic', apiKey: KEY, model: 'claude-sonnet-5-5' });

    const err = await caught(client.stream({ messages: [{ role: 'user', content: 'q' }] }, { onChunk: () => {} }));

    expect(err.kind).toBe('unavailable');
  });

  it.each([
    [401, 'authentication_error', 'invalid x-api-key', 'auth'],
    [403, 'permission_error', 'Your API key does not have permission to use the specified resource.', 'auth'],
    [404, 'not_found_error', 'model: claude-unknown', 'model'],
    [429, 'rate_limit_error', 'Number of request tokens has exceeded your per-minute rate limit', 'quota'],
    [400, 'invalid_request_error', 'Your credit balance is too low to access the Anthropic API.', 'quota'],
    [529, 'overloaded_error', 'Overloaded', 'unavailable'],
  ])('classifies a %i %s as %s', async (status, type, message, kind) => {
    stubFetch(() => anthropicError(status, type, message));
    const client = new AnthropicClient({ provider: 'anthropic', apiKey: KEY, model: 'claude-sonnet-5-5' });

    const err = await caught(client.complete({ messages: [{ role: 'user', content: 'q' }] }));

    expect(err.kind).toBe(kind);
    expect(err.statusCode).toBe(status);
    expect(err.message).toContain(message);
  });
});

describe('OpenAI Chat Completions and Responses APIs', () => {
  const openaiError = (status: number, message: string, code: string | null, type = 'invalid_request_error') =>
    json({ error: { message, type, param: null, code } }, status);

  /** Current OpenAI models are reasoning models: `max_tokens` and a non-default `temperature` are rejected. */
  const chatCompletions = (content: string) => (call: Call) => {
    if ('max_tokens' in call.body) {
      return openaiError(400, "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.", 'unsupported_parameter');
    }
    if ('temperature' in call.body && call.body.temperature !== 1) {
      return openaiError(400, "Unsupported value: 'temperature' does not support 0.2 with this model. Only the default (1) value is supported.", 'unsupported_value');
    }
    return json({
      model: call.body.model,
      choices: [{ index: 0, message: { role: 'assistant', content, annotations: [] }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
    });
  };

  it('caps the answer with max_completion_tokens and sends no temperature, so a reasoning model accepts it', async () => {
    const calls = stubFetch(chatCompletions('OK'));
    const client = new OpenAIClient({ provider: 'openai', apiKey: KEY, model: 'gpt-6.1-sol' });

    const response = await client.complete({ messages: [{ role: 'user', content: 'q' }], maxTokens: 64, temperature: 0 });

    expect(response.content).toBe('OK');
    expect(calls[0].url).toBe('https://api.openai.com/v1/chat/completions');
    expect(calls[0].headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(calls[0].body.max_completion_tokens).toBe(64);
  });

  it('streams with the same parameters', async () => {
    const calls = stubFetch((call) => {
      const rejected = chatCompletions('')(call);
      if (rejected.status !== 200) return rejected;
      return sse([
        { choices: [{ index: 0, delta: { content: 'O' } }] },
        { choices: [{ index: 0, delta: { content: 'K' } }] },
        { choices: [], usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 } },
      ]);
    });
    const client = new OpenAIClient({ provider: 'openai', apiKey: KEY, model: 'gpt-6.1-sol' });

    const response = await client.stream({ messages: [{ role: 'user', content: 'q' }], maxTokens: 64, temperature: 0.1 }, { onChunk: () => {} });

    expect(response.content).toBe('OK');
    expect(calls[0].body.stream).toBe(true);
  });

  /** The Responses API answer: a web_search_call item, then a message whose output_text carries flat url_citation annotations. */
  const responsesApi = (call: Call) => {
    const tools = call.body.tools as Array<{ type: string }> | undefined;
    if (!tools?.some((t) => t.type === 'web_search')) {
      return openaiError(400, 'expected the web_search tool', null);
    }
    return json({
      id: 'resp_1',
      object: 'response',
      status: 'completed',
      model: call.body.model,
      output: [
        {
          type: 'web_search_call',
          id: 'ws_1',
          status: 'completed',
          action: {
            type: 'search',
            query: 'claim',
            sources: [
              { type: 'url', url: 'https://example.com/a' },
              { type: 'url', url: 'https://example.com/b' },
            ],
          },
        },
        {
          type: 'message',
          id: 'msg_1',
          role: 'assistant',
          status: 'completed',
          content: [
            {
              type: 'output_text',
              text: '{"verification":"verifiee"}',
              annotations: [
                { type: 'url_citation', url: 'https://example.com/a', title: 'Example A', start_index: 0, end_index: 5 },
              ],
            },
          ],
        },
      ],
    });
  };

  it('searches the web with any current model, through the Responses API web_search tool', async () => {
    const calls = stubFetch(responsesApi);
    const client = new OpenAIClient({ provider: 'openai', apiKey: KEY, model: 'gpt-6.1-sol' });

    expect(client.supportsWebSearch()).toBe(true);
    const results = await client.webSearch('claim', { maxResults: 5 });

    expect(calls[0].url).toBe('https://api.openai.com/v1/responses');
    expect(calls[0].body.include).toEqual(['web_search_call.action.sources']);
    expect(results).toEqual([
      { title: 'Example A', url: 'https://example.com/a', snippet: '' },
      { title: 'https://example.com/b', url: 'https://example.com/b', snippet: '' },
    ]);
  });

  it('answers grounded on what the search fetched, through the Responses API', async () => {
    const calls = stubFetch(responsesApi);
    const client = new OpenAIClient({ provider: 'openai', apiKey: KEY, model: 'gpt-6.1-sol' });

    expect(client.supportsGroundedAnswer()).toBe(true);
    const answer = await client.groundedAnswer({
      systemPrompt: 'Juge.',
      messages: [{ role: 'user', content: 'claim' }],
      maxSearches: 3,
    });

    expect(calls[0].body.instructions).toBe('Juge.');
    expect(calls[0].body.max_tool_calls).toBe(3);
    expect(calls[0].body).not.toHaveProperty('temperature');
    expect(answer.content).toBe('{"verification":"verifiee"}');
    expect(answer.citations.map((c) => c.url)).toEqual(['https://example.com/a', 'https://example.com/b']);
  });

  it.each([
    [401, 'Incorrect API key provided: sk-test-*****cdef.', 'invalid_api_key', 'auth'],
    [404, 'The model `gpt-unknown` does not exist or you do not have access to it.', 'model_not_found', 'model'],
    [429, 'You exceeded your current quota, please check your plan and billing details.', 'insufficient_quota', 'quota'],
    [429, 'Rate limit reached for gpt-6.1-sol on tokens per min (TPM).', 'rate_limit_exceeded', 'quota'],
    [500, 'The server had an error while processing your request.', null, 'unavailable'],
  ])('classifies a %i %s as its kind', async (status, message, code, kind) => {
    stubFetch(() => openaiError(status, message, code));
    const client = new OpenAIClient({ provider: 'openai', apiKey: KEY, model: 'gpt-6.1-sol' });

    const err = await caught(client.complete({ messages: [{ role: 'user', content: 'q' }] }));

    expect(err.kind).toBe(kind);
    expect(err.message).toContain(message);
  });
});

describe('OpenRouter', () => {
  it('keeps max_tokens and temperature, which OpenRouter normalises for every routed model', async () => {
    const calls = stubFetch(() => json({ choices: [{ message: { content: 'OK' } }] }));
    const client = new OpenRouterClient({ provider: 'openrouter', apiKey: KEY, model: 'deepseek/deepseek-v4.1-flash' });

    await client.complete({ messages: [{ role: 'user', content: 'q' }], maxTokens: 64, temperature: 0.1 });

    expect(calls[0].url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(calls[0].body.max_tokens).toBe(64);
    expect(calls[0].body.temperature).toBe(0.1);
  });

  it('fails a stream that ends on an error chunk, instead of returning the partial text', async () => {
    stubFetch(() => sse([
      { choices: [{ index: 0, delta: { content: '{"partial' } }] },
      { error: { code: 502, message: 'Provider returned error' }, choices: [{ index: 0, delta: { content: '' }, finish_reason: 'error' }] },
    ]));
    const client = new OpenRouterClient({ provider: 'openrouter', apiKey: KEY, model: 'deepseek/deepseek-v4.1-flash' });

    const err = await caught(client.stream({ messages: [{ role: 'user', content: 'q' }] }, { onChunk: () => {} }));

    expect(err.message).toContain('Provider returned error');
  });

  it.each([
    [401, 'No auth credentials found', 'auth'],
    [402, 'Insufficient credits. Add more using https://openrouter.ai/credits', 'quota'],
    [400, 'deepseek/unknown is not a valid model ID', 'model'],
    [429, 'Rate limit exceeded', 'quota'],
  ])('classifies a %i as its kind', async (status, message, kind) => {
    stubFetch(() => json({ error: { code: status, message } }, status));
    const client = new OpenRouterClient({ provider: 'openrouter', apiKey: KEY, model: 'deepseek/deepseek-v4.1-flash' });

    const err = await caught(client.complete({ messages: [{ role: 'user', content: 'q' }] }));

    expect(err.kind).toBe(kind);
  });
});

describe('Gemini generateContent API', () => {
  const geminiError = (code: number, status: string, message: string, reason?: string) =>
    json({
      error: {
        code,
        message,
        status,
        ...(reason ? { details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason, domain: 'googleapis.com' }] } : {}),
      },
    }, code);

  it('asks for JSON through responseJsonSchema, which takes a plain JSON Schema with additionalProperties', async () => {
    const calls = stubFetch((call) => {
      const config = call.body.generationConfig as Record<string, unknown>;
      if ('responseSchema' in config) {
        return geminiError(400, 'INVALID_ARGUMENT', 'Invalid JSON payload received. Unknown name "additionalProperties" at \'generation_config.response_schema\': Cannot find field.');
      }
      return json({ candidates: [{ content: { role: 'model', parts: [{ text: '{"a":"b"}' }] }, finishReason: 'STOP' }] });
    });
    const client = new GeminiClient({ provider: 'gemini', apiKey: KEY, model: 'gemini-3.8-flash' });
    const schema = { type: 'object', properties: { a: { type: 'string' } }, required: ['a'], additionalProperties: false };

    const response = await client.complete({ messages: [{ role: 'user', content: 'q' }], jsonSchema: schema });

    expect(response.content).toBe('{"a":"b"}');
    expect(calls[0].url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
    expect(calls[0].headers['x-goog-api-key']).toBe(KEY);
    expect(calls[0].body.generationConfig).toMatchObject({ responseMimeType: 'application/json', responseJsonSchema: schema });
  });

  it('reads every answer part and skips thought parts', async () => {
    stubFetch(() => json({
      candidates: [{
        content: {
          role: 'model',
          parts: [
            { text: 'Weighing the claim', thought: true },
            { text: '{"ok":', thoughtSignature: 'c2ln' },
            { text: 'true}' },
          ],
        },
        finishReason: 'STOP',
      }],
    }));
    const client = new GeminiClient({ provider: 'gemini', apiKey: KEY, model: 'gemini-3.8-flash' });

    const response = await client.complete({ messages: [{ role: 'user', content: 'q' }] });

    expect(response.content).toBe('{"ok":true}');
  });

  it('streams every answer part and skips thought parts', async () => {
    stubFetch(() => sse([
      { candidates: [{ content: { role: 'model', parts: [{ text: 'thinking', thought: true }] } }] },
      { candidates: [{ content: { role: 'model', parts: [{ text: 'O' }, { text: 'K' }] } }] },
      { candidates: [{ content: { role: 'model', parts: [{ text: '' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 1 } },
    ]));
    const client = new GeminiClient({ provider: 'gemini', apiKey: KEY, model: 'gemini-3.8-flash' });

    const response = await client.stream({ messages: [{ role: 'user', content: 'q' }] }, { onChunk: () => {} });

    expect(response.content).toBe('OK');
  });

  it.each([
    [400, 'INVALID_ARGUMENT', 'API key not valid. Please pass a valid API key.', 'API_KEY_INVALID', 'auth'],
    [403, 'PERMISSION_DENIED', 'Method doesn\'t allow unregistered callers.', undefined, 'auth'],
    [404, 'NOT_FOUND', 'models/gemini-unknown is not found for API version v1beta, or is not supported for generateContent.', undefined, 'model'],
    [429, 'RESOURCE_EXHAUSTED', 'You exceeded your current quota, please check your plan and billing details.', undefined, 'quota'],
    [503, 'UNAVAILABLE', 'The model is overloaded. Please try again later.', undefined, 'unavailable'],
  ])('classifies a %i %s as its kind', async (code, status, message, reason, kind) => {
    stubFetch(() => geminiError(code, status, message, reason));
    const client = new GeminiClient({ provider: 'gemini', apiKey: KEY, model: 'gemini-3.8-flash' });

    const err = await caught(client.complete({ messages: [{ role: 'user', content: 'q' }] }));

    expect(err.kind).toBe(kind);
    expect(err.message).toContain(message);
  });
});

describe('the key stays in a header', () => {
  const answerFor = (provider: LLMProvider) => {
    switch (provider) {
      case 'anthropic':
        return { content: [{ type: 'text', text: 'OK' }] };
      case 'gemini':
        return { candidates: [{ content: { parts: [{ text: 'OK' }] } }] };
      default:
        return {
          choices: [{ message: { content: 'OK' } }],
          output: [{ type: 'message', content: [{ type: 'output_text', text: 'OK', annotations: [] }] }],
        };
    }
  };

  it.each(['anthropic', 'openai', 'openrouter', 'gemini'] as const)(
    '%s never puts the key in a URL, nor echoes it in an error message',
    async (provider) => {
      const calls = stubFetch(() => json(answerFor(provider)));
      const client: BaseLLMClient = createLLMClient({ provider, apiKey: KEY, model: 'some-model' });

      await client.complete({ messages: [{ role: 'user', content: 'q' }] });
      if (client.supportsGroundedAnswer()) {
        await client.groundedAnswer({ messages: [{ role: 'user', content: 'q' }] });
      }
      for (const call of calls) {
        expect(call.url).not.toContain(KEY);
        expect(JSON.stringify(call.body)).not.toContain(KEY);
      }

      stubFetch(() => json({ error: { message: 'denied' } }, 401));
      const err = await caught(client.complete({ messages: [{ role: 'user', content: 'q' }] }));
      expect(err.message).not.toContain(KEY);
      expect(JSON.stringify(err.raw)).not.toContain(KEY);
    }
  );
});
