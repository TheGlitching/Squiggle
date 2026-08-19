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

describe('BaseLLMClient web search defaults', () => {
  it('reports no web search support by default', () => {
    const client = new MinimalClient({ provider: 'anthropic', apiKey: 'k', model: 'm' });
    expect(client.supportsWebSearch()).toBe(false);
  });

  it('throws, rather than resolving empty, when an unsupporting provider is asked to search', async () => {
    const client = new MinimalClient({ provider: 'anthropic', apiKey: 'k', model: 'm' });
    await expect(client.webSearch('query')).rejects.toThrow(/anthropic/);
  });
});

describe('AnthropicClient web search', () => {
  it('supports web search', () => {
    const client = new AnthropicClient({ provider: 'anthropic', apiKey: 'k', model: 'claude-3-5-sonnet-20241022' });
    expect(client.supportsWebSearch()).toBe(true);
  });

  it('parses a realistic web_search_tool_result payload into SearchResult[]', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      content: [
        { type: 'text', text: 'Let me check that.' },
        { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: 'article claim' } },
        {
          type: 'web_search_tool_result',
          tool_use_id: 'srvtoolu_1',
          content: [
            { type: 'web_search_result', url: 'https://example.com/a', title: 'Example A', encrypted_content: 'abc', page_age: '2 days ago' },
            { type: 'web_search_result', url: 'https://example.com/b', title: 'Example B', encrypted_content: 'def' },
          ],
        },
        { type: 'text', text: 'Here is what I found, with citations.' },
      ],
    }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new AnthropicClient({ provider: 'anthropic', apiKey: 'k', model: 'claude-3-5-sonnet-20241022' });
    const results = await client.webSearch('article claim');

    expect(results).toEqual([
      { title: 'Example A', url: 'https://example.com/a', snippet: '' },
      { title: 'Example B', url: 'https://example.com/b', snippet: '' },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('yields no results, without throwing, when the response has no search block', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      content: [{ type: 'text', text: 'No search was needed.' }],
    })));

    const client = new AnthropicClient({ provider: 'anthropic', apiKey: 'k', model: 'claude-3-5-sonnet-20241022' });
    await expect(client.webSearch('query')).resolves.toEqual([]);
  });

  it('drops a search result entry that has no usable url', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      content: [
        {
          type: 'web_search_tool_result',
          content: [
            { type: 'web_search_result', title: 'No url here' },
            { type: 'web_search_result', url: 'https://example.com/valid', title: 'Valid' },
          ],
        },
      ],
    })));

    const client = new AnthropicClient({ provider: 'anthropic', apiKey: 'k', model: 'claude-3-5-sonnet-20241022' });
    const results = await client.webSearch('query');
    expect(results).toEqual([{ title: 'Valid', url: 'https://example.com/valid', snippet: '' }]);
  });
});

describe('GeminiClient web search', () => {
  it('supports web search', () => {
    const client = new GeminiClient({ provider: 'gemini', apiKey: 'k', model: 'gemini-1.5-pro' });
    expect(client.supportsWebSearch()).toBe(true);
  });

  it('parses grounding chunks and matching supports into SearchResult[]', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      candidates: [
        {
          content: { role: 'model', parts: [{ text: 'Spain won Euro 2024, defeating England 2-1.' }] },
          groundingMetadata: {
            webSearchQueries: ['who won euro 2024'],
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
    })));

    const client = new GeminiClient({ provider: 'gemini', apiKey: 'k', model: 'gemini-1.5-pro' });
    const results = await client.webSearch('who won euro 2024');

    expect(results).toEqual([
      { title: 'aljazeera.com', url: 'https://aljazeera.com/euro2024', snippet: 'Spain won Euro 2024, defeating England 2-1.' },
      { title: 'uefa.com', url: 'https://uefa.com/euro2024', snippet: 'Spain won Euro 2024, defeating England 2-1.' },
    ]);
  });

  it('yields no results, without throwing, when groundingMetadata is absent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      candidates: [{ content: { role: 'model', parts: [{ text: 'No grounding here.' }] } }],
    })));

    const client = new GeminiClient({ provider: 'gemini', apiKey: 'k', model: 'gemini-1.5-pro' });
    await expect(client.webSearch('query')).resolves.toEqual([]);
  });

  it('drops a grounding chunk that has no usable uri', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      candidates: [
        {
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
    const results = await client.webSearch('query');
    expect(results).toEqual([{ title: 'Valid', url: 'https://example.com/valid', snippet: '' }]);
  });
});

