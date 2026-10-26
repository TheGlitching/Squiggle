
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

export const PROVIDER_LABELS: Record<LLMProvider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
  gemini: 'Google Gemini',
};

/**
 * What a failed call means for the reader, whatever words the provider used:
 * each provider spells "bad key" or "out of credit" differently, and Gemini
 * even reports a bad key as a 400.
 */
export type ProviderErrorKind = 'auth' | 'model' | 'quota' | 'unavailable' | 'other';

const KIND_SUMMARIES: Record<Exclude<ProviderErrorKind, 'other'>, string> = {
  auth: 'clé refusée',
  model: 'modèle inconnu ou inaccessible avec cette clé',
  quota: 'quota, crédit ou limite de débit atteint',
  unavailable: 'service momentanément indisponible',
};

export interface ProviderErrorDetails {
  provider: LLMProvider;
  statusCode?: number;
  message: string;
  code?: string;
  kind?: ProviderErrorKind;
  raw?: unknown;
}

export class BYOKError extends Error {
  public readonly provider: LLMProvider;
  public readonly statusCode?: number;
  public readonly code?: string;
  public readonly kind: ProviderErrorKind;
  public readonly raw?: unknown;

  constructor(details: ProviderErrorDetails) {
    const kind = details.kind ?? 'other';
    const label = PROVIDER_LABELS[details.provider] ?? details.provider;
    // The provider's own words stay in the message: they name the model or
    // the limit, which no summary can.
    super(
      kind === 'other'
        ? `${label} : ${details.message}`
        : `${label} : ${KIND_SUMMARIES[kind]} (${details.message})`
    );
    this.name = 'BYOKError';
    this.provider = details.provider;
    this.statusCode = details.statusCode;
    this.code = details.code;
    this.kind = kind;
    this.raw = details.raw;
  }
}

export interface EncryptedPayload {
  cipherText: string; // Base64
  iv: string;         // Base64
  salt: string;       // Base64
  version: number;
}
