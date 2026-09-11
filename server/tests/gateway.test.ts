/**
 * The provider gateway.
 *
 * Hosted analyses used to be hard-wired to Gemini. They now run on whichever
 * provider the deployment configures, so these tests pin the two things that
 * makes safe: OpenRouter is the default and carries the exact catalogue model
 * id, and a provider whose key is missing leaves the client unset (the analyze
 * route's refusal) rather than silently picking a provider or throwing later.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GeminiClient,
  OpenRouterClient,
  researchFindings,
  type Finding,
} from '@squiggle/shared';

import { createHostedLlm, DEFAULT_OPENROUTER_MODEL } from '../src/index';

describe('createHostedLlm', () => {
  it('defaults to OpenRouter on the DeepSeek v4.1 Flash catalogue id', () => {
    const client = createHostedLlm({ OPENROUTER_API_KEY: 'test-key' });
    expect(client).toBeInstanceOf(OpenRouterClient);
    expect(client!.getProvider()).toBe('openrouter');
    // The id is exact and tilde-free: OpenRouter rejects anything else.
    expect(client!.getModel()).toBe('deepseek/deepseek-v4.1-flash');
    expect(DEFAULT_OPENROUTER_MODEL).toBe('deepseek/deepseek-v4.1-flash');
  });

  it('lets the deployment name both the provider and the model', () => {
    const client = createHostedLlm({
      LLM_PROVIDER: 'openrouter',
      OPENROUTER_API_KEY: 'test-key',
      OPENROUTER_MODEL: 'vendor/other-model',
    });
    expect(client!.getModel()).toBe('vendor/other-model');
  });

  it('keeps gemini selectable', () => {
    const client = createHostedLlm({ LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'k', GEMINI_MODEL: 'gemini-2.5-pro' });
    expect(client).toBeInstanceOf(GeminiClient);
    expect(client!.getProvider()).toBe('gemini');
    expect(client!.getModel()).toBe('gemini-2.5-pro');
  });

  it('leaves the client unset when the selected provider has no key', () => {
    expect(createHostedLlm({})).toBeUndefined();
    expect(createHostedLlm({ OPENROUTER_MODEL: 'vendor/model' })).toBeUndefined();
    expect(createHostedLlm({ LLM_PROVIDER: 'gemini' })).toBeUndefined();
  });

  it('never silently falls back to a provider the deployment did not choose', () => {
    // An unknown provider is a misconfiguration, and the configured key for a
    // different provider must not be spent on it.
    expect(
      createHostedLlm({ LLM_PROVIDER: 'someone-else', OPENROUTER_API_KEY: 'k', GEMINI_API_KEY: 'k' }),
    ).toBeUndefined();
  });
});

describe('the research stage on OpenRouter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('judges a factual finding through the Parallel web_search server tool', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                verification: 'verifiee',
                sources: [{ title: 'Insee', url: 'https://insee.example/chomage', origin: 'search' }],
                rationale: 'La statistique publique confirme.',
              }),
              annotations: [
                {
                  type: 'url_citation',
                  url_citation: {
                    url: 'https://insee.example/chomage',
                    title: 'Insee',
                    content: 'baisse de 12 %',
                  },
                },
              ],
            },
          },
        ],
      }),
      text: async () => '',
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    const client = new OpenRouterClient({
      provider: 'openrouter',
      apiKey: 'test-key',
      model: DEFAULT_OPENROUTER_MODEL,
    });

    const finding: Finding = {
      id: 'f1',
      blockId: 'b1',
      quote: 'Le chômage a baissé de 12 % en un an.',
      category: 'affirmation-non-etayee',
      severity: 2,
      label: 'Chiffre non étayé',
      explanation: 'Aucune source.',
      confidence: 0.9,
    };

    const result = await researchFindings({
      client,
      input: { url: 'https://presse.example/a', title: 'T', language: 'fr', blocks: [] },
      findings: [finding],
      citedSources: [],
      now: new Date('2026-01-01T00:00:00Z'),
    });

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(requestInit.body as string);
    // OpenRouter searches via the web_search server tool, not a model suffix.
    expect(body.model).toBe(DEFAULT_OPENROUTER_MODEL);
    expect(body.model).not.toContain(':online');
    expect(body.tools).toEqual([
      {
        type: 'openrouter:web_search',
        parameters: { engine: 'parallel', mode: 'basic', max_results: 5 },
      },
    ]);
    expect(body.web_search_options).toBeUndefined();

    expect(result.claims[0]?.verification).toBe('verifiee');
    expect(result.claims[0]?.sources[0]?.url).toBe('https://insee.example/chomage');
  });
});
