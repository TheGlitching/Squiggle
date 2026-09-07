
export type LLMProvider = 'anthropic' | 'openai' | 'openrouter' | 'gemini';

export interface ProviderConfig {
  provider: LLMProvider;
  apiKey: string;
  model: string;
  baseUrl?: string;
  customHeaders?: Record<string, string>;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionOptions {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  jsonSchema?: Record<string, unknown>;
  systemPrompt?: string;
  abortSignal?: AbortSignal;
}

export interface StreamCallbacks {
  onChunk: (delta: string) => void;
  onError?: (error: Error) => void;
  onComplete?: (fullText: string) => void;
}

export interface CompletionResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  provider: LLMProvider;
  raw?: unknown;
}

export interface ProviderErrorDetails {
  provider: LLMProvider;
  statusCode?: number;
  message: string;
  code?: string;
  raw?: unknown;
}

export class BYOKError extends Error {
  public readonly provider: LLMProvider;
  public readonly statusCode?: number;
  public readonly code?: string;
  public readonly raw?: unknown;

  constructor(details: ProviderErrorDetails) {
    super(`[BYOK - ${details.provider}] ${details.message}`);
    this.name = 'BYOKError';
    this.provider = details.provider;
    this.statusCode = details.statusCode;
    this.code = details.code;
    this.raw = details.raw;
  }
}

export interface EncryptedPayload {
  cipherText: string; // Base64
  iv: string;         // Base64
  salt: string;       // Base64
  version: number;
}
