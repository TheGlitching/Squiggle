import { describe, it, expect, vi, afterEach } from 'vitest';
import { BaseLLMClient } from '../src/client/base';
import { AnthropicClient } from '../src/client/anthropic';
import { OpenAIClient } from '../src/client/openai';
import { GeminiClient } from '../src/client/gemini';
import { OpenRouterClient } from '../src/client/openrouter';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Bad Request',
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

class MinimalClient extends BaseLLMClient {
  async complete(): Promise<never> {
    throw new Error('not used');
  }

  async stream(): Promise<never> {
    throw new Error('not used');
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('BaseLLMClient grounded answer defaults', () => {
  it('reports no grounded answer support by default', () => {
    const client = new MinimalClient({ provider: 'anthropic', apiKey: 'k', model: 'm' });
    expect(client.supportsGroundedAnswer()).toBe(false);
  });

  it('throws, rather than resolving an empty answer, when an unsupporting provider is asked for one', async () => {
    const client = new MinimalClient({ provider: 'anthropic', apiKey: 'k', model: 'm' });
    await expect(client.groundedAnswer({ messages: [{ role: 'user', content: 'q' }] })).rejects.toThrow(/anthropic/);
  });
});

describe('AnthropicClient grounded answer', () => {
  it('supports grounded answers', () => {
    const client = new AnthropicClient({ provider: 'anthropic', apiKey: 'k', model: 'claude-3-5-sonnet-20241022' });
    expect(client.supportsGroundedAnswer()).toBe(true);
  });

  it('reads the answer text and citations from a realistic search-tool payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      content: [
        { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: 'article claim' } },
        {
          type: 'web_search_tool_result',
          tool_use_id: 'srvtoolu_1',
          content: [
            { type: 'web_search_result', url: 'https://example.com/a', title: 'Example A', encrypted_content: 'abc' },
            { type: 'web_search_result', url: 'https://example.com/b', title: 'Example B', encrypted_content: 'def' },
          ],
        },
        { type: 'text', text: 'The claim is confirmed by two independent sources.' },
      ],
    }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new AnthropicClient({ provider: 'anthropic', apiKey: 'k', model: 'claude-3-5-sonnet-20241022' });
    const result = await client.groundedAnswer({ messages: [{ role: 'user', content: 'is the claim true?' }] });

    expect(result.content).toBe('The claim is confirmed by two independent sources.');
    expect(result.citations).toEqual([
      { title: 'Example A', url: 'https://example.com/a', snippet: '' },
      { title: 'Example B', url: 'https://example.com/b', snippet: '' },
    ]);

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const requestBody = JSON.parse(requestInit.body as string);
    expect(requestBody.tools).toEqual([{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }]);
  });

  it('yields the answer text when the response has no search block at all', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      content: [{ type: 'text', text: 'No search was needed for this one.' }],
    })));

    const client = new AnthropicClient({ provider: 'anthropic', apiKey: 'k', model: 'claude-3-5-sonnet-20241022' });
    const result = await client.groundedAnswer({ messages: [{ role: 'user', content: 'q' }] });

    expect(result.content).toBe('No search was needed for this one.');
    expect(result.citations).toEqual([]);
  });

  it('drops a citation that has no usable url', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      content: [
        {
          type: 'web_search_tool_result',
          content: [
            { type: 'web_search_result', title: 'No url here' },
            { type: 'web_search_result', url: 'https://example.com/valid', title: 'Valid' },
          ],
        },
        { type: 'text', text: 'Answer text.' },
      ],
    })));

    const client = new AnthropicClient({ provider: 'anthropic', apiKey: 'k', model: 'claude-3-5-sonnet-20241022' });
    const result = await client.groundedAnswer({ messages: [{ role: 'user', content: 'q' }] });

    expect(result.citations).toEqual([{ title: 'Valid', url: 'https://example.com/valid', snippet: '' }]);
  });

  it('de-duplicates citations that appear both in a search-result block and a text-block citation, by url', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      content: [
        {
          type: 'web_search_tool_result',
          content: [
            { type: 'web_search_result', url: 'https://example.com/a', title: 'Example A' },
          ],
        },
        {
          type: 'text',
          text: 'The claim is confirmed.',
          citations: [
            { type: 'web_search_result_location', url: 'https://example.com/a', title: 'Example A (quoted)' },
          ],
        },
      ],
    })));

    const client = new AnthropicClient({ provider: 'anthropic', apiKey: 'k', model: 'claude-3-5-sonnet-20241022' });
    const result = await client.groundedAnswer({ messages: [{ role: 'user', content: 'q' }] });

    expect(result.citations).toEqual([{ title: 'Example A', url: 'https://example.com/a', snippet: '' }]);
  });

  it('throws rather than resolving an empty answer when the response carries no text block', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      content: [
        {
          type: 'web_search_tool_result',
          content: [{ type: 'web_search_result', url: 'https://example.com/a', title: 'Example A' }],
        },
      ],
    })));

    const client = new AnthropicClient({ provider: 'anthropic', apiKey: 'k', model: 'claude-3-5-sonnet-20241022' });
    await expect(client.groundedAnswer({ messages: [{ role: 'user', content: 'q' }] })).rejects.toThrow(/no answer text/);
  });
});

