import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';

import { TypedMessageBus } from '../messaging/messageBus';
import { UnifiedRuntime } from '../messaging/runtime';
import { SecureKeyStorage, UnreadableKeyError } from '../crypto/storage';

import { ScoreGauge, DomainScoreGauge } from '../ui/components/ScoreGauges';
import { VerdictStamp } from '../ui/components/VerdictStamp';
import { FindingCard } from '../ui/components/FindingCard';
import { CategoryFilterBar, type FindingCategory as FilterCategory } from '../ui/components/CategoryFilterBar';
import { PrioritizedRevisionPlan } from '../ui/components/PrioritizedRevisionPlan';
import { ByokSettingsModal } from '../ui/components/ByokSettingsModal';
import { OnboardingTour } from '../ui/components/OnboardingTour';

import { countFindingsByFilterCategory, filterFindings } from '../adapters/findingAdapters';
import type { AnalysisResult, Finding, ScoreDomainKey } from '../engine/types';

/**
 * The sidepanel is the integration point of the whole extension. It previously
 * rendered a hardcoded fake report - one invented finding and a literal score of
 * 48 - with no bus, no storage and no analysis trigger, which is why the
 * shipped extension looked like a mock of itself.
 */

type Status = 'idle' | 'extracting' | 'analyzing' | 'complete' | 'error';

interface ProgressState {
  status: Status;
  message: string;
  progress: number;
}

const IDLE_PROGRESS: ProgressState = { status: 'idle', message: '', progress: 0 };

