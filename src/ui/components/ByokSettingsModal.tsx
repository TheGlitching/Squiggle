import React, { useCallback, useEffect, useState } from 'react';
import { SecureKeyStorage } from '../../crypto/storage';
import { createLLMClient } from '../../client/factory';
import type { LLMProvider, ProviderConfig } from '../../types/byok';

/**
 * BYOK configuration surface.
 *
 * The task tree marked this component complete and it passed verification, but
 * no file was ever written - the extension shipped with no way to enter a key,
 * which is why every run silently fell back to the demo fixture.
 */

interface ProviderPreset {
  id: LLMProvider;
  label: string;
  defaultModel: string;
  models: string[];
  keyHint: string;
  keyUrl: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    defaultModel: 'claude-sonnet-4-20250514',
    models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-5-haiku-20241022'],
    keyHint: 'sk-ant-...',
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    defaultModel: 'gpt-4o',
    models: ['gpt-4o', 'gpt-4o-mini', 'o4-mini'],
    keyHint: 'sk-...',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    defaultModel: 'anthropic/claude-sonnet-4',
    models: ['anthropic/claude-sonnet-4', 'google/gemini-2.5-flash', 'openai/gpt-4o'],
    keyHint: 'sk-or-...',
    keyUrl: 'https://openrouter.ai/keys',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    defaultModel: 'gemini-2.5-flash',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    keyHint: 'AIza...',
    keyUrl: 'https://aistudio.google.com/apikey',
  },
];

/**
 * Sentinel for the dropdown's escape hatch. It cannot collide with a real model
 * id, which is why it is not simply an empty string: an empty value would also
 * be what a cleared custom field holds.
 */
const CUSTOM_MODEL_OPTION = '__custom__';

/**
 * Decides whether a model belongs in the dropdown or in the free-text field.
 *
 * It exists as its own function because getting it wrong is silent: a model the
 * reader saved that this build no longer lists would leave the dropdown with a
 * value it has no option for, and the browser would settle on whichever option
 * comes first. The reader would then be analysing with a model they never chose.
 */
export function resolveModelSelection(
  preset: ProviderPreset | undefined,
  storedModel: string | undefined
): { model: string; usesCustomModel: boolean } {
  const model = storedModel || preset?.defaultModel || '';
  return { model, usesCustomModel: model !== '' && !(preset?.models ?? []).includes(model) };
}

type ValidationState =
  | { kind: 'idle' }
  | { kind: 'validating' }
  | { kind: 'valid'; message: string }
  | { kind: 'invalid'; message: string };

export interface ByokSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (provider: LLMProvider) => void;
  storage?: SecureKeyStorage;
}

