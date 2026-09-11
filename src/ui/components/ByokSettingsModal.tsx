import React, { useCallback, useEffect, useState } from 'react';
import { SecureKeyStorage, type AnalysisMode } from '../../crypto/storage';
import { createLLMClient } from '../../client/factory';
import { listOpenRouterModels, OpenRouterModel } from '@squiggle/shared';
import type { LLMProvider, ProviderConfig } from '@squiggle/shared';
import {
  beginHostedSignIn,
  describeHostedAccount,
  fetchHostedAccount,
  HostedAuthError,
  redeemHostedCode,
  signOutHosted,
  type HostedAccount,
} from '../../hosted/session';
import { ACCOUNT_URL, TRANSPARENCY_URL } from '../../hosted/config';

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
 *
 * `liveModels` is the fetched catalogue for providers whose list moves faster
 * than the build (OpenRouter), so a model they advertised yesterday is offered
 * as a real option, not silently demoted to the free-text field.
 */
export function resolveModelSelection(
  preset: ProviderPreset | undefined,
  storedModel: string | undefined,
  liveModels: readonly string[] = []
): { model: string; usesCustomModel: boolean } {
  const model = storedModel || preset?.defaultModel || '';
  const known = new Set<string>([...(preset?.models ?? []), ...liveModels]);
  return { model, usesCustomModel: model !== '' && !known.has(model) };
}

export interface OpenRouterModelGroup {
  author: string;
  models: OpenRouterModel[];
}

/**
 * Groups the live catalogue by author org, ids sorted within a group and
 * groups by name, so the picker is navigable instead of a flat wall of 400
 * entries. Exported for the tests to assert against without a browser.
 */
export function groupOpenRouterModels(models: OpenRouterModel[]): OpenRouterModelGroup[] {
  const byAuthor = new Map<string, OpenRouterModel[]>();
  for (const m of models) {
    const bucket = byAuthor.get(m.author) ?? [];
    bucket.push(m);
    byAuthor.set(m.author, bucket);
  }
  return Array.from(byAuthor.entries())
    .map(([author, group]) => ({
      author,
      // The tilde marks OpenRouter alias ids and must not move them around in
      // the list, so it is stripped for ordering but never from the id itself.
      models: group.sort((a, b) =>
        a.id.replace(/^[^a-zA-Z0-9]+/, '').localeCompare(b.id.replace(/^[^a-zA-Z0-9]+/, ''))
      ),
    }))
    .sort((a, b) => a.author.localeCompare(b.author));
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
  /** Fired when the mode or the hosted session changes, so the panel refreshes. */
  onHostedChanged?: () => void;
  storage?: SecureKeyStorage;
  /**
   * Injected for tests only: how the OpenRouter catalogue is fetched. Defaults
   * to the real fetching listOpenRouterModels; a test passes a stub so the
   * modal render never touches the network.
   */
  openModelsLoader?: () => Promise<OpenRouterModel[]>;
}

