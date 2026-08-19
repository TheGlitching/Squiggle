import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SecureKeyStorage, UnreadableKeyError } from '../src/crypto/storage';
import { AnalysisPipeline, MissingProviderError } from '../src/engine/pipeline';

/**
 * The key is entered in the panel (a document, which has `localStorage`) and read
 * back by the background service worker (which has no such binding at all).
 * Anything context-local in that path makes a saved key permanently unreadable
 * where it is actually needed.
 */
describe('key storage across extension contexts', () => {
  /** The one store both contexts genuinely share. */
  let shared: Record<string, unknown>;
  const realLocalStorage = globalThis.localStorage;

  const installChrome = () => {
    (globalThis as unknown as { chrome: unknown }).chrome = {
      storage: {
        local: {
          get: async (keys: string[]) => {
            const out: Record<string, unknown> = {};
            for (const k of keys) if (k in shared) out[k] = shared[k];
            return out;
          },
          set: async (items: Record<string, unknown>) => {
            Object.assign(shared, items);
          },
        },
      },
    };
  };

  /** A document context: localStorage exists. */
  const asPanel = () => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    });
    return store;
  };

  /** A service worker: the identifier is not defined, so reads throw. */
  const asServiceWorker = () => {
    Reflect.deleteProperty(globalThis, 'localStorage');
    expect(() => (globalThis as unknown as { localStorage: unknown }).localStorage).not.toThrow();
    // Direct identifier access is what the old code did, and what threw.
    expect(() => eval('localStorage')).toThrow(ReferenceError);
  };

  beforeEach(() => {
    shared = {};
    installChrome();
  });

  afterEach(() => {
    if (realLocalStorage) {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: realLocalStorage,
      });
    }
  });

  it('reads a key in the worker that the panel saved', async () => {
    asPanel();
    await new SecureKeyStorage().saveProviderConfig({
      provider: 'anthropic',
      apiKey: 'sk-ant-secret',
      model: 'claude-sonnet-4',
    });

    asServiceWorker();
    const config = await new SecureKeyStorage().getProviderConfig('anthropic');

    expect(config?.apiKey).toBe('sk-ant-secret');
  });

  it('adopts a seed left in the panel by an older build', async () => {
    // An older build encrypted the key under a seed it kept in localStorage only.
    const panelStore = asPanel();
    await new SecureKeyStorage().saveProviderConfig({
      provider: 'anthropic',
      apiKey: 'sk-ant-legacy',
      model: 'claude-sonnet-4',
    });
    const seed = shared['squiggle_device_seed'] as string;
    delete shared['squiggle_device_seed'];
    panelStore.set('fc_master_salt_passphrase', seed);

    // Opening the panel migrates it, so the key keeps working.
    const config = await new SecureKeyStorage().getProviderConfig('anthropic');
    expect(config?.apiKey).toBe('sk-ant-legacy');
    expect(shared['squiggle_device_seed']).toBe(seed);
  });

  it('never mints a seed on the read path, so a recoverable key is not destroyed', async () => {
    const panelStore = asPanel();
    await new SecureKeyStorage().saveProviderConfig({
      provider: 'anthropic',
      apiKey: 'sk-ant-recoverable',
      model: 'claude-sonnet-4',
    });
    const seed = shared['squiggle_device_seed'] as string;
    delete shared['squiggle_device_seed'];
    panelStore.set('fc_master_salt_passphrase', seed);

    // The worker reads first and cannot see the legacy seed.
    asServiceWorker();
    await expect(new SecureKeyStorage().getProviderConfig('anthropic')).rejects.toBeInstanceOf(
      UnreadableKeyError
    );
    // Crucially it stored nothing, so the panel can still recover the key.
    expect(shared['squiggle_device_seed']).toBeUndefined();

    const recovered = asPanel();
    recovered.set('fc_master_salt_passphrase', seed);
    const config = await new SecureKeyStorage().getProviderConfig('anthropic');
    expect(config?.apiKey).toBe('sk-ant-recoverable');
  });

  it('reports an undecryptable key instead of reporting no key', async () => {
    asPanel();
    await new SecureKeyStorage().saveProviderConfig({
      provider: 'anthropic',
      apiKey: 'sk-ant-secret',
      model: 'claude-sonnet-4',
    });
    shared['squiggle_device_seed'] = 'a-different-seed-entirely';

    await expect(new SecureKeyStorage().getProviderConfig('anthropic')).rejects.toBeInstanceOf(
      UnreadableKeyError
    );
  });
});

describe('analysis without a provider', () => {
  it('refuses rather than returning the sample report', async () => {
    const pipeline = new AnalysisPipeline();
    await expect(pipeline.analyze({ text: 'Un article réel.', title: 'Réel' })).rejects.toBeInstanceOf(
      MissingProviderError
    );
  });

  it('labels the sample report as a sample when explicitly requested', async () => {
    const report = await new AnalysisPipeline({ demoMode: true }).analyze({
      text: 'Un article réel.',
      title: 'Réel',
    });

    expect(report.meta.model).toContain('démonstration');
  });
});
