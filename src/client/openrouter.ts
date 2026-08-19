import { OpenAIClient } from './openai';

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
   * Web search on OpenRouter is a `:online` model suffix rather than a
   * per-model capability, so every routed model can search, unlike the
   * bare OpenAI provider it extends.
   */
  override supportsWebSearch(): boolean {
    return true;
  }

  protected override resolveWebSearchModel(): string {
    const model = this.config.model || this.defaultModel;
    return model.endsWith(':online') ? model : `${model}:online`;
  }

  protected override buildWebSearchExtras(): Record<string, unknown> {
    return {};
  }
}
