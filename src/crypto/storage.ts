import type { EncryptedPayload, LLMProvider, ProviderConfig } from '../types/byok';
import { decryptSecret, encryptSecret } from './crypto';

export interface StoredProviderSettings {
  provider: LLMProvider;
  model: string;
  baseUrl?: string;
  encryptedApiKey?: EncryptedPayload;
  customHeaders?: Record<string, string>;
}

export interface KeyStorageSchema {
  providers: Partial<Record<LLMProvider, StoredProviderSettings>>;
  activeProvider: LLMProvider;
}

const STORAGE_KEY = 'fourches_caudines_byok_config';
const DEFAULT_SALT_FALLBACK_KEY = 'fc_master_salt_passphrase';

// Fallback seed when no user master password is provided (e.g. extension local storage level)
function getDevicePassphrase(): string {
  // In extension background/sidepanel context, we generate or use an internal seed
  let seed = localStorage?.getItem(DEFAULT_SALT_FALLBACK_KEY);
  if (!seed) {
    seed = 'fc_device_token_' + (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36));
    try {
      localStorage?.setItem(DEFAULT_SALT_FALLBACK_KEY, seed);
    } catch {
      // Ignore if localStorage unavailable in some contexts
    }
  }
  return seed;
}

export class SecureKeyStorage {
  private masterPassphrase?: string;

  constructor(masterPassphrase?: string) {
    this.masterPassphrase = masterPassphrase;
  }

  private getPassphrase(): string {
    return this.masterPassphrase || getDevicePassphrase();
  }

  /**
   * Save provider configuration with encrypted API key
   */
  public async saveProviderConfig(config: ProviderConfig): Promise<void> {
    const rawStorage = await this.loadAll();
    const passphrase = this.getPassphrase();

    let encryptedApiKey: EncryptedPayload | undefined;
    if (config.apiKey) {
      encryptedApiKey = await encryptSecret(config.apiKey, passphrase);
    }

    rawStorage.providers[config.provider] = {
      provider: config.provider,
      model: config.model,
      baseUrl: config.baseUrl,
      customHeaders: config.customHeaders,
      encryptedApiKey,
    };

    await this.persist(rawStorage);
  }

  /**
   * Get decrypted provider configuration
   */
  public async getProviderConfig(provider: LLMProvider): Promise<ProviderConfig | null> {
    const rawStorage = await this.loadAll();
    const stored = rawStorage.providers[provider];
    if (!stored) return null;

    let apiKey = '';
    if (stored.encryptedApiKey) {
      const passphrase = this.getPassphrase();
      apiKey = await decryptSecret(stored.encryptedApiKey, passphrase);
    }

    return {
      provider: stored.provider,
      apiKey,
      model: stored.model,
      baseUrl: stored.baseUrl,
      customHeaders: stored.customHeaders,
    };
  }

  /**
   * Set active provider
   */
  public async setActiveProvider(provider: LLMProvider): Promise<void> {
    const rawStorage = await this.loadAll();
    rawStorage.activeProvider = provider;
    await this.persist(rawStorage);
  }

  /**
   * Get active provider
   */
  public async getActiveProvider(): Promise<LLMProvider> {
    const rawStorage = await this.loadAll();
    return rawStorage.activeProvider || 'anthropic';
  }

  /**
   * Delete provider configuration
   */
  public async removeProvider(provider: LLMProvider): Promise<void> {
    const rawStorage = await this.loadAll();
    delete rawStorage.providers[provider];
    await this.persist(rawStorage);
  }

  private async loadAll(): Promise<KeyStorageSchema> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const data = await chrome.storage.local.get([STORAGE_KEY]);
        if (data[STORAGE_KEY]) {
          return data[STORAGE_KEY] as KeyStorageSchema;
        }
      } else if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          return JSON.parse(raw) as KeyStorageSchema;
        }
      }
    } catch (e) {
      console.warn('Could not read from storage:', e);
    }

    return {
      providers: {},
      activeProvider: 'anthropic',
    };
  }

  private async persist(data: KeyStorageSchema): Promise<void> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        await chrome.storage.local.set({ [STORAGE_KEY]: data });
      } else if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      }
    } catch (e) {
      console.error('Could not save to storage:', e);
      throw e;
    }
  }
}
