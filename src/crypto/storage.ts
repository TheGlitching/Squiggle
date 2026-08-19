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

/**
 * A key is stored but cannot be decrypted in this context, so the user must
 * enter it again. Distinct from "no key configured": the two need different
 * messages, and only one of them is something the user did.
 */
export class UnreadableKeyError extends Error {
  public readonly provider: LLMProvider;
  constructor(provider: LLMProvider, options?: { cause?: unknown }) {
    super(`Stored key for ${provider} could not be decrypted`, options);
    this.name = 'UnreadableKeyError';
    this.provider = provider;
  }
}

const STORAGE_KEY = 'squiggle_byok_config';
const DEVICE_SEED_KEY = 'squiggle_device_seed';
/** Where the seed used to live, back when only the panel could read it. */
const LEGACY_SEED_KEY = 'fc_master_salt_passphrase';

/** `chrome.storage.local`, or undefined outside an extension context. */
function extensionStore(): chrome.storage.LocalStorageArea | undefined {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    return chrome.storage.local;
  }
  return undefined;
}

function newSeed(): string {
  const random =
    typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36);
  return `squiggle_device_${random}`;
}

/**
 * Read from `localStorage` where it exists and behaves. A service worker has no
 * such binding, and some embedders expose a partial object, so treat every read
 * as best effort: this store only ever holds a legacy value to migrate, and
 * failing to find it must never block saving a key.
 */
function readLocal(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') {
      return null;
    }
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string): void {
  try {
    if (typeof localStorage === 'undefined' || typeof localStorage.setItem !== 'function') return;
    localStorage.setItem(key, value);
  } catch {
    // Storage disabled or full; the caller still gets a usable seed in memory.
  }
}

/**
 * The seed that encrypts a stored key when the user sets no master password.
 *
 * It must be identical in every extension context: the key is entered in the
 * panel document and read back by the background service worker. `localStorage`
 * cannot carry it, because a service worker has no such binding at all - the
 * bare identifier throws a ReferenceError there, which is why a saved key used
 * to be permanently undecryptable in the background. Extension storage is the
 * only store both contexts share.
 *
 * Only the save path may create a seed. A reader that minted its own would
 * overwrite the one its stored key was encrypted under, turning a recoverable
 * mismatch into permanent loss, so readers get null and must say so.
 */
async function getDevicePassphrase(options: { create: boolean }): Promise<string | null> {
  const store = extensionStore();
  if (!store) {
    // Plain page or test environment; scope the seed to whatever store exists.
    const existing = readLocal(DEVICE_SEED_KEY);
    if (existing) return existing;
    if (!options.create) return null;
    const seed = newSeed();
    writeLocal(DEVICE_SEED_KEY, seed);
    return seed;
  }

  const stored = await store.get([DEVICE_SEED_KEY]);
  const existing = stored[DEVICE_SEED_KEY];
  if (typeof existing === 'string' && existing) return existing;

  // Adopt a seed left in the panel's localStorage by an older build, so a key
  // saved before this fix keeps working. Worth doing even on the read path:
  // adopting preserves an existing key, where minting would destroy it.
  const legacy = readLocal(LEGACY_SEED_KEY);
  const seed = legacy ?? (options.create ? newSeed() : null);
  if (!seed) return null;

  await store.set({ [DEVICE_SEED_KEY]: seed });

  // Re-read rather than trusting the local value: if another context stored a
  // seed concurrently, the stored one is the only value that can decrypt keys.
  const confirmed = await store.get([DEVICE_SEED_KEY]);
  const value = confirmed[DEVICE_SEED_KEY];
  return typeof value === 'string' ? value : null;
}

export class SecureKeyStorage {
  private masterPassphrase?: string;

  constructor(masterPassphrase?: string) {
    this.masterPassphrase = masterPassphrase;
  }

  /** Saving may mint a seed; reading must not. See getDevicePassphrase. */
  private async getPassphrase(options: { create: boolean }): Promise<string | null> {
    return this.masterPassphrase || (await getDevicePassphrase(options));
  }

  /**
   * Save provider configuration with encrypted API key
   */
  public async saveProviderConfig(config: ProviderConfig): Promise<void> {
    const rawStorage = await this.loadAll();
    const passphrase = await this.getPassphrase({ create: true });
    if (!passphrase) throw new Error('No passphrase available to encrypt the key');

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
      const passphrase = await this.getPassphrase({ create: false });
      if (!passphrase) throw new UnreadableKeyError(stored.provider);
      try {
        apiKey = await decryptSecret(stored.encryptedApiKey, passphrase);
      } catch (cause) {
        // The stored key was encrypted under a different seed and is now
        // unreadable. Returning an empty key here would look exactly like
        // "no key configured" and send the caller down a fallback path, so
        // report it as what it is: a key that must be entered again.
        throw new UnreadableKeyError(stored.provider, { cause });
      }
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
