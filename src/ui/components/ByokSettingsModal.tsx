import React, { useCallback, useEffect, useState } from 'react';
import { SecureKeyStorage, type AnalysisMode } from '../../crypto/storage';
import { createLLMClient } from '../../client/factory';
import type { LLMProvider, ProviderConfig } from '@squiggle/shared';
import { HostedAccountCard } from './HostedAccountCard';
import {
  beginHostedSignIn,
  fetchHostedAccount,
  HostedAuthError,
  redeemHostedCode,
  signOutHosted,
  type HostedAccount,
} from '../../hosted/session';
import { TRANSPARENCY_URL } from '../../hosted/config';

/**
 * Analysis-engine configuration.
 *
 * Hosted mode leads: the reader can be analysing in two taps without owning a
 * key, and that is the product. BYOK is still fully supported, but it is the
 * advanced path and lives behind a collapsed disclosure underneath.
 */

interface ProviderPreset {
  id: LLMProvider;
  label: string;
  /** A greyed example of the id shape this provider expects. */
  modelPlaceholder: string;
  keyHint: string;
  keyUrl: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    modelPlaceholder: 'claude-sonnet-4-20250514',
    keyHint: 'sk-ant-...',
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    modelPlaceholder: 'gpt-4o',
    keyHint: 'sk-...',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    modelPlaceholder: 'deepseek/deepseek-v4.1-flash',
    keyHint: 'sk-or-...',
    keyUrl: 'https://openrouter.ai/keys',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    modelPlaceholder: 'gemini-2.5-flash',
    keyHint: 'AIza...',
    keyUrl: 'https://aistudio.google.com/apikey',
  },
];

type ValidationState =
  | { kind: 'idle' }
  | { kind: 'validating' }
  | { kind: 'valid'; message: string }
  | { kind: 'invalid'; message: string };

export interface ByokSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (provider: LLMProvider) => void;
  /** Fired when the mode or the hosted session changes, so the panel refreshes. */
  onHostedChanged?: () => void;
  storage?: SecureKeyStorage;
}