function SidepanelApp() {
  // One bus for the lifetime of the panel. Creating it per render would install
  // a duplicate runtime listener on every update.
  const busRef = useRef<TypedMessageBus | null>(null);
  if (!busRef.current) busRef.current = new TypedMessageBus('sidepanel');
  const bus = busRef.current;

  const keyStorageRef = useRef<SecureKeyStorage | null>(null);
  if (!keyStorageRef.current) keyStorageRef.current = new SecureKeyStorage();

  const [tabId, setTabId] = useState<number | null>(null);
  const [report, setReport] = useState<AnalysisResult | null>(null);
  const [progress, setProgress] = useState<ProgressState>(IDLE_PROGRESS);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<FilterCategory>('all');
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [hoveredFindingId, setHoveredFindingId] = useState<string | null>(null);
  const [expandedDomain, setExpandedDomain] = useState<ScoreDomainKey | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [tourOpen, setTourOpen] = useState(false);
  const [isDark, setIsDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
  );

  // Keep Tailwind's `dark:` variants and the inline-style components in sync -
  // the two styling dialects need the same single source of truth.
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const apply = (matches: boolean) => {
      setIsDark(matches);
      document.documentElement.classList.toggle('dark', matches);
    };
    apply(mq.matches);
    const listener = (e: MediaQueryListEvent) => apply(e.matches);
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, []);

  const refreshKeyPresence = useCallback(async () => {
    try {
      const active = await keyStorageRef.current!.getActiveProvider();
      const config = await keyStorageRef.current!.getProviderConfig(active);
      setHasKey(Boolean(config?.apiKey));
    } catch (e) {
      // A stored key that cannot be decrypted is not the same as no key: say so,
      // otherwise the panel invites the user to add a key they already added.
      if (e instanceof UnreadableKeyError) {
        setError(
          'Votre clé API enregistrée n’a pas pu être déchiffrée. Saisissez-la à nouveau.'
        );
      }
      setHasKey(false);
    }
  }, []);

  // Resolve the tab, hydrate any analysis already stored for it, and decide
  // whether this is a first run.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const activeTab = await UnifiedRuntime.getActiveTab();
      if (cancelled) return;
      const resolvedId = activeTab?.id ?? null;
      setTabId(resolvedId);

      await refreshKeyPresence();
      if (cancelled) return;

      try {
        const response = (await bus.callRPC('GET_TAB_STATE', { tabId: resolvedId ?? undefined })) as {
          state?: {
            status?: Status;
            result?: AnalysisResult;
            error?: string;
            currentStep?: string;
            progress?: number;
          } | null;
        };
        const state = response?.state;
        if (cancelled || !state) return;
        if (state.result) setReport(state.result);
        if (state.error) setError(state.error);
        if (state.status && state.status !== 'idle') {
          setProgress({
            status: state.status,
            message: state.currentStep ?? '',
            progress: state.progress ?? 0,
          });
        }
      } catch {
        // Background worker asleep on first open; nothing to restore.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bus, refreshKeyPresence]);

  useEffect(() => {
    if (hasKey === false && !report) setTourOpen(true);
  }, [hasKey, report]);

  // Live analysis events from the background worker.
  useEffect(() => {
    const offProgress = bus.on<{ tabId: number; status: string; message: string; progress: number }>(
      'ANALYSIS_PROGRESS',
      (payload) => {
        setProgress({
          status: (payload.status === 'completed' ? 'complete' : payload.status) as Status,
          message: payload.message ?? '',
          progress: payload.progress ?? 0,
        });
      }
    );

    const offComplete = bus.on<{ tabId: number; result: AnalysisResult }>('ANALYSIS_COMPLETE', (payload) => {
      setReport(payload.result);
      setError(null);
      setProgress({ status: 'complete', message: 'Analyse terminée', progress: 100 });
    });

    const offError = bus.on<{ tabId: number; error: string }>('ANALYSIS_ERROR', (payload) => {
      setError(payload.error);
      setProgress({ status: 'error', message: payload.error, progress: 0 });
    });

    const offSelected = bus.on<{ findingId: string }>('FC_SIDEBAR_FINDING_SELECTED', (payload) => {
      setSelectedFindingId(payload.findingId ?? null);
    });

    const offHovered = bus.on<{ findingId: string }>('FC_SIDEBAR_FINDING_HOVERED', (payload) => {
      setHoveredFindingId(payload.findingId ?? null);
    });

    return () => {
      offProgress();
      offComplete();
      offError();
      offSelected();
      offHovered();
    };
  }, [bus]);

  useEffect(() => () => bus.destroy(), [bus]);

  const runAnalysis = useCallback(async () => {
    setError(null);
    setReport(null);
    setProgress({ status: 'extracting', message: 'Extraction de l’article…', progress: 5 });
    try {
      const response = (await bus.callRPC(
        'TRIGGER_ANALYSIS',
        { tabId: tabId ?? undefined },
        { timeoutMs: 180000 }
      )) as { success: boolean; result?: AnalysisResult; error?: string };

      if (response?.success && response.result) {
        setReport(response.result);
        setProgress({ status: 'complete', message: 'Analyse terminée', progress: 100 });
      } else {
        const message = response?.error ?? 'L’analyse a échoué.';
        setError(message);
        setProgress({ status: 'error', message, progress: 0 });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'L’analyse a échoué.';
      setError(message);
      setProgress({ status: 'error', message, progress: 0 });
    }
  }, [bus, tabId]);

  const selectFinding = useCallback(
    (id: string | null) => {
      setSelectedFindingId(id);
      void bus.callRPC('SELECT_FINDING', { tabId: tabId ?? undefined, findingId: id }).catch(() => {
        // Content script not injected on this page; selection stays panel-local.
      });
    },
    [bus, tabId]
  );

  const findings: Finding[] = report?.findings ?? [];
  const counts = useMemo(() => countFindingsByFilterCategory(findings), [findings]);
  const visibleFindings = useMemo(() => filterFindings(findings, category), [findings, category]);

  const busy = progress.status === 'extracting' || progress.status === 'analyzing';
  const theme = isDark ? 'dark' : 'light';

  return (
    <div className="flex flex-col min-h-screen p-4 font-sans bg-[#FBFBFA] dark:bg-[#121214] text-[#1C1917] dark:text-[#E7E5E4]">
      <header className="flex items-start justify-between gap-2 pb-3 border-b border-[#E7E5E4] dark:border-[#27272A]">
        <div>
          <h1 className="text-lg font-bold font-display tracking-tight text-[#1C1917] dark:text-[#FAFAFA]">
            Squiggle
          </h1>
          <p className="text-xs text-[#78716C] dark:text-[#A1A1AA]">
            Analyse critique et rigueur éditoriale
          </p>
        </div>
        <div className="flex items-center gap-1" data-tour="export-actions">
          <button
            type="button"
            onClick={() => setTourOpen(true)}
            aria-label="Revoir la visite guidée"
            className="rounded-lg px-2 py-1.5 text-sm text-[#78716C] hover:bg-[#F5F5F4] dark:hover:bg-[#27272A]"
          >
            ?
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Configurer la clé API"
            className="rounded-lg px-2 py-1.5 text-sm text-[#78716C] hover:bg-[#F5F5F4] dark:hover:bg-[#27272A]"
          >
            ⚙
          </button>
        </div>
      </header>

      <main className="flex-1 py-4 space-y-5">
        {hasKey === false && (
          <div className="rounded-xl border border-[#E7E5E4] dark:border-[#27272A] bg-white dark:bg-[#18181B] p-4">
            <h2 className="text-sm font-semibold text-[#1C1917] dark:text-[#FAFAFA]">
              Configurez votre clé pour commencer
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-[#78716C] dark:text-[#A1A1AA]">
              L’extension fonctionne avec votre propre clé API. Sans clé, aucune analyse ne peut
              être lancée.
            </p>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="mt-3 w-full rounded-xl bg-[#1C1917] dark:bg-[#FAFAFA] px-3 py-2.5 text-sm font-semibold text-white dark:text-[#18181B]"
            >
              Configurer ma clé
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={runAnalysis}
          disabled={busy || hasKey === false}
          className="w-full rounded-xl bg-[#1C1917] dark:bg-[#FAFAFA] px-3 py-3 text-sm font-semibold text-white dark:text-[#18181B] disabled:opacity-50"
        >
          {busy ? 'Analyse en cours…' : report ? 'Relancer l’analyse' : 'Lancer l’analyse éditoriale'}
        </button>

        {busy && (
          <div className="space-y-1.5" role="status" aria-live="polite">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#E7E5E4] dark:bg-[#27272A]">
              <div
                className="h-full rounded-full bg-[#1C1917] dark:bg-[#FAFAFA] transition-all duration-300"
                style={{ width: `${Math.max(progress.progress, 4)}%` }}
              />
            </div>
            <p className="text-xs text-[#78716C] dark:text-[#A1A1AA]">{progress.message}</p>
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-red-50 dark:bg-red-950/40 px-3 py-2.5 text-xs text-red-800 dark:text-red-300">
            {error}
          </div>
        )}

        {report && (
          <>
            <section
              data-tour="verdict-stamp"
              className="p-4 rounded-xl bg-white dark:bg-[#18181B] border border-[#E7E5E4] dark:border-[#27272A] shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-[#78716C] dark:text-[#A1A1AA]">
                  Évaluation globale
                </h2>
                <VerdictStamp verdict={report.verdict} score={report.score} />
              </div>
              <div className="mt-4 flex justify-center" data-tour="score-gauges">
                <ScoreGauge score={report.score} size={110} strokeWidth={8} showBandLabel />
              </div>
              {report.summary && (
                <p className="mt-3 text-xs leading-relaxed text-[#57534E] dark:text-[#D4D4D8]">
                  {report.summary}
                </p>
              )}
            </section>

            {report.categories?.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-[#1C1917] dark:text-[#FAFAFA]">
                  Domaines évalués
                </h3>
                <div className="space-y-1.5">
                  {report.categories.map((c) => (
                    <DomainScoreGauge
                      key={c.domain}
                      domainKey={c.domain}
                      score={c.score}
                      maxScore={c.maxScore}
                      strengths={c.strengths}
                      weaknesses={c.weaknesses}
                      expanded={expandedDomain === c.domain}
                      onToggle={() =>
                        setExpandedDomain((current) => (current === c.domain ? null : c.domain))
                      }
                    />
                  ))}
                </div>
              </section>
            )}

            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-[#1C1917] dark:text-[#FAFAFA]">
                Grille des constats
              </h3>
              <div data-tour="category-filters">
                <CategoryFilterBar
                  selectedCategory={category}
                  onSelectCategory={setCategory}
                  counts={counts}
                  totalCount={findings.length}
                  theme={theme}
                />
              </div>
              <div className="space-y-2.5" data-tour="finding-card">
                {visibleFindings.length === 0 ? (
                  <p className="text-xs text-[#78716C] dark:text-[#A1A1AA]">
                    Aucun constat dans cette catégorie.
                  </p>
                ) : (
                  visibleFindings.map((finding) => (
                    <FindingCard
                      key={finding.id}
                      finding={finding}
                      isSelected={selectedFindingId === finding.id}
                      isHovered={hoveredFindingId === finding.id}
                      onSelect={(id) => selectFinding(selectedFindingId === id ? null : id)}
                      onHover={setHoveredFindingId}
                    />
                  ))
                )}
              </div>
            </section>

            {report.revisionPlan && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-[#1C1917] dark:text-[#FAFAFA]">
                  Plan de révision
                </h3>
                <PrioritizedRevisionPlan plan={report.revisionPlan} theme={theme} />
              </section>
            )}
          </>
        )}

        {!report && !busy && !error && hasKey !== false && (
          <p className="text-xs leading-relaxed text-[#78716C] dark:text-[#A1A1AA]">
            Ouvrez un article de presse, puis lancez l’analyse. Les constats seront surlignés
            directement dans la page.
          </p>
        )}
      </main>

      <footer className="pt-3 border-t border-[#E7E5E4] dark:border-[#27272A] text-center text-xs text-[#A8A29E]">
        {report?.meta?.model ? `Modèle : ${report.meta.model}` : 'Analyse assistée par IA · MV3'}
      </footer>

      <ByokSettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        storage={keyStorageRef.current!}
        onSaved={() => void refreshKeyPresence()}
      />

      <OnboardingTour
        isOpen={tourOpen}
        theme={theme}
        onComplete={() => setTourOpen(false)}
        onSkip={() => setTourOpen(false)}
      />
    </div>
  );
}

export { SidepanelApp };

const rootEl = document.getElementById('root');
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <SidepanelApp />
    </React.StrictMode>
  );
}