export const ByokSettingsModal: React.FC<ByokSettingsModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  storage,
}) => {
  const [keyStorage] = useState(() => storage ?? new SecureKeyStorage());
  const [provider, setProvider] = useState<LLMProvider>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(PROVIDER_PRESETS[0].defaultModel);
  const [usesCustomModel, setUsesCustomModel] = useState(false);
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [validation, setValidation] = useState<ValidationState>({ kind: 'idle' });
  const [isSaving, setIsSaving] = useState(false);

  const preset = PROVIDER_PRESETS.find((p) => p.id === provider) ?? PROVIDER_PRESETS[0];

  // Load whatever is already configured whenever the modal opens.
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
        const selection = resolveModelSelection(
          PROVIDER_PRESETS.find((p) => p.id === active),
          config?.model
        );
        setModel(selection.model);
        setUsesCustomModel(selection.usesCustomModel);
        setValidation({ kind: 'idle' });
      } catch {
        // First run: nothing stored yet.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, keyStorage]);

  const handleProviderChange = useCallback(
    async (next: LLMProvider) => {
      setProvider(next);
      setValidation({ kind: 'idle' });
      setApiKey('');
      const nextPreset = PROVIDER_PRESETS.find((p) => p.id === next);
      const applySelection = (stored?: string) => {
        const selection = resolveModelSelection(nextPreset, stored);
        setModel(selection.model);
        setUsesCustomModel(selection.usesCustomModel);
      };
      try {
        const existing = await keyStorage.getProviderConfig(next);
        setHasStoredKey(Boolean(existing?.apiKey));
        applySelection(existing?.model);
      } catch {
        setHasStoredKey(false);
        applySelection(undefined);
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

    setValidation({ kind: 'validating' });
    try {
      const client = createLLMClient({ provider, apiKey: candidateKey, model });
      const response = await client.complete({
        messages: [{ role: 'user', content: 'Réponds exactement: OK' }],
        maxTokens: 8,
        temperature: 0,
      });
      const reply = (response.content || '').trim();
      setValidation({
        kind: 'valid',
        message: reply ? `Connexion établie (${model}).` : 'Connexion établie.',
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
      const trimmed = apiKey.trim();
      if (trimmed) {
        const config: ProviderConfig = { provider, apiKey: trimmed, model };
        await keyStorage.saveProviderConfig(config);
      }
      await keyStorage.setActiveProvider(provider);
      onSaved?.(provider);
      onClose();
    } catch (err: unknown) {
      setValidation({
        kind: 'invalid',
        message: err instanceof Error ? err.message : 'Échec de l’enregistrement.',
      });
    } finally {
      setIsSaving(false);
    }
  }, [apiKey, keyStorage, model, onClose, onSaved, provider]);

  const handleRemove = useCallback(async () => {
    await keyStorage.removeProvider(provider);
    setHasStoredKey(false);
    setApiKey('');
    setValidation({ kind: 'idle' });
  }, [keyStorage, provider]);

  if (!isOpen) return null;

  const canSave = Boolean(apiKey.trim()) || hasStoredKey;

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
              Votre clé, votre modèle
            </h2>
            <p className="mt-0.5 text-xs leading-relaxed text-[#78716C] dark:text-[#A1A1AA]">
              La clé est chiffrée et stockée uniquement sur cet appareil. Aucun serveur
              intermédiaire ne la voit.
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

          {/*
            A datalist on a text input looked like a dropdown without behaving as
            one: the platform draws no usable affordance, so the list only appeared
            if you already guessed a model name and started typing it. A native
            select does open, which is the whole point of offering a list.

            The escape hatch is not optional. OpenRouter alone exposes hundreds of
            models and every provider's catalogue moves faster than this build, so
            a closed list would eventually be a list of models nobody can select.
          */}
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#78716C] dark:text-[#A1A1AA]">
              Modèle
            </span>
            <select
              value={usesCustomModel ? CUSTOM_MODEL_OPTION : model}
              onChange={(e) => {
                const choice = e.target.value;
                setUsesCustomModel(choice === CUSTOM_MODEL_OPTION);
                if (choice !== CUSTOM_MODEL_OPTION) setModel(choice);
              }}
              className="mt-2 w-full rounded-xl border border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#121214] px-3 py-2 text-sm font-mono text-[#1C1917] dark:text-[#FAFAFA] outline-none focus:border-[#1C1917] dark:focus:border-[#FAFAFA]"
            >
              {preset.models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
              <option value={CUSTOM_MODEL_OPTION}>Autre modèle...</option>
            </select>
          </label>

          {usesCustomModel && (
            <label className="block">
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#78716C] dark:text-[#A1A1AA]">
                Identifiant du modèle
              </span>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={preset.defaultModel}
                autoFocus
                className="mt-2 w-full rounded-xl border border-[#E7E5E4] dark:border-[#3F3F46] bg-white dark:bg-[#121214] px-3 py-2 text-sm font-mono text-[#1C1917] dark:text-[#FAFAFA] outline-none focus:border-[#1C1917] dark:focus:border-[#FAFAFA]"
              />
              <span className="mt-1 block text-[11px] leading-snug text-[#78716C] dark:text-[#A1A1AA]">
                Tel qu'attendu par le fournisseur, à l'identique.
              </span>
            </label>
          )}

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
              disabled={validation.kind === 'validating' || !apiKey.trim()}
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
      </div>
    </div>
  );
};