export const ByokSettingsModal: React.FC<ByokSettingsModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  onHostedChanged,
  storage,
}) => {
  const [keyStorage] = useState(() => storage ?? new SecureKeyStorage());
  const [provider, setProvider] = useState<LLMProvider>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [validation, setValidation] = useState<ValidationState>({ kind: 'idle' });
  const [isSaving, setIsSaving] = useState(false);
  /** Which engine analyses run through; hosted has its own state below. */
  const [mode, setMode] = useState<AnalysisMode>('byok');
  const [hostedAccount, setHostedAccount] = useState<HostedAccount | null>(null);
  const [hostedError, setHostedError] = useState<string | null>(null);
  const [hostedBusy, setHostedBusy] = useState(false);
  const [showCode, setShowCode] = useState(false);

  const preset = PROVIDER_PRESETS.find((p) => p.id === provider) ?? PROVIDER_PRESETS[0];

  /**
   * Read the hosted account, if any. A missing sign-in is a normal state, not
   * an error; any other failure (network, expired token) is surfaced.
   */
  const refreshHosted = useCallback(async () => {
    try {
      setHostedAccount(await fetchHostedAccount(keyStorage));
      setHostedError(null);
    } catch (err) {
      setHostedAccount(null);
      if (err instanceof HostedAuthError && err.code !== 'not_signed_in') {
        setHostedError(err.message);
      }
    }
  }, [keyStorage]);

  // Load whatever is already configured whenever the modal opens. The hosted
  // account is always read, not only in hosted mode, because its card leads the
  // sheet and must state the truth in either mode.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    (async () => {
      try {
        const active = await keyStorage.getActiveProvider();
        const config = await keyStorage.getProviderConfig(active);
        if (cancelled) return;
        setProvider(active);
        setHasStoredKey(Boolean(config?.apiKey));
        setApiKey('');
        setModel(config?.model ?? '');
        setValidation({ kind: 'idle' });
      } catch {
        // First run: nothing stored yet.
      }

      try {
        const activeMode = await keyStorage.getMode();
        if (cancelled) return;
        setMode(activeMode);
        setHostedError(null);
        setShowCode(false);
      } catch {
        // The mode read failed; BYOK stays selected.
      }
      if (!cancelled) await refreshHosted();
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, keyStorage, refreshHosted]);

  const handleProviderChange = useCallback(
    async (next: LLMProvider) => {
      setProvider(next);
      setValidation({ kind: 'idle' });
      setApiKey('');
      try {
        const existing = await keyStorage.getProviderConfig(next);
        setHasStoredKey(Boolean(existing?.apiKey));
        setModel(existing?.model ?? '');
      } catch {
        setHasStoredKey(false);
        setModel('');
      }
    },
    [keyStorage]
  );

  /**
   * Live validation issues the cheapest possible real completion. A provider
   * only counts as reachable if it actually answers, so a typo or a revoked key
   * is caught here rather than mid-analysis.
   */
  const handleValidate = useCallback(async () => {
    const candidateKey = apiKey.trim();
    if (!candidateKey) {
      setValidation({ kind: 'invalid', message: 'Renseignez une clé avant de la tester.' });
      return;
    }
    if (!model.trim()) {
      setValidation({ kind: 'invalid', message: 'Renseignez l’identifiant du modèle.' });
      return;
    }

    setValidation({ kind: 'validating' });
    try {
      const client = createLLMClient({ provider, apiKey: candidateKey, model: model.trim() });
      const response = await client.complete({
        messages: [{ role: 'user', content: 'Réponds exactement: OK' }],
        maxTokens: 8,
        temperature: 0,
      });
      const reply = (response.content || '').trim();
      setValidation({
        kind: 'valid',
        message: reply ? `Connexion établie (${model.trim()}).` : 'Connexion établie.',
      });
    } catch (err: unknown) {
      setValidation({
        kind: 'invalid',
        message: err instanceof Error ? err.message : 'Clé refusée par le fournisseur.',
      });
    }
  }, [apiKey, model, provider]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      // Saving the BYOK config makes it the chosen engine.
      const trimmedKey = apiKey.trim();
      let key = trimmedKey;
      if (!key && hasStoredKey) {
        // Editing the model without retyping the key must still persist, so
        // re-read the stored plaintext and save it back beside the new model.
        key = (await keyStorage.getProviderConfig(provider))?.apiKey ?? '';
      }
      if (key) {
        const config: ProviderConfig = { provider, apiKey: key, model: model.trim() };
        await keyStorage.saveProviderConfig(config);
      }
      await keyStorage.setActiveProvider(provider);
      await keyStorage.setMode('byok');
      onSaved?.(provider);
      onHostedChanged?.();
      onClose();
    } catch (err: unknown) {
      setValidation({
        kind: 'invalid',
        message: err instanceof Error ? err.message : 'Échec de l’enregistrement.',
      });
    } finally {
      setIsSaving(false);
    }
  }, [apiKey, hasStoredKey, keyStorage, model, onClose, onHostedChanged, onSaved, provider]);

  const handleRemove = useCallback(async () => {
    await keyStorage.removeProvider(provider);
    setHasStoredKey(false);
    setApiKey('');
    setValidation({ kind: 'idle' });
  }, [keyStorage, provider]);

  const handleUseHosted = useCallback(async () => {
    setMode('hosted');
    try {
      await keyStorage.setMode('hosted');
    } catch {
      setHostedError('Impossible d’enregistrer votre choix.');
    }
    await refreshHosted();
    onHostedChanged?.();
  }, [keyStorage, refreshHosted, onHostedChanged]);

  const handleHostedSignIn = useCallback(async () => {
    setHostedBusy(true);
    setHostedError(null);
    try {
      await keyStorage.setMode('hosted');
      setMode('hosted');
      await beginHostedSignIn(keyStorage);
      // Firefox refuses the automatic return navigation, so the code field is
      // the only way back from the web page.
      if (__TARGET__ === 'firefox') setShowCode(true);
      onHostedChanged?.();
    } catch (err) {
      setHostedError(err instanceof Error ? err.message : 'La connexion a échoué.');
    } finally {
      setHostedBusy(false);
    }
  }, [keyStorage, onHostedChanged]);

  const handleRedeemCode = useCallback(
    async (code: string) => {
      setHostedBusy(true);
      setHostedError(null);
      try {
        const account = await redeemHostedCode(keyStorage, code);
        setHostedAccount(account);
        setMode('hosted');
        setShowCode(false);
        onHostedChanged?.();
      } catch (err) {
        setHostedError(err instanceof Error ? err.message : 'La connexion a échoué.');
      } finally {
        setHostedBusy(false);
      }
    },
    [keyStorage, onHostedChanged]
  );

  const handleHostedSignOut = useCallback(async () => {
    setHostedBusy(true);
    setHostedError(null);
    try {
      await signOutHosted(keyStorage);
      setHostedAccount(null);
      onHostedChanged?.();
    } finally {
      setHostedBusy(false);
    }
  }, [keyStorage, onHostedChanged]);

  if (!isOpen) return null;

  const canSave = Boolean(model.trim()) && (Boolean(apiKey.trim()) || hasStoredKey);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Configuration du fournisseur IA"
      onClick={onClose}
    >
      <div
        className="w-full max-h-[92vh] overflow-y-auto rounded-t-2xl bg-white dark:bg-[#18181B] border-t border-[#E7E5E4] dark:border-[#27272A] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold font-display tracking-tight text-[#1C1917] dark:text-[#FAFAFA]">
              Moteur d’analyse
            </h2>
            <p className="mt-0.5 text-xs leading-relaxed text-[#78716C] dark:text-[#A1A1AA]">
              Sans clé d’API : connectez votre compte Squiggle et l’analyse tourne sur nos serveurs.
              Vous préférez votre propre clé ? Dépliez la section avancée.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="shrink-0 rounded-lg px-2 py-1 text-[#78716C] hover:bg-[#F5F5F4] dark:hover:bg-[#27272A]"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {/* Hosted first and prominent: the obvious choice on open. */}
          <section aria-label="Squiggle hébergé">
            <HostedAccountCard
              account={hostedAccount}
              error={hostedError}
              busy={hostedBusy}
              showCode={showCode || __TARGET__ === 'firefox'}
              isActive={mode === 'hosted'}
              onSignIn={() => void handleHostedSignIn()}
              onRedeem={(code) => void handleRedeemCode(code)}
              onSignOut={() => void handleHostedSignOut()}
              onUseHosted={() => void handleUseHosted()}
            />
            <p className="mt-2 text-[11px] leading-snug text-[#78716C] dark:text-[#A1A1AA]">
              Voir{' '}
              <a href={TRANSPARENCY_URL} target="_blank" rel="noreferrer" className="underline">
                le trajet des données
              </a>{' '}
              — l’article est analysé sur nos serveurs, jamais conservé en clair.
            </p>
          </section>

          {/* BYOK below, collapsed by default: the advanced path. */}
          <details className="rounded-xl border border-[#E7E5E4] dark:border-[#27272A]">
            <summary className="cursor-pointer list-none px-3 py-3 text-sm font-semibold text-[#1C1917] dark:text-[#FAFAFA]">
              Utiliser ma propre clé{' '}
              <span className="font-normal text-[#78716C] dark:text-[#A1A1AA]">(avancé)</span>
            </summary>

            <div className="space-y-4 border-t border-[#E7E5E4] dark:border-[#27272A] p-3">
              <div>
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#78716C] dark:text-[#A1A1AA]">
                  Fournisseur
                </span>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {PROVIDER_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleProviderChange(p.id)}
                      aria-pressed={provider === p.id}
                      className={
                        provider === p.id
                          ? 'rounded-xl border-2 border-[#1C1917] dark:border-[#FAFAFA] px-3 py-2 text-sm font-semibold text-[#1C1917] dark:text-[#FAFAFA]'
                          : 'rounded-xl border border-[#E7E5E4] dark:border-[#3F3F46] px-3 py-2 text-sm text-[#57534E] dark:text-[#D4D4D8] hover:border-[#A8A29E]'
                      }
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="block">
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#78716C] dark:text-[#A1A1AA]">
                  Modèle
                </span>
                <input
                  value={model}
                  onChange={(e) => {
                    setModel(e.target.value);
                    setValidation({ kind: 'idle' });
                  }}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={preset.modelPlaceholder}
                  className="mt-2 w-full rounded-xl border border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#121214] px-3 py-2 text-sm font-mono text-[#1C1917] dark:text-[#FAFAFA] outline-none focus:border-[#1C1917] dark:focus:border-[#FAFAFA]"
                />
                <span className="mt-1 block text-[11px] leading-snug text-[#78716C] dark:text-[#A1A1AA]">
                  Identifiant exact du modèle chez le fournisseur.
                </span>
              </label>

              <label className="block">
                <span className="flex items-baseline justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[#78716C] dark:text-[#A1A1AA]">
                    Clé API
                  </span>
                  <a
                    href={preset.keyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] font-medium text-[#2B4ACB] hover:underline"
                  >
                    Obtenir une clé ↗
                  </a>
                </span>
                <input
                  type="password"
                  value={apiKey}
                  autoComplete="off"
                  placeholder={hasStoredKey ? '•••••••• (clé enregistrée)' : preset.keyHint}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setValidation({ kind: 'idle' });
                  }}
                  className="mt-2 w-full rounded-xl border border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#121214] px-3 py-2 text-sm font-mono text-[#1C1917] dark:text-[#FAFAFA] outline-none focus:border-[#1C1917] dark:focus:border-[#FAFAFA]"
                />
              </label>

              {validation.kind !== 'idle' && (
                <div
                  role="status"
                  className={
                    validation.kind === 'valid'
                      ? 'rounded-xl bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-300'
                      : validation.kind === 'invalid'
                      ? 'rounded-xl bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-800 dark:text-red-300'
                      : 'rounded-xl bg-[#F5F5F4] dark:bg-[#27272A] px-3 py-2 text-xs text-[#57534E] dark:text-[#D4D4D8]'
                  }
                >
                  {validation.kind === 'validating' ? 'Test de la connexion…' : validation.message}
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleValidate}
                  disabled={validation.kind === 'validating' || !apiKey.trim() || !model.trim()}
                  className="flex-1 rounded-xl border border-[#E7E5E4] dark:border-[#3F3F46] px-3 py-2.5 text-sm font-semibold text-[#1C1917] dark:text-[#FAFAFA] disabled:opacity-40 hover:bg-[#F5F5F4] dark:hover:bg-[#27272A]"
                >
                  Tester la clé
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving || !canSave}
                  className="flex-1 rounded-xl bg-[#1C1917] dark:bg-[#FAFAFA] px-3 py-2.5 text-sm font-semibold text-white dark:text-[#18181B] disabled:opacity-40"
                >
                  {isSaving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>

              {hasStoredKey && (
                <button
                  type="button"
                  onClick={handleRemove}
                  className="w-full pt-1 text-center text-xs text-[#B3402F] hover:underline"
                >
                  Supprimer la clé enregistrée pour {preset.label}
                </button>
              )}
            </div>
          </details>
        </div>
      </div>
    </div>
  );
};
