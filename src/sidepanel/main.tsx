import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';

import { TypedMessageBus } from '../messaging/messageBus';
import { UnifiedRuntime } from '../messaging/runtime';
import { SecureKeyStorage, UnreadableKeyError } from '../crypto/storage';

import { ScoreGauge, DomainScoreGauge } from '../ui/components/ScoreGauges';
import { FindingCard } from '../ui/components/FindingCard';
import { CategoryFilterBar, type FindingCategory as FilterCategory } from '../ui/components/CategoryFilterBar';
import { ResearchDisclosure } from '../ui/components/ResearchDisclosure';
import { ByokSettingsModal } from '../ui/components/ByokSettingsModal';
import { HostedAccountCard } from '../ui/components/HostedAccountCard';
import { SubscribeOffer } from '../ui/components/SubscribeOffer';
import { OnboardingTour, getTourCompletionStatus } from '../ui/components/OnboardingTour';
import { SquiggleBadge } from '../ui/components/SquiggleBadge';
import { ReviewPromptCard } from '../ui/components/ReviewPromptCard';
import { claimReviewPrompt } from '../review/reviewPrompt';
import {
  beginHostedSignIn,
  describeHostedAccount,
  startHostedCheckout,
  fetchHostedAccount,
  HostedAuthError,
  redeemHostedCode,
  signOutHosted,
  type HostedAccount,
} from '../hosted/session';
import { TRANSPARENCY_URL } from '../hosted/config';
import { isPdfAddress, pdfPageUrl } from '../pdf/address';
import { requestSiteAccess } from '../permissions/siteAccess';
import { reportFinding } from '../hosted/flag';
import type { AnalysisMode } from '../crypto/storage';

import { countFindingsByFilterCategory, filterFindings } from '../adapters/findingAdapters';
import { reportSubject, SCORE_DOMAINS, youtubeVideoId } from '@squiggle/shared';
import type { VideoReport } from '../video/youtube';
import type { AnalysisResult, Finding, ScoreDomainKey } from '@squiggle/shared';

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
  /** Cumulative human-readable steps of the run, for the live activity feed. */
  notes: string[];
}

const IDLE_PROGRESS: ProgressState = { status: 'idle', message: '', progress: 0, notes: [] };

