/**
 * Background Service Worker & Lifecycle Controller
 * Cross-browser MV3 background script for Chrome (chrome.sidePanel) and Firefox (browser.sidebarAction).
 */

import { UnifiedRuntime } from '../messaging/runtime';
import { TypedMessageBus } from '../messaging/messageBus';
import { TabStateManager } from './tabStateManager';
import { SecureKeyStorage } from '../crypto/storage';
import { LLMClientFactory } from '../client/factory';
import { AnalysisPipeline } from '../engine';
// `PipelineProgressEvent` is exported by BOTH engine/types.ts ({step,progress})
// and engine/pipeline.ts ({status,stage,message,progress}). The star barrel makes
// the bare name ambiguous, and the types.ts variant (which this file used to
// import) has no `status` field at all. Import the real runtime shape directly.
import type { PipelineProgressEvent } from '../engine/pipeline';
import type { AnalysisResult } from '../engine/types';
import { findingsToHighlightTargets } from '../adapters/findingAdapters';
import type { ExtractedArticle } from '../content/types';
import type { FcRpcMap } from '../messaging/protocol';

/**
 * Below this word count a page is a teaser rather than an article. Real French
 * press articles run well past this; paywalled previews land near a hundred
 * words, which is not enough to judge sourcing or argument structure.
 */
const MIN_ANALYSABLE_WORDS = 200;

export interface BackgroundServiceWorkerOptions {
  bus?: TypedMessageBus;
  stateManager?: TabStateManager;
  keyStorage?: SecureKeyStorage;
}

export class BackgroundServiceWorker {
  private bus: TypedMessageBus;
  private stateManager: TabStateManager;
  private keyStorage: SecureKeyStorage;
  private activePipelines = new Map<number, AnalysisPipeline>();

  constructor(options?: BackgroundServiceWorkerOptions) {
    this.bus = options?.bus || new TypedMessageBus('background');
    this.stateManager = options?.stateManager || new TabStateManager();
    this.keyStorage = options?.keyStorage || new SecureKeyStorage();
  }

  public init(): void {
    this.setupSidepanelAction();
    this.setupTabListeners();
    this.setupRPCHandlers();
    this.setupEventForwarding();
  }

  /**
   * Configure browser action & sidepanel behavior for Chrome and Firefox MV3
   */
  public setupSidepanelAction(): void {
    // Chrome sidePanel setup
    if (typeof chrome !== 'undefined' && chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
      chrome.sidePanel
        .setPanelBehavior({ openPanelOnActionClick: true })
        .catch((err) => console.warn('Failed to setPanelBehavior on chrome.sidePanel:', err));
    }

    // Fallback or Firefox action click handler
    if (typeof chrome !== 'undefined' && chrome.action && chrome.action.onClicked) {
      chrome.action.onClicked.addListener(async (tab) => {
        if (!tab.id) return;
        await this.openSidepanel(tab.id);
      });
    } else if (typeof browser !== 'undefined' && (browser as any).browserAction?.onClicked) {
      (browser as any).browserAction.onClicked.addListener(async (tab: any) => {
        if (!tab.id) return;
        await this.openSidepanel(tab.id);
      });
    }
  }

