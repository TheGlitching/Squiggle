import { OpenAIClient } from './openai';

/**
 * A model as the OpenRouter catalogue actually advertises it. The id is kept
 * verbatim because OpenRouter's ids are not predictable - its "latest" alias
 * for DeepSeek V4 Flash is literally `~deepseek/deepseek-v4-flash-latest`,
 * tilde and all - and the API rejects anything that is not exactly right.
 */
export interface OpenRouterModel {
  id: string;
  name: string;
  /** The org segment before the first `/`, for grouping in a picker. */
  author: string;
}

export const OPENROUTER_CATALOG_URL = 'https://openrouter.ai/api/v1/models';

/**
 * The single seam for OpenRouter's `openrouter:web_search` server tool. Parallel
 * `basic` is the default because it has broad language support (French
 * included) at $0.005/request, versus the $0.007 Exa fallback the deprecated
 * `:online` suffix selected. A later French-source quality spike can switch
 * `mode` to `turbo` ($0.001, English/Japanese only) here, in one place.
 */
export const OPENROUTER_WEB_SEARCH = {
  engine: 'parallel',
  mode: 'basic',
  maxResults: 5,
} as const;

/**
 * Fetches OpenRouter's live model catalogue, public and keyless. The picker's
 * curent static preset rot - its note says it plainly: a closed list is a list
 * of models nobody can select - so this returns exactly what the API exposes,
 * including id aliases. Any failure (network, non-200, malformed payload)
 * resolves to `[]` so the caller keeps its static preset instead of erroring
 * out of the modal.
 */
export async function listOpenRouterModels(
  fetchImpl: typeof fetch = fetch
): Promise<OpenRouterModel[]> {
  try {
    const response = await fetchImpl(OPENROUTER_CATALOG_URL, {
      headers: { accept: 'application/json' }
    });
    if (!response.ok) return [];

    const payload = (await response.json()) as { data?: unknown };
    if (!Array.isArray(payload.data)) return [];

    const models: OpenRouterModel[] = [];
    for (const item of payload.data) {
      if (typeof item !== 'object' || item === null) continue;
      const id = (item as { id?: unknown }).id;
      if (typeof id !== 'string' || id.length === 0) continue;
      const slash = id.indexOf('/');
      const author = slash > 0 ? id.slice(0, slash).replace(/^[^a-zA-Z0-9]+/, '') : 'autre';
      const name = typeof (item as { name?: unknown }).name === 'string' ? (item as { name: string }).name : id;
      models.push({ id, name, author });
    }
    return models;
  } catch {
    return [];
  }
}

export class OpenRouterClient extends OpenAIClient {
  protected override get defaultBaseUrl(): string {
    return 'https://openrouter.ai/api/v1';
  }

  protected override get defaultModel(): string {
    return 'anthropic/claude-3.5-sonnet';
  }

  protected override get providerName(): 'openai' | 'openrouter' {
    return 'openrouter';
  }

  protected override getHeaders(): Record<string, string> {
    return {
      'content-type': 'application/json',
      Authorization: `Bearer ${this.config.apiKey}`,
      'HTTP-Referer': 'https://github.com/TheGlitching/Squiggle',
      'X-Title': 'Squiggle',
      ...this.config.customHeaders,
    };
  }

  /**
   * Web search on OpenRouter is a server tool rather than a per-model
   * capability, so every routed model can search, unlike the bare OpenAI
   * provider it extends.
   */
  override supportsWebSearch(): boolean {
    return true;
  }

  /**
   * The plain model id. Search is requested through the
   * `openrouter:web_search` server tool instead of the deprecated `:online`
   * suffix, which silently fell back to Exa for models like DeepSeek with no
   * native search.
   */
  protected override resolveWebSearchModel(): string {
    return this.config.model || this.defaultModel;
  }

  protected override buildWebSearchExtras(): Record<string, unknown> {
    return {
      tools: [
        {
          type: 'openrouter:web_search',
          parameters: {
            engine: OPENROUTER_WEB_SEARCH.engine,
            mode: OPENROUTER_WEB_SEARCH.mode,
            max_results: OPENROUTER_WEB_SEARCH.maxResults,
          },
        },
      ],
    };
  }
}
