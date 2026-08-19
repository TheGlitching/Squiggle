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
      'HTTP-Referer': 'https://github.com/fourches-caudines',
      'X-Title': 'Fourches Caudines Extension',
      ...this.config.customHeaders,
    };
  }
}