describe('GeminiClient grounded answer', () => {
  it('supports grounded answers', () => {
    const client = new GeminiClient({ provider: 'gemini', apiKey: 'k', model: 'gemini-1.5-pro' });
    expect(client.supportsGroundedAnswer()).toBe(true);
  });

  it('reads the answer text and grounding-chunk citations from a realistic payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      candidates: [
        {
          content: { role: 'model', parts: [{ text: 'Spain won Euro 2024, defeating England 2-1.' }] },
          groundingMetadata: {
            groundingChunks: [
              { web: { uri: 'https://aljazeera.com/euro2024', title: 'aljazeera.com' } },
              { web: { uri: 'https://uefa.com/euro2024', title: 'uefa.com' } },
            ],
            groundingSupports: [
              { segment: { startIndex: 0, endIndex: 44, text: 'Spain won Euro 2024, defeating England 2-1.' }, groundingChunkIndices: [0, 1] },
            ],
          },
        },
      ],
    }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new GeminiClient({ provider: 'gemini', apiKey: 'k', model: 'gemini-1.5-pro' });
    const result = await client.groundedAnswer({ messages: [{ role: 'user', content: 'who won euro 2024' }] });

    expect(result.content).toBe('Spain won Euro 2024, defeating England 2-1.');
    expect(result.citations).toEqual([
      { title: 'aljazeera.com', url: 'https://aljazeera.com/euro2024', snippet: 'Spain won Euro 2024, defeating England 2-1.' },
      { title: 'uefa.com', url: 'https://uefa.com/euro2024', snippet: 'Spain won Euro 2024, defeating England 2-1.' },
    ]);

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const requestBody = JSON.parse(requestInit.body as string);
    expect(requestBody.tools).toEqual([{ google_search: {} }]);
  });

  it('yields the answer text when groundingMetadata is absent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      candidates: [{ content: { role: 'model', parts: [{ text: 'No grounding was needed.' }] } }],
    })));

    const client = new GeminiClient({ provider: 'gemini', apiKey: 'k', model: 'gemini-1.5-pro' });
    const result = await client.groundedAnswer({ messages: [{ role: 'user', content: 'q' }] });

    expect(result.content).toBe('No grounding was needed.');
    expect(result.citations).toEqual([]);
  });

  it('drops a grounding chunk that has no usable uri', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      candidates: [
        {
          content: { role: 'model', parts: [{ text: 'Answer text.' }] },
          groundingMetadata: {
            groundingChunks: [
              { web: { title: 'Missing uri' } },
              { web: { uri: 'https://example.com/valid', title: 'Valid' } },
            ],
          },
        },
      ],
    })));

    const client = new GeminiClient({ provider: 'gemini', apiKey: 'k', model: 'gemini-1.5-pro' });
    const result = await client.groundedAnswer({ messages: [{ role: 'user', content: 'q' }] });

    expect(result.citations).toEqual([{ title: 'Valid', url: 'https://example.com/valid', snippet: '' }]);
  });

  it('de-duplicates grounding chunks that repeat the same uri, by url', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      candidates: [
        {
          content: { role: 'model', parts: [{ text: 'Answer text.' }] },
          groundingMetadata: {
            groundingChunks: [
              { web: { uri: 'https://example.com/a', title: 'Example A' } },
              { web: { uri: 'https://example.com/a', title: 'Example A (again)' } },
            ],
          },
        },
      ],
    })));

    const client = new GeminiClient({ provider: 'gemini', apiKey: 'k', model: 'gemini-1.5-pro' });
    const result = await client.groundedAnswer({ messages: [{ role: 'user', content: 'q' }] });

    expect(result.citations).toEqual([{ title: 'Example A', url: 'https://example.com/a', snippet: '' }]);
  });

  it('throws rather than resolving an empty answer when the candidate has no text part', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      candidates: [{ content: { role: 'model', parts: [] } }],
    })));

    const client = new GeminiClient({ provider: 'gemini', apiKey: 'k', model: 'gemini-1.5-pro' });
    await expect(client.groundedAnswer({ messages: [{ role: 'user', content: 'q' }] })).rejects.toThrow(/no answer text/);
  });
});

