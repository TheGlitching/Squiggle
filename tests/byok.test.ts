import { describe, it, expect, vi } from 'vitest';
import { encryptSecret, decryptSecret } from '../src/crypto/crypto';
import { SecureKeyStorage } from '../src/crypto/storage';
import { createLLMClient } from '../src/client/factory';
import { AnthropicClient } from '../src/client/anthropic';
import { OpenAIClient } from '../src/client/openai';
import { GeminiClient } from '../src/client/gemini';
import { OpenRouterClient } from '../src/client/openrouter';

describe('BYOK Crypto & Storage', () => {
  const testPassphrase = 'secure-master-password-123';
  const testSecret = 'sk-ant-api03-test-token-value';

  it('should encrypt and decrypt secret using AES-GCM and PBKDF2', async () => {
    const encrypted = await encryptSecret(testSecret, testPassphrase);
    expect(encrypted.cipherText).toBeDefined();
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.salt).toBeDefined();
    expect(encrypted.version).toBe(1);

    const decrypted = await decryptSecret(encrypted, testPassphrase);
    expect(decrypted).toBe(testSecret);
  });

  it('should fail decryption with wrong passphrase', async () => {
    const encrypted = await encryptSecret(testSecret, testPassphrase);
    await expect(decryptSecret(encrypted, 'wrong-password')).rejects.toThrow();
  });

  it('should manage provider storage with encrypted keys', async () => {
    const storageMap: Record<string, string> = {};
    const mockLocalStorage = {
      getItem: (k: string) => storageMap[k] || null,
      setItem: (k: string, v: string) => { storageMap[k] = v; },
      removeItem: (k: string) => { delete storageMap[k]; },
      clear: () => {},
    };
    vi.stubGlobal('localStorage', mockLocalStorage);

    const storage = new SecureKeyStorage(testPassphrase);
    await storage.saveProviderConfig({
      provider: 'anthropic',
      apiKey: 'sk-ant-test-key',
      model: 'claude-3-5-sonnet-20241022',
    });

    const retrieved = await storage.getProviderConfig('anthropic');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.apiKey).toBe('sk-ant-test-key');
    expect(retrieved?.model).toBe('claude-3-5-sonnet-20241022');
  });
});

describe('BYOK Factory and Clients', () => {
  it('should instantiate appropriate clients via factory', () => {
    const anthropic = createLLMClient({ provider: 'anthropic', apiKey: 'test', model: 'claude-3-5-sonnet' });
    expect(anthropic).toBeInstanceOf(AnthropicClient);

    const openai = createLLMClient({ provider: 'openai', apiKey: 'test', model: 'gpt-4o' });
    expect(openai).toBeInstanceOf(OpenAIClient);

    const openrouter = createLLMClient({ provider: 'openrouter', apiKey: 'test', model: 'anthropic/claude-3.5-sonnet' });
    expect(openrouter).toBeInstanceOf(OpenRouterClient);

    const gemini = createLLMClient({ provider: 'gemini', apiKey: 'test', model: 'gemini-1.5-pro' });
    expect(gemini).toBeInstanceOf(GeminiClient);
  });
});
