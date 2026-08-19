import type {
  ChatMessage,
  CompletionOptions,
  CompletionResponse,
  ProviderConfig,
  StreamCallbacks,
} from '../types/byok';

export abstract class BaseLLMClient {
  protected config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  abstract complete(options: CompletionOptions): Promise<CompletionResponse>;
  abstract stream(options: CompletionOptions, callbacks: StreamCallbacks): Promise<CompletionResponse>;

  protected formatSystemAndUserMessages(options: CompletionOptions): { system?: string; messages: ChatMessage[] } {
    let system = options.systemPrompt;
    const remainingMessages: ChatMessage[] = [];

    for (const msg of options.messages) {
      if (msg.role === 'system' && !system) {
        system = msg.content;
      } else {
        remainingMessages.push(msg);
      }
    }

    return { system, messages: remainingMessages };
  }
}