function SidepanelApp() {
  // One bus for the lifetime of the panel. Creating it per render would install
  // a duplicate runtime listener on every update.
  const busRef = useRef<TypedMessageBus | null>(null);
  if (!busRef.current) busRef.current = new TypedMessageBus('sidepanel');
  const bus = busRef.current;

  const keyStorageRef = useRef<SecureKeyStorage | null>(null);
  if (!keyStorageRef.current) keyStorageRef.current = new SecureKeyStorage();

  // The panel is one long-lived surface that many different pages pass
  // through, so "which page" cannot live in a state variable set once at
  // mount: it has to be read fresh, from a ref, inside listeners that fire
  // for the lifetime of the panel.
  const currentTabIdRef = useRef<number | null>(null);
  const lastUrlRef = useRef<string | undefined>(undefined);
  // Bumped every time the tracked tab or document changes. A response still
  // in flight for an earlier epoch describes a page that is no longer on
  // screen and must be discarded rather than painted over whatever the
  // panel has since reset to.
  const analysisEpochRef = useRef(0);
  const [tabId, setTabId] = useState<number | null>(null);
  const [report, setReport] = useState<AnalysisResult | null>(null);
  const [videoReport, setVideoReport] = useState<VideoReport | null>(null);
  // The address shown in the tracked tab, when the browser lets the panel read
  // it: it decides whether the button offers an article or a video.
  const [pageUrl, setPageUrl] = useState<string | undefined>(undefined);
  const [progress, setProgress] = useState<ProgressState>(IDLE_PROGRESS);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<FilterCategory>('all');
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [hoveredFindingId, setHoveredFindingId] = useState<string | null>(null);
  // Firefox for Android shows the panel as a popup over the page, and the page
  // under it is frozen until the popup closes: no scroll, no video player.
  const [overPage, setOverPage] = useState(false);
  const [expandedDomain, setExpandedDomain] = useState<ScoreDomainKey | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsOnOwnKey, setSettingsOnOwnKey] = useState(false);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  /** Hosted mode state: which engine, and the account behind it when signed in. */
  const [mode, setMode] = useState<AnalysisMode>('byok');
  const [hostedAccount, setHostedAccount] = useState<HostedAccount | null>(null);
  const [hostedError, setHostedError] = useState<string | null>(null);
  const [hostedBusy, setHostedBusy] = useState(false);
  const [showHostedCode, setShowHostedCode] = useState(false);
  const [askForReview, setAskForReview] = useState(false);
  // The visit earns its keep on the very first run, when the panel is empty and
  // nothing on screen says what the extension does. It opens only while it has
  // never been completed; the "?" button is the way back to it afterwards.
  const [tourOpen, setTourOpen] = useState(() => !getTourCompletionStatus().completed);

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

  /**
   * Re-read the selected engine and, in hosted mode, the account. Called at
   * mount, when the settings panel reports a change, and when the window regains
   * focus (the Chromium sign-in completes in another tab, so focus is the
   * earliest moment the new session is observable).
   */
  const refreshHostedState = useCallback(async () => {
    try {
      const activeMode = await keyStorageRef.current!.getMode();
      setMode(activeMode);
      if (activeMode !== 'hosted') {
        setHostedAccount(null);
        return;
      }
      setShowHostedCode(__TARGET__ === 'firefox');
      try {
        setHostedAccount(await fetchHostedAccount(keyStorageRef.current!));
        setHostedError(null);
      } catch (err) {
        setHostedAccount(null);
        if (err instanceof HostedAuthError && err.code !== 'not_signed_in') {
          setHostedError(err.message);
        }
      }
    } catch {
      // Storage unavailable; leave BYOK in charge.
    }
  }, []);

  const handleHostedSignIn = useCallback(async () => {
    setHostedBusy(true);
    setHostedError(null);
    try {
      // A keyless reader is still in the default BYOK mode: signing in is the
      // choice of the hosted engine, so the panel follows once they return.
      await keyStorageRef.current!.setMode('hosted');
      setMode('hosted');
      await beginHostedSignIn(keyStorageRef.current!);
      if (__TARGET__ === 'firefox') setShowHostedCode(true);
    } catch (err) {
      setHostedError(err instanceof Error ? err.message : 'La connexion a échoué.');
    } finally {
      setHostedBusy(false);
    }
  }, []);

  const handleHostedRedeem = useCallback(
    async (code: string) => {
      setHostedBusy(true);
      setHostedError(null);
      try {
        setHostedAccount(await redeemHostedCode(keyStorageRef.current!, code));
      } catch (err) {
        setHostedError(err instanceof Error ? err.message : 'La connexion a échoué.');
      } finally {
        setHostedBusy(false);
      }
    },
    []
  );

  const handleHostedSignOut = useCallback(async () => {
    setHostedBusy(true);
    try {
      await signOutHosted(keyStorageRef.current!);
      setHostedAccount(null);
    } finally {
      setHostedBusy(false);
    }
  }, []);

  /**
   * Fetch whatever the background has stored for a tab and apply it to the
   * panel. Shared between the initial mount and switching back to a tab that
   * already has its own analysis, so a stored report only ever appears
   * attributed to the tab it was actually computed for.
   */
  const hydrateTabState = useCallback(
    async (resolvedId: number | null, isStale: () => boolean) => {
      try {
        const response = (await bus.callRPC('GET_TAB_STATE', { tabId: resolvedId ?? undefined })) as {
          state?: {
            status?: Status;
            result?: AnalysisResult;
            video?: VideoReport;
            error?: string;
            currentStep?: string;
            progress?: number;
          } | null;
        };
        const state = response?.state;
        if (isStale() || !state) return;
        if (state.result) setReport(state.result);
        if (state.video) setVideoReport(state.video);
        if (state.error) setError(state.error);
        if (state.status && state.status !== 'idle') {
          setProgress({
            status: state.status,
            message: state.currentStep ?? '',
            progress: state.progress ?? 0,
            notes: [],
          });
        }
      } catch {
        // Background worker asleep; nothing to restore.
      }
    },
    [bus]
  );

  /**
   * The tracked tab or the document inside it changed. A report, an error or
   * a running progress bar all describe the page that is no longer showing,
   * so none of it can stay on screen - and bumping the epoch makes any
   * response or event still in flight for the old page a no-op when it
   * eventually arrives.
   */
  const resetForNewPage = useCallback(() => {
    analysisEpochRef.current += 1;
    setReport(null);
    setVideoReport(null);
    setError(null);
    setProgress(IDLE_PROGRESS);
    setSelectedFindingId(null);
    setHoveredFindingId(null);
  }, []);

  // Resolve the tab, hydrate any analysis already stored for it, and decide
  // whether this is a first run.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const activeTab = await UnifiedRuntime.getActiveTab();
      if (cancelled) return;
      const resolvedId = activeTab?.id ?? null;
      currentTabIdRef.current = resolvedId;
      lastUrlRef.current = activeTab?.url;
      setPageUrl(activeTab?.url);
      setTabId(resolvedId);

      await refreshKeyPresence();
      if (cancelled) return;
      await refreshHostedState();
      if (cancelled) return;

      await hydrateTabState(resolvedId, () => cancelled);
    })();

    return () => {
      cancelled = true;
    };
  }, [bus, refreshKeyPresence, refreshHostedState, hydrateTabState]);

  // The Chromium sign-in finishes in a tab of its own: the token it stores is
  // seen the moment it lands (`onChanged`), and coming back to the panel
  // (`focus`) is the fallback for a browser that reports neither promptly.
  useEffect(() => {
    const refresh = () => {
      void refreshKeyPresence();
      void refreshHostedState();
    };
    window.addEventListener('focus', refresh);
    const offChanged = keyStorageRef.current!.onChanged(refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      offChanged();
    };
  }, [refreshKeyPresence, refreshHostedState]);

  /**
   * Keep the panel pointed at the page the reader is actually looking at.
   * `onActivated` covers switching to a different tab; `onUpdated` covers
   * navigating within the same tab, including a client-side route change
   * (common on news sites) that never enters a loading phase but still
   * reports a new URL. Both are subscribed for the lifetime of the panel and
   * unsubscribed on unmount, so closing the panel never leaves a listener
   * registered against a panel instance that no longer exists.
   */
  useEffect(() => {
    let cancelled = false;

    const offActivated = UnifiedRuntime.onTabActivated(() => {
      void (async () => {
        const activeTab = await UnifiedRuntime.getActiveTab();
        if (cancelled) return;
        const nextId = activeTab?.id ?? null;
        if (nextId === currentTabIdRef.current) return;
        currentTabIdRef.current = nextId;
        lastUrlRef.current = activeTab?.url;
        setPageUrl(activeTab?.url);
        resetForNewPage();
        setTabId(nextId);
        const epochAtSwitch = analysisEpochRef.current;
        await hydrateTabState(nextId, () => cancelled || analysisEpochRef.current !== epochAtSwitch);
      })();
    });

    const offUpdated = UnifiedRuntime.onTabUpdated((updatedTabId, changeInfo) => {
      if (updatedTabId !== currentTabIdRef.current) return;
      if (!changeInfo.url || changeInfo.url === lastUrlRef.current) return;
      lastUrlRef.current = changeInfo.url;
      setPageUrl(changeInfo.url);
      resetForNewPage();
    });

    return () => {
      cancelled = true;
      offActivated();
      offUpdated();
    };
  }, [hydrateTabState, resetForNewPage]);

  // Live analysis events from the background worker, filtered to the
  // currently tracked tab: an event addressed to a tab the reader has since
  // switched away from must never repaint the panel. The same-tab case (the
  // tab id is unchanged but the document underneath it changed) is instead
  // guarded at the source - `abortPipelineForTab` on the background side
  // kills the pipeline the moment the navigation is observed.
  useEffect(() => {
    const isTrackedTab = (payloadTabId: number) => payloadTabId === currentTabIdRef.current;

    const offProgress = bus.on<{ tabId: number; status: string; message: string; progress: number; notes?: string[] }>(
      'ANALYSIS_PROGRESS',
      (payload) => {
        if (!isTrackedTab(payload.tabId)) return;
        setProgress({
          status: (payload.status === 'completed' ? 'complete' : payload.status) as Status,
          message: payload.message ?? '',
          progress: payload.progress ?? 0,
          notes: payload.notes ?? [],
        });
      }
    );

    const offComplete = bus.on<{ tabId: number; result: AnalysisResult; video?: VideoReport }>('ANALYSIS_COMPLETE', (payload) => {
      if (!isTrackedTab(payload.tabId)) return;
      setReport(payload.result);
      setVideoReport(payload.video ?? null);
      setError(null);
      setProgress({ status: 'complete', message: 'Analyse terminée', progress: 100, notes: [] });
      void claimReviewPrompt().then((ask) => {
        if (ask) setAskForReview(true);
      });
      // The run spent an analysis: the count under the report must say what is left now.
      void refreshHostedState();
    });

    const offError = bus.on<{ tabId: number; error: string }>('ANALYSIS_ERROR', (payload) => {
      if (!isTrackedTab(payload.tabId)) return;
      setError(payload.error);
      setProgress({ status: 'error', message: payload.error, progress: 0, notes: [] });
      // A refusal for an exhausted trial is the account's state: read it, so the offer shows.
      void refreshHostedState();
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
  }, [bus, refreshHostedState]);

  useEffect(() => () => bus.destroy(), [bus]);

  useEffect(() => {
    void UnifiedRuntime.isAndroid().then(setOverPage);
  }, []);

  const isVideoPage = pageUrl ? youtubeVideoId(pageUrl) !== null : false;
  const isPdf = isPdfAddress(pageUrl);

  /**
   * "Analyser ce PDF": no extension may read the browser's PDF viewer, so the
   * tab opens the extension's own page, which reads the file in this browser
   * and starts the analysis (`src/pdf/main.ts`). It fetches the file from its
   * site, whose access is asked for in the click itself, the one moment the
   * browser allows it; refused, the page offers to pick the file instead.
   */
  const openPdf = useCallback(() => {
    if (!pageUrl || tabId === null) return;
    const address = pageUrl;
    const asked = /^https?:/.test(address) ? requestSiteAccess(address) : Promise.resolve(false);
    void asked.finally(() => {
      void UnifiedRuntime.getTabs().update(tabId, { url: pdfPageUrl(address) });
      // The page is under the popup: let it be seen.
      if (overPage) window.close();
    });
  }, [pageUrl, tabId, overPage]);

  const runAnalysis = useCallback(async () => {
    // The panel is driven by live events (`ANALYSIS_PROGRESS` / `ANALYSIS_COMPLETE`
    // / `ANALYSIS_ERROR`) - the background streams progress and dispatches the
    // terminal outcome the moment it lands. The RPC here only *triggers* the run:
    // we deliberately do not await it to completion, because a research agent
    // that legitimately needs several minutes would outlive any fixed RPC
    // ceiling and die with a misleading "RPC timeout" even though the run is
    // still healthy in the background. Early "cannot start" failures (no key,
    // no article read) reject/resolve fast and are surfaced via their own
    // error events; the promise is settled only to keep the trigger honest.
    const epoch = analysisEpochRef.current;
    setError(null);
    setReport(null);
    setVideoReport(null);
    setProgress({
      status: 'extracting',
      message: isVideoPage ? 'Lecture des sous-titres de la vidéo…' : 'Extraction de l’article…',
      progress: 5,
      notes: [],
    });

    // A video is read by its own player, which cannot load captions while the
    // popup freezes its page: once the background has taken the reading over,
    // the popup gets out of the way. Reopening it shows the analysis.
    if (overPage && isVideoPage) {
      const off = bus.on<{ tabId: number }>('ANALYSIS_PROGRESS', (payload) => {
        if (payload.tabId !== tabId) return;
        off();
        window.close();
      });
    }

    try {
      const response = (await bus.callRPC('TRIGGER_ANALYSIS', { tabId: tabId ?? undefined })) as {
        success: boolean;
        result?: AnalysisResult;
        error?: string;
      };
      // No longer on screen: drop whatever the trigger resolved with.
      if (analysisEpochRef.current !== epoch) return;

      // A synchronous "could not start" (no key, page unreadable) surfaces as
      // an error event; only mirror it if no event has painted the panel yet.
      if (!response?.success && !response?.result) {
        setError(response?.error ?? 'L’analyse a échoué.');
        setProgress({ status: 'error', message: response?.error ?? 'L’analyse a échoué.', progress: 0, notes: [] });
      }
    } catch (err: unknown) {
      if (analysisEpochRef.current !== epoch) return;
      const message = err instanceof Error ? err.message : 'L’analyse a échoué.';
      setError(message);
      setProgress({ status: 'error', message, progress: 0, notes: [] });
    }
  }, [bus, tabId, isVideoPage, overPage]);

  const selectFinding = useCallback(
    (id: string | null) => {
      setSelectedFindingId(id);
      void bus
        .callRPC('SELECT_FINDING', { tabId: tabId ?? undefined, findingId: id })
        .then(() => {
          // The passage, or the moment of the video, is under the popup: show it.
          if (overPage && id) window.close();
        })
        .catch(() => {
          // Content script not injected on this page; selection stays panel-local.
        });
    },
    [bus, tabId, overPage]
  );

  const findings: Finding[] = report?.findings ?? [];
  const counts = useMemo(() => countFindingsByFilterCategory(findings), [findings]);
  const visibleFindings = useMemo(() => filterFindings(findings, category), [findings, category]);

  // A stored analysis produced under an earlier grid can name domains this build
  // no longer scores. Their weights are gone, so they are dropped rather than
  // shown against a denominator that no longer applies.
  const scoredDomains = useMemo(
    () => (report?.categories ?? []).filter((c) => c.domain in SCORE_DOMAINS),
    [report]
  );

  const busy = progress.status === 'extracting' || progress.status === 'analyzing';
  const hosted = mode === 'hosted';
  const hostedView = hosted && hostedAccount ? describeHostedAccount(hostedAccount) : null;
  const hostedCanAnalyse = hostedView?.canAnalyse ?? false;
  // The trial is spent (or a plan lapsed): the subscription, payable from the panel,
  // under the report when there is one and above the run button otherwise.
  const offer = hostedView?.needsSubscription ? (
    <SubscribeOffer
      title={hostedView.title}
      onSubscribe={async () => {
        await startHostedCheckout(keyStorageRef.current!);
      }}
    />
  ) : null;
  const canRun = hosted ? hostedCanAnalyse : hasKey !== false;
  // Hosted mode always has its card; BYOK has one only until a key is saved.
  const showHostedCard = hosted || hasKey === false;

  const openSettings = useCallback((onOwnKey: boolean) => {
    setSettingsOnOwnKey(onOwnKey);
    setSettingsOpen(true);
  }, []);

  return (
    <div className="flex flex-col min-h-screen p-4 font-sans bg-ground text-ink">
      <header className="flex items-start justify-between gap-2 pb-3 border-b border-line-soft">
        <div className="flex items-start gap-2">
          <SquiggleBadge className="mt-0.5 h-6 w-6 shrink-0" />
          <div>
            <h1 className="text-lg font-bold font-display tracking-tight text-ink">
              Squiggle
            </h1>
            <p className="text-xs text-muted">
              {isVideoPage
                ? 'Analyse critique de la fiabilité de la vidéo'
                : 'Analyse critique de la fiabilité de l’article'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setTourOpen(true)}
            aria-label="Revoir la visite guidée"
            className="rounded-lg px-2 py-1.5 text-sm text-muted hover:bg-panel-muted hover:text-ink"
          >
            ?
          </button>
          <button
            data-tour="settings"
            type="button"
            onClick={() => openSettings(false)}
            aria-label="Configurer la clé API"
            className="rounded-lg px-2 py-1.5 text-sm text-muted hover:bg-panel-muted hover:text-ink"
          >
            ⚙
          </button>
        </div>
      </header>

      <main className="flex-1 py-4 space-y-5">
        {/* A reader with no key is offered both ways in, not a dead end: the account
            with the one primary, and the own key, free, explained beside it. */}
        {showHostedCard && (
          <HostedAccountCard
            account={hostedAccount}
            error={hostedError}
            busy={hostedBusy}
            showCode={showHostedCode}
            onSignIn={() => void handleHostedSignIn()}
            onRedeem={(code) => void handleHostedRedeem(code)}
            onSignOut={() => void handleHostedSignOut()}
            onUseOwnKey={() => openSettings(true)}
            subscribeShownElsewhere={offer !== null}
          />
        )}

        {!report && offer}

        <button
          type="button"
          data-tour="run-analysis"
          onClick={isPdf ? openPdf : runAnalysis}
          disabled={busy || !canRun}
          className={`w-full rounded-xl px-3 py-3 text-sm font-semibold disabled:opacity-50 ${
            canRun
              ? 'bg-accent text-accent-foreground hover:bg-accent-hover'
              : 'border border-line text-ink/80'
          }`}
        >
          {busy
            ? 'Analyse en cours…'
            : report
            ? 'Relancer l’analyse'
            : isVideoPage
            ? 'Analyser cette vidéo'
            : isPdf
            ? 'Analyser ce PDF'
            : 'Lancer l’analyse critique'}
        </button>

        {/* A post or a forwarded message is not the page's article: the reader points at it. */}
        {!isVideoPage && !report && !busy && !error && canRun && (
          <p className="-mt-3 text-xs leading-relaxed text-muted">
            Un message ou une publication plutôt que l’article ? Sélectionnez son texte dans la page,
            puis lancez l’analyse : Squiggle lira ce passage seul.
          </p>
        )}

        {/* Most readers have already watched the video and do not want to again:
            say up front that they will not have to. */}
        {isVideoPage && !report && !busy && !error && canRun && (
          <p className="-mt-3 text-xs leading-relaxed text-muted">
            Inutile de revoir la vidéo : Squiggle active ses sous-titres un instant pour les lire
            en entier, sans toucher à votre lecture. Chaque constat portera l’heure de son passage,
            où un clic ramène la vidéo.
            {overPage &&
              ' Squiggle se ferme le temps de cette lecture, qui demande la vidéo à l’écran : ' +
                'rouvrez-le ensuite pour voir l’analyse.'}
          </p>
        )}

        {isPdf && !report && !busy && !error && canRun && (
          <p className="-mt-3 text-xs leading-relaxed text-muted">
            Squiggle ouvre ce PDF dans sa propre page, le lit dans votre navigateur et lance
            l’analyse : le fichier n’est envoyé nulle part. Les constats seront surlignés dans
            cette page.
          </p>
        )}

        {busy && (
          <div className="space-y-2" role="status" aria-live="polite">
            <div className="space-y-1.5">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-300"
                  style={{ width: `${Math.max(progress.progress, 4)}%` }}
                />
              </div>
              <p className="text-xs text-muted">{progress.message}</p>
            </div>

            {/* Live feed: what the research agent is doing right now, so a long
                run never looks stuck. Each line is one step the engine already
                took; the most recent sits at the bottom, newest-last. */}
            {progress.notes.length > 0 && (
              <ol className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-line bg-panel p-3">
                {progress.notes.map((note, idx) => (
                  <li
                    key={`${idx}-${note}`}
                    className={
                      idx === progress.notes.length - 1
                        ? 'flex gap-1.5 items-start text-xs font-medium text-ink'
                        : 'flex gap-1.5 items-start text-xs text-faint'
                    }
                  >
                    <span className="mt-0.5 shrink-0 text-faint" aria-hidden>
                      •
                    </span>
                    <span>{note}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-severity-critical/10 px-3 py-2.5 text-xs text-severity-critical-ink">
            {error}
          </div>
        )}

        {report && (
          <>
            {videoReport && (
              <p className="rounded-xl border border-line bg-panel px-3 py-2.5 text-xs leading-relaxed text-ink/80">
                Seule la parole est analysée : le texte et les images à l’écran ne le sont pas.
                {videoReport.automatic &&
                  ' Les sous-titres sont ceux que YouTube génère : un nom ou un chiffre peut y être mal transcrit.'}
              </p>
            )}
            <section className="p-4 rounded-xl bg-panel border border-line shadow-xs">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
                Évaluation globale
              </h2>
              <div className="mt-4 flex justify-center" data-tour="score-gauges">
                <ScoreGauge
                  score={report.score}
                  size={110}
                  strokeWidth={8}
                  showBandLabel
                  subject={reportSubject(report, Boolean(videoReport))}
                />
              </div>
              {report.summary && (
                <p className="mt-3 whitespace-pre-line text-xs leading-relaxed text-ink/80">
                  {report.summary}
                </p>
              )}
              {/* A report restored from an older stored analysis carries no
                  research record; saying nothing beats inventing a claim. */}
              {report.research && (
                <div data-tour="research-disclosure">
                  <ResearchDisclosure research={report.research} claims={report.claims ?? []} />
                </div>
              )}
            </section>

            {scoredDomains.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-ink">
                  Domaines évalués
                </h3>
                <div className="space-y-1.5" data-tour="domain-scores">
                  {scoredDomains.map((c) => (
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
              <h3 className="text-sm font-semibold text-ink">
                Grille des constats
              </h3>
              <div data-tour="category-filters">
                <CategoryFilterBar
                  selectedCategory={category}
                  onSelectCategory={setCategory}
                  counts={counts}
                  totalCount={findings.length}
                />
              </div>
              <div className="space-y-2.5" data-tour="finding-card">
                {visibleFindings.length === 0 ? (
                  <p className="text-xs text-muted">
                    Aucun constat dans cette catégorie.
                  </p>
                ) : (
                  visibleFindings.map((finding) => (
                    <FindingCard
                      key={finding.id}
                      finding={finding}
                      isSelected={selectedFindingId === finding.id}
                      isHovered={hoveredFindingId === finding.id}
                      videoTime={videoReport?.times[finding.id]}
                      onSeek={selectFinding}
                      onSelect={(id) => selectFinding(selectedFindingId === id ? null : id)}
                      onHover={setHoveredFindingId}
                      onReport={hosted ? (reason) => reportFinding(finding.category, reason) : undefined}
                    />
                  ))
                )}
              </div>
            </section>

            {offer ??
              (hostedView && (
                <p className="border-t border-line-soft pt-3 text-xs leading-relaxed text-muted">{hostedView.detail}</p>
              ))}
            {askForReview && <ReviewPromptCard onClose={() => setAskForReview(false)} />}
          </>
        )}

        {!report && !busy && !error && !isVideoPage && !isPdf && (hosted ? hostedCanAnalyse : hasKey !== false) && (
          <p className="text-xs leading-relaxed text-muted">
            Ouvrez un article de presse, puis lancez l’analyse. Les constats seront surlignés
            directement dans la page.
          </p>
        )}
      </main>

      <footer className="pt-3 border-t border-line-soft text-center text-xs text-faint">
        {hosted ? (
          <p className="leading-relaxed">
            Analyse assistée par IA
            {' · '}
            <a
              href={TRANSPARENCY_URL}
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-muted"
            >
              Transparence
            </a>
          </p>
        ) : report?.meta?.model ? (
          `Modèle : ${report.meta.model}`
        ) : (
          'Analyse assistée par IA'
        )}
      </footer>

      <ByokSettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        startOnOwnKey={settingsOnOwnKey}
        storage={keyStorageRef.current!}
        onSaved={() => void refreshKeyPresence()}
        onHostedChanged={() => void refreshHostedState()}
      />

      <OnboardingTour
        isOpen={tourOpen}
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