  public async openSidepanel(tabId: number): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.sidePanel && chrome.sidePanel.open) {
      try {
        await chrome.sidePanel.open({ tabId });
      } catch {
        try {
          await chrome.sidePanel.open({ windowId: (await chrome.tabs.get(tabId)).windowId });
        } catch (e) {
          console.warn('Unable to open chrome.sidePanel:', e);
        }
      }
    } else if (typeof browser !== 'undefined' && (browser as any).sidebarAction?.open) {
      try {
        await (browser as any).sidebarAction.open();
      } catch (e) {
        console.warn('Unable to open browser.sidebarAction:', e);
      }
    }
  }

  /**
   * Monitor tab lifecycle (closure, URL navigation, activation)
   */
  private setupTabListeners(): void {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.onRemoved?.addListener((tabId) => {
        this.stateManager.removeTabState(tabId);
        const pipeline = this.activePipelines.get(tabId);
        if (pipeline) {
          pipeline.abort();
          this.activePipelines.delete(tabId);
        }
      });

      chrome.tabs.onUpdated?.addListener((tabId, changeInfo) => {
        if (changeInfo.status === 'loading' && changeInfo.url) {
          this.stateManager.updateTabState(tabId, {
            status: 'idle',
            progress: 0,
            url: changeInfo.url,
            findings: [],
            result: undefined,
            error: undefined,
            selectedFindingId: null,
            hoveredFindingId: null,
          });
        }
      });
    }
  }

  /**
   * Setup RPC endpoints accessible from sidepanel or content scripts
   */
  private setupRPCHandlers(): void {
    // Get current tab analysis state
    this.bus.registerRPC<'GET_TAB_STATE', FcRpcMap>('GET_TAB_STATE', async (req) => {
      let targetTabId = req?.tabId;
      if (!targetTabId) {
        const activeTab = await UnifiedRuntime.getActiveTab();
        targetTabId = activeTab?.id;
      }
      if (!targetTabId) return { state: null };
      const state = this.stateManager.getTabState(targetTabId);
      return { state: state || this.stateManager.getOrCreateTabState(targetTabId) };
    });

    // Start / Trigger analysis on target tab
    this.bus.registerRPC<'TRIGGER_ANALYSIS', FcRpcMap>('TRIGGER_ANALYSIS', async (req) => {
      let targetTabId = req?.tabId;
      if (!targetTabId) {
        const activeTab = await UnifiedRuntime.getActiveTab();
        targetTabId = activeTab?.id;
      }
      if (!targetTabId) throw new Error('No target tab specified or found');

      return await this.runAnalysisForTab(targetTabId, req);
    });

    // Cancel / Abort analysis on target tab
    this.bus.registerRPC<'CANCEL_ANALYSIS', FcRpcMap>('CANCEL_ANALYSIS', async (req) => {
      const pipeline = this.activePipelines.get(req.tabId);
      if (pipeline) {
        pipeline.abort();
        this.activePipelines.delete(req.tabId);
      }
      this.stateManager.updateTabState(req.tabId, {
        status: 'idle',
        error: 'Analysis aborted by user',
      });
      return { success: true };
    });

    // Sync finding selection and highlights
    this.bus.registerRPC<'SELECT_FINDING', FcRpcMap>('SELECT_FINDING', async (req) => {
      let targetTabId = req?.tabId;
      if (!targetTabId) {
        const activeTab = await UnifiedRuntime.getActiveTab();
        targetTabId = activeTab?.id;
      }
      if (targetTabId) {
        this.stateManager.updateTabState(targetTabId, { selectedFindingId: req.findingId });
        // Relay to content script
        try {
          await UnifiedRuntime.sendTabMessage(targetTabId, {
            type: req.findingId ? 'FC_SCROLL_TO_HIGHLIGHT' : 'FC_UNHOVER_HIGHLIGHT',
            payload: { findingId: req.findingId },
          });
        } catch {
          // Tab may not have content script injected yet
        }
      }
      return { success: true };
    });
  }

  /**
   * `bus.dispatch` awaits runtime.sendMessage, which rejects with
   * "Could not establish connection" whenever no other context is listening -
   * i.e. every time the sidepanel is closed. These are fire-and-forget
   * notifications, so swallow that specific failure instead of emitting an
   * unhandled rejection on every progress tick.
   */
  private safeDispatch(type: string, payload: unknown): void {
    void this.bus.dispatch(type, payload).catch(() => {
      // No listening context; nothing to notify.
    });
  }

  /**
   * Setup unidirectional events & highlight sync forwarding
   */
  private setupEventForwarding(): void {
    // When content script sends FC_HIGHLIGHT_CLICKED or FC_HIGHLIGHT_HOVERED
    this.bus.on('FC_HIGHLIGHT_CLICKED', (payload: { findingId?: string }, sender) => {
      const tabId = sender.tab?.id;
      if (tabId) {
        this.stateManager.updateTabState(tabId, { selectedFindingId: payload?.findingId });
      }
      this.safeDispatch('FC_SIDEBAR_FINDING_SELECTED', { ...payload, tabId });
    });

    this.bus.on('FC_HIGHLIGHT_HOVERED', (payload: { findingId?: string }, sender) => {
      const tabId = sender.tab?.id;
      if (tabId) {
        this.stateManager.updateTabState(tabId, { hoveredFindingId: payload?.findingId });
      }
      this.safeDispatch('FC_SIDEBAR_FINDING_HOVERED', { ...payload, tabId });
    });
  }

  /**
   * Ask the page's content script for the article.
   *
   * A content script declared in the manifest is only injected into pages loaded
   * *after* the extension was installed or reloaded, so any tab already open at
   * that moment has no receiver and every analysis on it fails. Rather than
   * blaming the article, inject the script on demand and ask again.
   */
  private async extractArticle(tabId: number): Promise<ExtractedArticle | undefined> {
    const ask = async (): Promise<ExtractedArticle | undefined> => {
      const resp = await UnifiedRuntime.sendTabMessage<{
        success: boolean;
        data?: ExtractedArticle;
      }>(tabId, { type: 'FC_EXTRACT_CONTENT' });
      return resp?.success && resp.data ? resp.data : undefined;
    };

    try {
      return await ask();
    } catch {
      // No receiver in the page. Fall through to injection.
    }

    const files = UnifiedRuntime.getManifest()?.content_scripts?.[0]?.js ?? [];
    if (!files.length) return undefined;

    try {
      await UnifiedRuntime.injectScript(tabId, files);
    } catch (err) {
      console.warn('Could not inject the content script into the tab:', err);
      return undefined;
    }

    try {
      return await ask();
    } catch (err) {
      console.warn('Content script still unreachable after injection:', err);
      return undefined;
    }
  }

  /**
   * Execute analysis pipeline for a given tab
   */
  public async runAnalysisForTab(
    tabId: number,
    options?: { articleText?: string; articleTitle?: string; modelConfig?: any }
  ): Promise<{ success: boolean; result?: AnalysisResult; error?: string }> {
    let articleText = options?.articleText;
    let articleTitle = options?.articleTitle;

    // 1. If article not provided, request extraction from the content script.
    let extracted: ExtractedArticle | undefined;
    if (!articleText) {
      extracted = await this.extractArticle(tabId);
      if (extracted) {
        articleText = extracted.fullText || extracted.cleanText;
        articleTitle = extracted.metadata?.title || undefined;
        this.stateManager.updateTabState(tabId, { article: extracted });
      }
    }

    if (!articleText) {
      // The content script never answered, even after re-injection. The usual
      // cause is a page the browser will not let the extension touch at all
      // (its own settings pages, the extension gallery, a PDF viewer).
      const err =
        'Impossible de lire cette page. Ouvrez un article sur un site de presse, ' +
        'puis rechargez la page avant de relancer l’analyse.';
      this.stateManager.updateTabState(tabId, { status: 'error', error: err });
      return { success: false, error: err };
    }

    // A paywalled article yields only its teaser. Scoring those few sentences
    // would produce a confident verdict on something that is not the article,
    // which is worse than declining, so say what happened instead.
    if (extracted && extracted.wordCount > 0 && extracted.wordCount < MIN_ANALYSABLE_WORDS) {
      const err =
        `Seuls ${extracted.wordCount} mots ont pu être lus sur cette page : ` +
        'l’article est probablement réservé aux abonnés. ' +
        'Ouvrez la version complète pour lancer l’analyse.';
      this.stateManager.updateTabState(tabId, { status: 'error', error: err });
      return { success: false, error: err };
    }

    // 2. Initialize KeyStorage & Client
    let client;
    try {
      const activeProvider = await this.keyStorage.getActiveProvider();
      const providerConfig = await this.keyStorage.getProviderConfig(activeProvider);
      if (providerConfig && providerConfig.apiKey) {
        client = LLMClientFactory.createClient(providerConfig);
      }
    } catch (e) {
      console.warn('Failed to load active BYOK key:', e);
    }

    const pipeline = new AnalysisPipeline({
      client,
      demoMode: !client,
      onProgress: (evt: PipelineProgressEvent) => {
        // The pipeline emits 'completed'; TabAnalysisState.status is
        // PipelineStatus which spells it 'complete'. Normalise at this seam so
        // the sidepanel only ever sees one spelling.
        this.stateManager.updateTabState(tabId, {
          status: evt.status === 'completed' ? 'complete' : evt.status,
          progress: evt.progress,
          currentStep: evt.message,
        });

        this.safeDispatch('ANALYSIS_PROGRESS', { tabId, ...evt });
      },
    });

    this.activePipelines.set(tabId, pipeline);
    this.stateManager.updateTabState(tabId, {
      status: 'analyzing',
      progress: 0,
      error: undefined,
    });

    try {
      const result = await pipeline.analyze({
        text: articleText,
        title: articleTitle,
      });

      this.stateManager.updateTabState(tabId, {
        status: 'complete',
        progress: 100,
        result,
        findings: result.findings,
      });

      // The content script expects FindingHighlightTarget[] (findingId, string
      // severities, snake_case categories). Posting raw engine Finding[] left
      // findingId undefined and every anchor silently failed.
      if (result.findings && result.findings.length > 0) {
        try {
          await UnifiedRuntime.sendTabMessage(tabId, {
            type: 'FC_APPLY_HIGHLIGHTS',
            payload: findingsToHighlightTargets(result.findings),
          });
        } catch {
          // Non-blocking if content script not loaded
        }
      }

      this.safeDispatch('ANALYSIS_COMPLETE', { tabId, result });
      return { success: true, result };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Erreur lors de l’analyse critique';
      this.stateManager.updateTabState(tabId, {
        status: 'error',
        error: errorMsg,
      });
      this.safeDispatch('ANALYSIS_ERROR', { tabId, error: errorMsg });
      return { success: false, error: errorMsg };
    } finally {
      this.activePipelines.delete(tabId);
    }
  }

  public getStateManager(): TabStateManager {
    return this.stateManager;
  }

  public destroy(): void {
    this.bus.destroy();
    for (const pipeline of this.activePipelines.values()) {
      pipeline.abort();
    }
    this.activePipelines.clear();
    this.stateManager.clearAll();
  }
}

let serviceWorkerInstance: BackgroundServiceWorker | null = null;
if (typeof chrome !== 'undefined' && chrome?.runtime) {
  serviceWorkerInstance = new BackgroundServiceWorker();
  serviceWorkerInstance.init();
} else if (typeof browser !== 'undefined' && (browser as unknown as { runtime: unknown })?.runtime) {
  serviceWorkerInstance = new BackgroundServiceWorker();
  serviceWorkerInstance.init();
}

export { serviceWorkerInstance as serviceWorker };
export * from './tabStateManager';