export const ByokSettingsModal: React.FC<ByokSettingsModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  onHostedChanged,
  storage,
  openModelsLoader,
}) => {
  const [keyStorage] = useState(() => storage ?? new SecureKeyStorage());
  const [provider, setProvider] = useState<LLMProvider>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(PROVIDER_PRESETS[0].defaultModel);
  const [usesCustomModel, setUsesCustomModel] = useState(false);
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [validation, setValidation] = useState<ValidationState>({ kind: 'idle' });
  const [isSaving, setIsSaving] = useState(false);
  /** OpenRouter models fetched live; empty means "not loaded, use the preset". */
  const [liveOpenModels, setLiveOpenModels] = useState<OpenRouterModel[]>([]);
  /** Which engine analyses run through; hosted has its own state below. */
  const [mode, setMode] = useState<AnalysisMode>('byok');
  const [hostedAccount, setHostedAccount] = useState<HostedAccount | null>(null);
  const [hostedError, setHostedError] = useState<string | null>(null);
  const [hostedBusy, setHostedBusy] = useState(false);
  const [code, setCode] = useState('');
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

  // Fetch the live catalogue when OpenRouter is the selected provider. It is
  // public and keyless; any failure leaves the static preset in charge. Once
  // the fetch lands, re-run the model selection so a model the static preset
  // never listed (say `~deepseek/deepseek-v4-flash-latest`) is offered as a
  // real option instead of the free-text field.
  useEffect(() => {
    if (!isOpen || provider !== 'openrouter') return;
    let cancelled = false;

    (async () => {
      const list = openModelsLoader ? await openModelsLoader() : await listOpenRouterModels();
      if (cancelled) return;
      setLiveOpenModels(list);
      const selection = resolveModelSelection(preset, model, list.map((m) => m.id));
      setModel(selection.model);
      setUsesCustomModel(selection.usesCustomModel);
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, provider, openModelsLoader]);

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

      try {
        const activeMode = await keyStorage.getMode();
        if (cancelled) return;
        setMode(activeMode);
        setHostedError(null);
        setCode('');
        setShowCode(false);
        if (activeMode === 'hosted') await refreshHosted();
      } catch {
        // The mode read failed; BYOK stays selected.
      }
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

  const handleModeChange = useCallback(
    async (next: AnalysisMode) => {
      setMode(next);
      setHostedError(null);
      try {
        await keyStorage.setMode(next);
      } catch {
        setHostedError('Impossible d’enregistrer votre choix.');
      }
      if (next === 'hosted') await refreshHosted();
      onHostedChanged?.();
    },
    [keyStorage, refreshHosted, onHostedChanged]
  );

  const handleHostedSignIn = useCallback(async () => {
    setHostedBusy(true);
    setHostedError(null);
    try {
      await beginHostedSignIn(keyStorage);
      // Firefox refuses the automatic return navigation, so the code field is
      // the only way back from the web page.
      if (__TARGET__ === 'firefox') setShowCode(true);
    } catch (err) {
      setHostedError(err instanceof Error ? err.message : 'La connexion a échoué.');
    } finally {
      setHostedBusy(false);
    }
  }, [keyStorage]);

  const handleRedeemCode = useCallback(async () => {
    setHostedBusy(true);
    setHostedError(null);
    try {
      const account = await redeemHostedCode(keyStorage, code);
      setHostedAccount(account);
      setCode('');
      setShowCode(false);
      onHostedChanged?.();
    } catch (err) {
      setHostedError(err instanceof Error ? err.message : 'La connexion a échoué.');
    } finally {
      setHostedBusy(false);
    }
  }, [code, keyStorage, onHostedChanged]);

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

  const canSave = Boolean(apiKey.trim()) || hasStoredKey;
  const hostedView = hostedAccount ? describeHostedAccount(hostedAccount) : null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Configuration du fournisseur IA"
      onClick={onClose}
    >
      <div
        className="w-full max-h-[92vh] overflow-y-auto rounded-t-2xl bg-panel border-t border-line p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold font-display tracking-tight text-ink">
              Moteur d’analyse
            </h2>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              Utilisez votre propre clé API, ou laissez-nous analyser via votre compte
              Squiggle hébergé.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="shrink-0 rounded-lg px-2 py-1 text-muted hover:bg-panel-muted"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted">
              Mode
            </span>
            <div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label="Mode d’analyse">
              <button
                type="button"
                onClick={() => void handleModeChange('byok')}
                aria-pressed={mode === 'byok'}
                className={
                  mode === 'byok'
                    ? 'rounded-xl border-2 border-accent px-3 py-2 text-sm font-semibold text-ink'
                    : 'rounded-xl border border-line px-3 py-2 text-sm text-ink/80 hover:border-line-heavy'
                }
              >
                Ma clé (BYOK)
              </button>
              <button
                type="button"
                onClick={() => void handleModeChange('hosted')}
                aria-pressed={mode === 'hosted'}
                className={
                  mode === 'hosted'
                    ? 'rounded-xl border-2 border-accent px-3 py-2 text-sm font-semibold text-ink'
                    : 'rounded-xl border border-line px-3 py-2 text-sm text-ink/80 hover:border-line-heavy'
                }
              >
                Squiggle hébergé
              </button>
            </div>
          </div>

          {mode === 'byok' && (
            <>
          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted">
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
                      ? 'rounded-xl border-2 border-accent px-3 py-2 text-sm font-semibold text-ink'
                      : 'rounded-xl border border-line px-3 py-2 text-sm text-ink/80 hover:border-line-heavy'
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
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted">
              Modèle
            </span>
            <select
              value={usesCustomModel ? CUSTOM_MODEL_OPTION : model}
              onChange={(e) => {
                const choice = e.target.value;
                setUsesCustomModel(choice === CUSTOM_MODEL_OPTION);
                if (choice !== CUSTOM_MODEL_OPTION) setModel(choice);
              }}
              className="mt-2 w-full rounded-xl border border-line bg-ground px-3 py-2 text-sm font-mono text-ink outline-none focus:border-accent"
            >
              {provider === 'openrouter' && liveOpenModels.length > 0
                ? groupOpenRouterModels(liveOpenModels).map((group) => (
                    <optgroup key={group.author} label={group.author}>
                      {group.models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.id}
                        </option>
                      ))}
                    </optgroup>
                  ))
                : preset.models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
              <option value={CUSTOM_MODEL_OPTION}>Autre modèle...</option>
            </select>
          </label>

          {usesCustomModel && (
            <label className="block">
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted">
                Identifiant du modèle
              </span>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={preset.defaultModel}
                autoFocus
                className="mt-2 w-full rounded-xl border border-line bg-ground px-3 py-2 text-sm font-mono text-ink outline-none focus:border-accent"
              />
              <span className="mt-1 block text-[11px] leading-snug text-muted">
                Tel qu'attendu par le fournisseur, à l'identique.
              </span>
            </label>
          )}

          <label className="block">
            <span className="flex items-baseline justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                Clé API
              </span>
              <a
                href={preset.keyUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-medium text-accent-hover hover:underline"
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
              className="mt-2 w-full rounded-xl border border-line bg-ground px-3 py-2 text-sm font-mono text-ink outline-none focus:border-accent"
            />
          </label>

          {validation.kind !== 'idle' && (
            <div
              role="status"
              className={
                validation.kind === 'valid'
                  ? 'rounded-xl bg-severity-positive/15 px-3 py-2 text-xs text-severity-positive-ink'
                  : validation.kind === 'invalid'
                  ? 'rounded-xl bg-severity-critical/15 px-3 py-2 text-xs text-severity-critical-ink'
                  : 'rounded-xl bg-panel-muted px-3 py-2 text-xs text-ink/80'
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
              className="flex-1 rounded-xl border border-line px-3 py-2.5 text-sm font-semibold text-ink disabled:opacity-40 hover:bg-panel-muted"
            >
              Tester la clé
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !canSave}
              className="flex-1 rounded-xl bg-accent px-3 py-2.5 text-sm font-semibold text-accent-foreground disabled:opacity-40"
            >
              {isSaving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>

          {hasStoredKey && (
            <button
              type="button"
              onClick={handleRemove}
              className="w-full pt-1 text-center text-xs text-severity-critical-ink hover:underline"
            >
              Supprimer la clé enregistrée pour {preset.label}
            </button>
          )}
            </>
          )}

          {mode === 'hosted' && (
            <div className="space-y-3">
              {hostedAccount && hostedView ? (
                <div className="rounded-xl border border-line p-3">
                  <p className="text-sm font-semibold text-ink">
                    {hostedView.title}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    {hostedView.detail}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {!hostedView.canAnalyse && (
                      <a
                        href={ACCOUNT_URL}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground"
                      >
                        {hostedView.needsSubscription ? 'S’abonner' : 'Mon compte'}
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleHostedSignOut()}
                      disabled={hostedBusy}
                      className="rounded-xl border border-line px-3 py-2 text-xs font-semibold text-ink/80 disabled:opacity-40 hover:bg-panel-muted"
                    >
                      Se déconnecter
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-line p-3">
                  <p className="text-sm font-semibold text-ink">
                    3 analyses offertes
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    Sans clé d’API : créez un compte Squiggle, l’analyse tourne sur nos serveurs.
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleHostedSignIn()}
                    disabled={hostedBusy}
                    className="mt-3 w-full rounded-xl bg-accent px-3 py-2.5 text-sm font-semibold text-accent-foreground disabled:opacity-40"
                  >
                    {hostedBusy ? 'Ouverture…' : 'Se connecter'}
                  </button>
                </div>
              )}

              {(showCode || __TARGET__ === 'firefox') && !hostedAccount && (
                <div className="rounded-xl bg-panel-muted p-3">
                  <label className="block text-xs text-ink/80">
                    Sur la page ouverte, demandez un code puis saisissez-le ici&nbsp;:
                    <input
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      maxLength={8}
                      autoComplete="off"
                      placeholder="ABCD2345"
                      className="mt-2 w-full rounded-xl border border-line bg-ground px-3 py-2 text-center font-mono text-lg tracking-[0.3em] text-ink outline-none focus:border-accent"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleRedeemCode()}
                    disabled={hostedBusy || code.trim().length < 4}
                    className="mt-2 w-full rounded-xl border border-line px-3 py-2.5 text-sm font-semibold text-ink disabled:opacity-40 hover:bg-panel"
                  >
                    Valider le code
                  </button>
                </div>
              )}

              {hostedError && (
                <div
                  role="alert"
                  className="rounded-xl bg-severity-critical/15 px-3 py-2 text-xs text-severity-critical-ink"
                >
                  {hostedError}
                </div>
              )}

              <p className="text-[11px] leading-snug text-muted">
                Voir{' '}
                <a href={TRANSPARENCY_URL} target="_blank" rel="noreferrer" className="underline">
                  le trajet des données
                </a>{' '}
                — l’article est analysé sur nos serveurs, jamais conservé en clair.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
