import { BaseLLMClient } from './base';
import { AnthropicClient } from './anthropic';
import { OpenAIClient } from './openai';
import { OpenRouterClient } from './openrouter';
import { GeminiClient } from './gemini';
import type { ProviderConfig } from '../types/byok';

export function createLLMClient(config: ProviderConfig): BaseLLMClient {
  switch (config.provider) {
    case 'anthropic':
      return new AnthropicClient(config);
    case 'openai':
      return new OpenAIClient(config);
    case 'openrouter':
      return new OpenRouterClient(config);
    case 'gemini':
      return new GeminiClient(config);
    default:
      throw new Error(`Unsupported LLM provider: ${(config as { provider: string }).provider}`);
  }
}

export {
  BaseLLMClient,
  AnthropicClient,
  OpenAIClient,
  OpenRouterClient,
  GeminiClient,
};
export const LLMClientFactory = {
  createClient: createLLMClient,
};