describe('OpenAIClient grounded answer', () => {
  it('reports no support on a non-search model', () => {
    const client = new OpenAIClient({ provider: 'openai', apiKey: 'k', model: 'gpt-4o' });
    expect(client.supportsGroundedAnswer()).toBe(false);
  });

  it('reports support on a search-preview model', () => {
    const client = new OpenAIClient({ provider: 'openai', apiKey: 'k', model: 'gpt-4o-search-preview' });
    expect(client.supportsGroundedAnswer()).toBe(true);
  });

  it('throws rather than requesting a grounded answer when the configured model does not support it', async () => {
    const client = new OpenAIClient({ provider: 'openai', apiKey: 'k', model: 'gpt-4o' });
    await expect(client.groundedAnswer({ messages: [{ role: 'user', content: 'q' }] })).rejects.toThrow(/does not support grounded answers/);
  });

  it('reads the message content and url_citation annotations, including their real snippet, from a realistic payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      choices: [
        {
          message: {
            content: 'The claim is confirmed by the sourced article.',
            annotations: [
              {
                type: 'url_citation',
                url_citation: {
                  url: 'https://example.com/source-a',
                  title: 'Source A',
                  content: 'The exact page text the model actually read.',
                  start_index: 0,
                  end_index: 10,
                },
              },
            ],
          },
        },
      ],
    }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new OpenAIClient({ provider: 'openai', apiKey: 'k', model: 'gpt-4o-search-preview' });
    const result = await client.groundedAnswer({ messages: [{ role: 'user', content: 'q' }] });

    expect(result.content).toBe('The claim is confirmed by the sourced article.');
    expect(result.citations).toEqual([
      { title: 'Source A', url: 'https://example.com/source-a', snippet: 'The exact page text the model actually read.' },
    ]);

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const requestBody = JSON.parse(requestInit.body as string);
    expect(requestBody.web_search_options).toEqual({});
  });

  it('yields the answer text when annotations are absent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      choices: [{ message: { content: 'No citations were needed.' } }],
    })));

    const client = new OpenAIClient({ provider: 'openai', apiKey: 'k', model: 'gpt-4o-search-preview' });
    const result = await client.groundedAnswer({ messages: [{ role: 'user', content: 'q' }] });

    expect(result.content).toBe('No citations were needed.');
    expect(result.citations).toEqual([]);
  });

  it('drops an annotation that has no usable url', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      choices: [
        {
          message: {
            content: 'Answer text.',
            annotations: [
              { type: 'url_citation', url_citation: { title: 'No url' } },
              { type: 'url_citation', url_citation: { url: 'https://example.com/valid', title: 'Valid', content: 'Excerpt.' } },
            ],
          },
        },
      ],
    })));

    const client = new OpenAIClient({ provider: 'openai', apiKey: 'k', model: 'gpt-4o-search-preview' });
    const result = await client.groundedAnswer({ messages: [{ role: 'user', content: 'q' }] });

    expect(result.citations).toEqual([{ title: 'Valid', url: 'https://example.com/valid', snippet: 'Excerpt.' }]);
  });

  it('de-duplicates annotations that repeat the same url', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      choices: [
        {
          message: {
            content: 'Answer text.',
            annotations: [
              { type: 'url_citation', url_citation: { url: 'https://example.com/a', title: 'Example A', content: 'First excerpt.' } },
              { type: 'url_citation', url_citation: { url: 'https://example.com/a', title: 'Example A again', content: 'Second excerpt.' } },
            ],
          },
        },
      ],
    })));

    const client = new OpenAIClient({ provider: 'openai', apiKey: 'k', model: 'gpt-4o-search-preview' });
    const result = await client.groundedAnswer({ messages: [{ role: 'user', content: 'q' }] });

    expect(result.citations).toEqual([{ title: 'Example A', url: 'https://example.com/a', snippet: 'First excerpt.' }]);
  });

  it('throws rather than resolving an empty answer when the message content is blank', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      choices: [{ message: { content: '' } }],
    })));

    const client = new OpenAIClient({ provider: 'openai', apiKey: 'k', model: 'gpt-4o-search-preview' });
    await expect(client.groundedAnswer({ messages: [{ role: 'user', content: 'q' }] })).rejects.toThrow(/no answer text/);
  });
});

describe('OpenRouterClient grounded answer', () => {
  it('supports grounded answers regardless of the routed model', () => {
    const client = new OpenRouterClient({ provider: 'openrouter', apiKey: 'k', model: 'anthropic/claude-3.5-sonnet' });
    expect(client.supportsGroundedAnswer()).toBe(true);
  });

  it('requests the :online model suffix and reads annotations into citations', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      choices: [
        {
          message: {
            content: 'Answer with citation.',
            annotations: [
              {
                type: 'url_citation',
                url_citation: { url: 'https://example.com/or-source', title: 'OR Source', content: 'Excerpt.' },
              },
            ],
          },
        },
      ],
    }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new OpenRouterClient({ provider: 'openrouter', apiKey: 'k', model: 'anthropic/claude-3.5-sonnet' });
    const result = await client.groundedAnswer({ messages: [{ role: 'user', content: 'q' }] });

    expect(result.content).toBe('Answer with citation.');
    expect(result.citations).toEqual([{ title: 'OR Source', url: 'https://example.com/or-source', snippet: 'Excerpt.' }]);

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const requestBody = JSON.parse(requestInit.body as string);
    expect(requestBody.model).toBe('anthropic/claude-3.5-sonnet:online');
    expect(requestBody.web_search_options).toBeUndefined();
  });

  it('yields the answer text when annotations are absent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      choices: [{ message: { content: 'No citations.' } }],
    })));

    const client = new OpenRouterClient({ provider: 'openrouter', apiKey: 'k', model: 'anthropic/claude-3.5-sonnet' });
    const result = await client.groundedAnswer({ messages: [{ role: 'user', content: 'q' }] });

    expect(result.content).toBe('No citations.');
    expect(result.citations).toEqual([]);
  });
});