describe('OpenAIClient web search', () => {
  it('reports no support on a non-search model', () => {
    const client = new OpenAIClient({ provider: 'openai', apiKey: 'k', model: 'gpt-4o' });
    expect(client.supportsWebSearch()).toBe(false);
  });

  it('reports support on a search-preview model', () => {
    const client = new OpenAIClient({ provider: 'openai', apiKey: 'k', model: 'gpt-4o-search-preview' });
    expect(client.supportsWebSearch()).toBe(true);
  });

  it('throws rather than searching when the configured model does not support it', async () => {
    const client = new OpenAIClient({ provider: 'openai', apiKey: 'k', model: 'gpt-4o' });
    await expect(client.webSearch('query')).rejects.toThrow(/does not support web search/);
  });

  it('parses url_citation annotations into SearchResult[]', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      choices: [
        {
          message: {
            content: 'Here is the answer, sourced.',
            annotations: [
              {
                type: 'url_citation',
                url_citation: {
                  url: 'https://example.com/source-a',
                  title: 'Source A',
                  content: 'Relevant excerpt from source A.',
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
    const results = await client.webSearch('query');

    expect(results).toEqual([
      { title: 'Source A', url: 'https://example.com/source-a', snippet: 'Relevant excerpt from source A.' },
    ]);
    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const requestBody = JSON.parse(requestInit.body as string);
    expect(requestBody.web_search_options).toEqual({});
  });

  it('yields no results, without throwing, when annotations are absent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      choices: [{ message: { content: 'No citations here.' } }],
    })));

    const client = new OpenAIClient({ provider: 'openai', apiKey: 'k', model: 'gpt-4o-search-preview' });
    await expect(client.webSearch('query')).resolves.toEqual([]);
  });

  it('drops an annotation that has no usable url', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      choices: [
        {
          message: {
            annotations: [
              { type: 'url_citation', url_citation: { title: 'No url' } },
              { type: 'url_citation', url_citation: { url: 'https://example.com/valid', title: 'Valid' } },
            ],
          },
        },
      ],
    })));

    const client = new OpenAIClient({ provider: 'openai', apiKey: 'k', model: 'gpt-4o-search-preview' });
    const results = await client.webSearch('query');
    expect(results).toEqual([{ title: 'Valid', url: 'https://example.com/valid', snippet: '' }]);
  });
});

describe('OpenRouterClient web search', () => {
  it('supports web search regardless of the routed model', () => {
    const client = new OpenRouterClient({ provider: 'openrouter', apiKey: 'k', model: 'anthropic/claude-3.5-sonnet' });
    expect(client.supportsWebSearch()).toBe(true);
  });

  it('requests the :online model suffix and parses annotations into SearchResult[]', async () => {
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
    const results = await client.webSearch('query');

    expect(results).toEqual([{ title: 'OR Source', url: 'https://example.com/or-source', snippet: 'Excerpt.' }]);
    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const requestBody = JSON.parse(requestInit.body as string);
    expect(requestBody.model).toBe('anthropic/claude-3.5-sonnet:online');
    expect(requestBody.web_search_options).toBeUndefined();
  });

  it('yields no results, without throwing, when annotations are absent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      choices: [{ message: { content: 'No citations.' } }],
    })));

    const client = new OpenRouterClient({ provider: 'openrouter', apiKey: 'k', model: 'anthropic/claude-3.5-sonnet' });
    await expect(client.webSearch('query')).resolves.toEqual([]);
  });
});
