/**
 * Background Service Worker & Lifecycle Controller
 * Cross-browser MV3 background script for Chrome (chrome.sidePanel) and Firefox (browser.sidebarAction).
 */

import { CONTENT_SCRIPT_FILE, UnifiedRuntime } from '../messaging/runtime';
import { TypedMessageBus } from '../messaging/messageBus';
import { TabStateManager } from './tabStateManager';
import { SecureKeyStorage, UnreadableKeyError } from '../crypto/storage';
import { LLMClientFactory } from '../client/factory';
import { AnalysisPipeline, HostedApiError, youtubeVideoId, youtubeWatchUrl } from '@squiggle/shared';
import { HostedRunner, type AnalysisRunner } from '../hosted/runner';
// `PipelineProgressEvent` is exported by BOTH engine/types.ts ({step,progress})
// and engine/pipeline.ts ({status,stage,message,progress}). The star barrel makes
// the bare name ambiguous, and the types.ts variant (which this file used to
// import) has no `status` field at all. Import the real runtime shape directly.
import type { PipelineProgressEvent } from '@squiggle/shared';
import type { AnalysisResult } from '@squiggle/shared';
import { findingsToHighlightTargets, textBlockToEngineBlock } from '../adapters/findingAdapters';
import type { ExtractedArticle } from '../content/types';
import type { FcRpcMap } from '../messaging/protocol';
import {
  probePodcastPage,
  transcriptCues,
  transcriptInFeed,
  type PodcastPage,
  type PublishedTranscript,
} from '../podcast/transcript';
import { recordFinalizedAnalysis } from '../review/reviewPrompt';
import { hasSiteAccess } from '../permissions/siteAccess';
import { isSocialHost } from '../content/socialPlatform';
import {
  captureYoutubeCaptions,
  cuesToBlocks,
  findingTimes,
  seekYoutubePlayer,
  type CaptionCapture,
  type TranscriptBlock,
  type VideoReport,
} from '../video/youtube';

/**
 * Below this word count a page is a teaser rather than an article. Real French
 * press articles run well past this; paywalled previews land near a hundred
 * words, which is not enough to judge sourcing or argument structure.
 */
const MIN_ANALYSABLE_WORDS = 200;

/**
 * How long a video's reading waits for a YouTube ad to finish before giving
 * up: the player loads the video's own captions only once it is the video
 * that plays, and an ad break the reader does not skip runs to two or three
 * minutes.
 */
const VIDEO_AD_WAIT_MS = 180_000;
const VIDEO_RETRY_MS = 2_000;

/** A transcript, or the sentence telling the reader why there is none. */
/** A feed or a transcript larger than this is not a podcast's: it is not read. */
const PODCAST_MAX_BYTES = 20 * 1024 * 1024;

type VideoRead =
  | { ok: true; blocks: TranscriptBlock[]; title: string; author: string; automatic: boolean }
  | { ok: false; error?: string };

/** Firefox-only action API: MV3 replaced `browser.browserAction` with `browser.action`. */
interface FirefoxActionApi {
  onClicked: { addListener(callback: (tab: { id?: number }) => void): void };
  setPopup(details: { popup: string }): Promise<void>;
}

/** Firefox sidebar toggle API (`open` available from Firefox 136 for MV3). */
interface FirefoxSidebarApi {
  open(): Promise<void>;
}

/** Firefox-only surface not present on the Chrome-shaped `browser` type. */
interface FirefoxNamespace {
  action?: FirefoxActionApi;
  sidebarAction?: FirefoxSidebarApi;
}

/**
 * The panel page, served as the action's popup where a browser has no sidebar.
 * The path is the one `sidebar_action.default_panel` names in the manifest.
 */
const PANEL_PAGE = 'src/sidepanel/index.html';

/**
 * Narrow the polyfill global to the Firefox-only namespace. One unchecked cast,
 * hoisted here so callers never inline-cast; the guest runtime decides which
 * surface exists, so the methods are still null-checked at each call site.
 */
function firefoxNamespace(browserLike: typeof chrome | undefined): FirefoxNamespace | undefined {
  return browserLike as unknown as FirefoxNamespace | undefined;
}

export interface BackgroundServiceWorkerOptions {
  bus?: TypedMessageBus;
  stateManager?: TabStateManager;
  keyStorage?: SecureKeyStorage;
}

export class BackgroundServiceWorker {
  private bus: TypedMessageBus;
  private stateManager: TabStateManager;
  private keyStorage: SecureKeyStorage;
  private activePipelines = new Map<number, AnalysisRunner>();
  private navigationAbortedTabIds = new Set<number>();
  /** The published transcript found for the episode a tab shows, until the tab leaves it. */
  private podcasts = new Map<number, { page: PodcastPage; transcript: PublishedTranscript }>();
  private tabListenerCleanups: Array<() => void> = [];

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
    if (__TARGET__ === 'chrome') {
      // Chrome sidePanel opens the whole side panel on toolbar click; the
      // programmatic open is the fallback when setPanelBehavior is absent.
      if (typeof chrome !== 'undefined' && chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
        chrome.sidePanel
          .setPanelBehavior({ openPanelOnActionClick: true })
          .catch((err) => console.warn('Failed to setPanelBehavior on chrome.sidePanel:', err));
      }
      if (typeof chrome !== 'undefined' && chrome.action && chrome.action.onClicked) {
        chrome.action.onClicked.addListener(async (tab) => {
          if (!tab.id) return;
          await this.openSidepanel(tab.id);
        });
      }
    } else {
      // Firefox MV3: `browser.browserAction` was removed in Manifest V3 (the
      // action API is `browser.action`), so the MV2-flavoured listener is
      // dropped and the sidebar is toggled by its own action.
      const actionApi = firefoxNamespace(browser)?.action;
      // Firefox for Android has no sidebar: the same panel page opens as the
      // action's popup instead. The manifest cannot declare that popup, because
      // on the desktop a `default_popup` would take the click from the sidebar.
      // The popup lasts until the browser quits, so the background must run
      // once per launch: a startup listener is what makes Firefox start it then
      // rather than on a first click, which would find no popup and do nothing.
      void UnifiedRuntime.isAndroid().then((android) => {
        if (android) void actionApi?.setPopup({ popup: PANEL_PAGE });
      });
      UnifiedRuntime.getRuntime().onStartup?.addListener(() => {});
      if (actionApi?.onClicked) {
        actionApi.onClicked.addListener(async (tab) => {
          if (!tab.id) return;
          await this.openSidepanel(tab.id);
        });
      }
    }
  }

  public async openSidepanel(tabId: number): Promise<void> {
    if (__TARGET__ === 'chrome') {
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
      }
    } else {
      const sidebar = firefoxNamespace(browser)?.sidebarAction;
      if (sidebar?.open) {
        try {
          await sidebar.open();
        } catch (e) {
          console.warn('Unable to open browser.sidebarAction:', e);
        }
      }
    }
  }

  /**
   * Monitor tab lifecycle (closure, URL navigation, activation).
   *
   * `chrome.*` only exists on Chrome; on Firefox this whole block used to be a
   * silent no-op, so a tab closing or navigating never cleared its state or
   * stopped its analysis on that browser at all.
   */
  private setupTabListeners(): void {
    this.tabListenerCleanups.push(
      UnifiedRuntime.onTabRemoved((tabId) => {
        this.stateManager.removeTabState(tabId);
        this.abortPipelineForTab(tabId);
        this.podcasts.delete(tabId);
      })
    );

    this.tabListenerCleanups.push(
      UnifiedRuntime.onTabUpdated((tabId, changeInfo) => {
        // A full page load reports the new URL while `status` is 'loading';
        // a same-document route change (history.pushState, common on news
        // sites) never enters a loading phase but still reports the new
        // URL. Either way the document under the tab is no longer the one
        // any stored state or in-flight analysis was computed from.
        if (!changeInfo.url) return;
        this.abortPipelineForTab(tabId);
        this.podcasts.delete(tabId);
        this.stateManager.updateTabState(tabId, {
          status: 'idle',
          progress: 0,
          url: changeInfo.url,
          findings: [],
          result: undefined,
          video: undefined,
          error: undefined,
          selectedFindingId: null,
          hoveredFindingId: null,
        });
      })
    );
  }

  /**
   * Stop a tab's running analysis because the tab it was reading is gone or
   * has navigated elsewhere. `navigationAbortedTabIds` remembers this was a
   * deliberate cancellation, not a failure: `runAnalysisForTab`'s catch block
   * checks it before writing an "error" over state that was just reset, or
   * telling a panel that has already moved on that its (no longer displayed)
   * analysis failed.
   */
  private abortPipelineForTab(tabId: number): void {
    const pipeline = this.activePipelines.get(tabId);
    if (!pipeline) return;
    this.navigationAbortedTabIds.add(tabId);
    pipeline.abort();
    this.activePipelines.delete(tabId);
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
      // The panel asks the moment it opens, which is also when a just-revived worker
      // is still reading its mirror. Answering first would report idle for an
      // analysis that is about to reappear, and invite paying for it twice.
      await this.stateManager.ready;
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

    // Whether the episode this tab shows has a transcript its podcast publishes.
    this.bus.registerRPC<'PODCAST_PROBE', FcRpcMap>('PODCAST_PROBE', async (req) => {
      const found = await this.findPodcastTranscript(req.tabId);
      if (found && 'locked' in found) return { available: false, access: found.locked };
      return { available: Boolean(found), title: found?.transcript.title };
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
        const state = this.stateManager.updateTabState(targetTabId, { selectedFindingId: req.findingId });
        // A video's finding has no text in the page to scroll to: its passage
        // is a moment of the video, so the player goes there instead.
        const video = state.video;
        const at = req.findingId ? video?.times[req.findingId] : undefined;
        if (video && at !== undefined) {
          try {
            await UnifiedRuntime.runInPage(targetTabId, seekYoutubePlayer, [video.videoId, at]);
          } catch {
            // The tab has left the video; nothing to move.
          }
          return { success: true };
        }
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
   * The manifest declares no content script: the script is injected into the tab
   * the reader asked about, which `activeTab` authorises for the page they
   * invoked the extension on. So the first read of any page finds no receiver,
   * and a page that was already open when the extension loaded looks the same.
   * Ask first (a tab that already holds the script answers), inject on a miss,
   * ask again.
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

    try {
      await UnifiedRuntime.injectScript(tabId, [CONTENT_SCRIPT_FILE]);
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
   * Read a YouTube video's captions in its tab (see `src/video/youtube.ts`).
   *
   * Each call answers at once; the waiting happens here, so the panel can say
   * what it is waiting for. Two waits are legitimate: an ad, which holds the
   * video's own captions back until it ends, and a video that never started,
   * which the reader is told will be run muted for a moment before it is.
   */
  private async readVideo(tabId: number, videoId: string): Promise<VideoRead> {
    const say = (message: string) => {
      this.stateManager.updateTabState(tabId, { status: 'extracting', stage: 'extracting', progress: 5, currentStep: message });
      this.safeDispatch('ANALYSIS_PROGRESS', { tabId, status: 'extracting', stage: 'extract', message, progress: 5 });
    };
    say('Lecture des sous-titres de la vidéo…');

    const deadline = Date.now() + VIDEO_AD_WAIT_MS;
    let allowMutedStart = false;
    let notReady = 0;
    for (;;) {
      let read: CaptionCapture | undefined;
      try {
        read = await UnifiedRuntime.runInPage(tabId, captureYoutubeCaptions, [videoId, allowMutedStart]);
      } catch (err) {
        console.warn('Could not read the video page:', err);
        return {
          ok: false,
          error:
            'Impossible de lire cette page YouTube. Cliquez sur l’icône Squiggle depuis la page ' +
            'de la vidéo, ou autorisez l’accès à tous les sites dans les réglages, puis relancez.',
        };
      }
      switch (read?.kind) {
        case 'ok':
          return {
            ok: true,
            blocks: cuesToBlocks(read.cues),
            title: read.title,
            author: read.author,
            automatic: read.automatic,
          };
        case 'no_captions':
          return {
            ok: false,
            error:
              'Cette vidéo n’a pas de sous-titres, ni ceux de la chaîne ni ceux que YouTube génère : ' +
              'Squiggle analyse la parole à partir de ses sous-titres, et n’a donc rien à lire ici.',
          };
        case 'live':
          return {
            ok: false,
            error:
              'Une vidéo en direct ne peut pas être analysée pendant sa diffusion. ' +
              'Relancez l’analyse sur son enregistrement, une fois le direct terminé.',
          };
        case 'needs_start':
          say(
            'La vidéo n’a pas encore été lancée : Squiggle la démarre sans le son, le temps que ' +
              'YouTube charge ses sous-titres, puis la remet en pause.'
          );
          allowMutedStart = true;
          continue;
        case 'ad':
          say(
            'Une publicité YouTube passe avant la vidéo : les sous-titres seront lus dès qu’elle ' +
              'se termine. Si le lecteur propose de la passer, vous pouvez le faire.'
          );
          break;
        case 'not_ready':
          if (++notReady > 3) {
            return {
              ok: false,
              error: 'Le lecteur de cette vidéo n’a pas fini de charger. Attendez un instant, puis relancez.',
            };
          }
          break;
        default:
          return {
            ok: false,
            error:
              'YouTube n’a pas fourni les sous-titres de cette vidéo. Rechargez la page, ' +
              'puis relancez l’analyse.',
          };
      }
      if (Date.now() > deadline) {
        return {
          ok: false,
          error:
            'La publicité YouTube ne s’est pas terminée à temps. Passez-la ou laissez-la finir, ' +
            'puis relancez l’analyse.',
        };
      }
      await new Promise((resolve) => setTimeout(resolve, VIDEO_RETRY_MS));
      // The reader left the video while it waited: its state was already reset.
      if (youtubeVideoId((await UnifiedRuntime.getTabUrl(tabId)) ?? '') !== videoId) return { ok: false };
    }
  }

  /**
   * The transcript the podcast publishes for the episode this tab shows (see
   * `src/podcast/transcript.ts`), read from the reader's browser: the page's
   * feed, then the episode in it. Many podcast hosts do not let a page of
   * another site read their feed, an extension included: those feeds are
   * answered as `locked`, and the panel asks the reader to let it read their site.
   */
  private async findPodcastTranscript(
    tabId: number
  ): Promise<{ page: PodcastPage; transcript: PublishedTranscript } | { locked: string[] } | null> {
    const known = this.podcasts.get(tabId);
    if (known) return known;
    let page: PodcastPage | null | undefined;
    try {
      page = await UnifiedRuntime.runInPage(tabId, probePodcastPage, []);
    } catch {
      return null;
    }
    if (!page) return null;
    const locked: string[] = [];
    for (const feed of page.feeds) {
      const body = await readPublicText(feed);
      if (body === undefined && !(await hasSiteAccess(feed))) locked.push(feed);
      const transcript = body ? transcriptInFeed(body, page) : null;
      if (transcript) {
        const found = { page, transcript };
        this.podcasts.set(tabId, found);
        return found;
      }
    }
    return locked.length ? { locked } : null;
  }

  /**
   * Execute analysis pipeline for a given tab
   */
  public async runAnalysisForTab(
    tabId: number,
    options?: { articleText?: string; articleTitle?: string; podcast?: boolean; modelConfig?: any }
  ): Promise<{ success: boolean; result?: AnalysisResult; error?: string }> {
    let articleText = options?.articleText;
    let articleTitle = options?.articleTitle;
    const fail = (error: string) => {
      this.stateManager.updateTabState(tabId, { status: 'error', error });
      this.safeDispatch('ANALYSIS_ERROR', { tabId, error });
      return { success: false, error };
    };

    // The transcript an episode's podcast publishes, when the reader chose it over the page.
    let podcast: { url: string; blocks: TranscriptBlock[] } | undefined;
    if (options?.podcast && !articleText) {
      this.stateManager.updateTabState(tabId, { status: 'extracting', progress: 5, currentStep: 'Lecture de la transcription…' });
      this.safeDispatch('ANALYSIS_PROGRESS', {
        tabId,
        status: 'extracting',
        stage: 'extract',
        message: 'Lecture de la transcription publiée par le podcast…',
        progress: 5,
      });
      const lookup = await this.findPodcastTranscript(tabId);
      const found = lookup && 'transcript' in lookup ? lookup : null;
      const body = found ? await readPublicText(found.transcript.url) : null;
      const blocks = body ? cuesToBlocks(transcriptCues(body, found!.transcript.type)) : [];
      if (!found || !blocks.length) {
        return fail(
          'La transcription de cet épisode n’a pas pu être lue. Le site du podcast ne la laisse peut-être pas lire ' +
            'à une extension : autorisez l’accès à tous les sites dans les réglages, puis relancez.'
        );
      }
      podcast = { url: found.page.url, blocks };
      articleText = blocks.map((b) => b.text).join('\n\n');
      articleTitle = found.transcript.title || found.page.title;
      const words = articleText.split(/\s+/).filter(Boolean).length;
      if (words < MIN_ANALYSABLE_WORDS) {
        return fail(`La transcription de cet épisode ne compte que ${words} mots : trop peu pour juger ce qui y est affirmé.`);
      }
    }

    // 1. If article not provided, read it from the page: a YouTube video's
    // captions, or the article through the content script.
    let extracted: ExtractedArticle | undefined;
    let video: (VideoRead & { ok: true }) | undefined;
    let videoId: string | null = null;
    if (!articleText) {
      videoId = youtubeVideoId((await UnifiedRuntime.getTabUrl(tabId)) ?? '');
    }
    if (videoId) {
      const read = await this.readVideo(tabId, videoId);
      if (!read.ok) {
        // No error means the reader moved on while it waited: nothing to say.
        if (!read.error) return { success: false };
        this.stateManager.updateTabState(tabId, { status: 'error', error: read.error });
        this.safeDispatch('ANALYSIS_ERROR', { tabId, error: read.error });
        return { success: false, error: read.error };
      }
      video = read;
      articleText = read.blocks.map((b) => b.text).join('\n\n');
      articleTitle = read.title;
      const words = articleText.split(/\s+/).filter(Boolean).length;
      if (words < MIN_ANALYSABLE_WORDS) {
        const err =
          `Les sous-titres de cette vidéo ne comptent que ${words} mots : ` +
          'trop peu pour juger ce qui y est affirmé.';
        this.stateManager.updateTabState(tabId, { status: 'error', error: err });
        this.safeDispatch('ANALYSIS_ERROR', { tabId, error: err });
        return { success: false, error: err };
      }
    } else if (!articleText) {
      extracted = await this.extractArticle(tabId);
      if (extracted) {
        articleText = extracted.fullText || extracted.cleanText;
        articleTitle = extracted.metadata?.title || undefined;
        this.stateManager.updateTabState(tabId, { article: extracted });
      }
    }

    if (!articleText) {
      // Two different failures used to share one message, and the advice only fit
      // the first: an answer that came back empty means the page was read fine, so
      // telling the reader to reload it sends them round a loop that cannot help.
      const readButEmpty = Boolean(extracted);
      const err = readButEmpty
        ? 'Cette page a été lue, mais aucun article n’y a été trouvé. Squiggle ' +
          'analyse un article de presse : sur un fil de réseau social, une page ' +
          'd’accueil ou une liste de résultats, il n’y a rien à évaluer. Ouvrez ' +
          'l’article lui-même.'
        : 'Impossible de lire cette page. Le navigateur interdit aux extensions ' +
          'd’accéder à certaines pages (ses réglages, la galerie d’extensions). Sur un ' +
          'site de presse, cliquez sur l’icône Squiggle depuis la page de l’article, ou ' +
          'autorisez l’accès à tous les sites dans les réglages, puis relancez. Un PDF ' +
          'dont l’adresse ne finit pas par .pdf : enregistrez-le, puis ouvrez le fichier ' +
          'enregistré dans le navigateur, où Squiggle propose « Analyser ce PDF ».';
      this.stateManager.updateTabState(tabId, { status: 'error', error: err });
      return { success: false, error: err };
    }

    // A paywalled article yields only its teaser. Scoring those few sentences
    // would produce a confident verdict on something that is not the article,
    // which is worse than declining, so say what happened instead.
    // A selected message or a social post is short by nature, not cut short.
    const whole = extracted?.detectionMethod === 'selection' || extracted?.detectionMethod === 'social-thread';
    if (extracted && !whole && extracted.wordCount > 0 && extracted.wordCount < MIN_ANALYSABLE_WORDS) {
      // On a social page the text is short by nature, not cut short by a paywall.
      let social = false;
      try {
        social = isSocialHost(new URL((await UnifiedRuntime.getTabUrl(tabId)) ?? '').hostname);
      } catch {
        // No readable URL: keep the paywall wording.
      }
      const err = social
        ? `Seuls ${extracted.wordCount} mots ont pu être lus sur cette page : ` +
          'trop peu pour juger ce qui y est affirmé. ' +
          'Ouvrez une publication ou un fil pour lancer l’analyse, ou sélectionnez le texte à analyser.'
        : `Seuls ${extracted.wordCount} mots ont pu être lus sur cette page : ` +
          'l’article est probablement réservé aux abonnés. ' +
          'Ouvrez la version complète pour lancer l’analyse.';
      this.stateManager.updateTabState(tabId, { status: 'error', error: err });
      return { success: false, error: err };
    }

    const onProgress = (evt: PipelineProgressEvent) => {
      // The pipeline emits 'completed'; TabAnalysisState.status is
      // PipelineStatus which spells it 'complete'. Normalise at this seam so
      // the sidepanel only ever sees one spelling.
      this.stateManager.updateTabState(tabId, {
        status: evt.status === 'completed' ? 'complete' : evt.status,
        progress: evt.progress,
        currentStep: evt.message,
        stage: evt.stage,
      });

      this.safeDispatch('ANALYSIS_PROGRESS', { tabId, ...evt });
    };

    // 2. Pick the engine. One seam: hosted mode streams the same stages through
    // `HostedRunner`, BYOK keeps `AnalysisPipeline`, and everything downstream
    // (the state machine, the panel, the highlights) is unaware of the choice.
    let runner: AnalysisRunner;
    try {
      if ((await this.keyStorage.getMode()) === 'hosted') {
        const session = await this.keyStorage.getHostedSession();
        if (!session) {
          const err =
            'Le mode hébergé est activé mais vous n’êtes pas connecté. ' +
            'Connectez-vous depuis les réglages.';
          this.stateManager.updateTabState(tabId, { status: 'error', error: err });
          this.safeDispatch('ANALYSIS_ERROR', { tabId, error: err });
          return { success: false, error: err };
        }
        runner = new HostedRunner(session, onProgress);
      } else {
        const activeProvider = await this.keyStorage.getActiveProvider();
        const providerConfig = await this.keyStorage.getProviderConfig(activeProvider);
        const client = providerConfig?.apiKey
          ? LLMClientFactory.createClient(providerConfig)
          : undefined;
        if (!client) {
          const err =
            'Aucune clé API configurée. Ajoutez votre clé dans les réglages pour ' +
            'lancer une analyse de cette page.';
          this.stateManager.updateTabState(tabId, { status: 'error', error: err });
          this.safeDispatch('ANALYSIS_ERROR', { tabId, error: err });
          return { success: false, error: err };
        }
        runner = new AnalysisPipeline({ client, onProgress });
      }
    } catch (e) {
      const err =
        e instanceof UnreadableKeyError
          ? 'Votre clé API enregistrée n’a pas pu être déchiffrée. ' +
            'Saisissez-la à nouveau dans les réglages.'
          : e instanceof Error && e.message
          ? e.message
          : 'Impossible de préparer l’analyse. Vérifiez les réglages.';
      console.warn('Could not prepare the analysis engine:', e);
      this.stateManager.updateTabState(tabId, { status: 'error', error: err });
      this.safeDispatch('ANALYSIS_ERROR', { tabId, error: err });
      return { success: false, error: err };
    }

    this.activePipelines.set(tabId, runner);
    this.stateManager.updateTabState(tabId, {
      status: 'analyzing',
      stage: undefined,
      progress: 0,
      error: undefined,
    });

    try {
      const result = await runner.analyze(
        video && videoId
          ? {
              text: articleText,
              title: articleTitle,
              // One address per video, whatever page it was opened from: it is
              // the cache key, and the server reads "a transcript" from it.
              url: youtubeWatchUrl(videoId),
              author: video.author || undefined,
              outlet: 'YouTube',
              // The cue times stay here: the analysis needs the text only.
              blocks: video.blocks.map(({ id, type, text, charStart }) => ({ id, type, text, charStart })),
            }
          : podcast
          ? {
              text: articleText,
              title: articleTitle,
              url: podcast.url,
              blocks: podcast.blocks.map(({ id, type, text, charStart }) => ({ id, type, text, charStart })),
            }
          : {
              text: articleText,
              title: articleTitle,
              url: extracted?.metadata?.canonicalUrl || undefined,
              // Sending the real structure and the article's own links is what lets the
              // audit check a claim against the source the piece already cites, rather
              // than calling it unsourced.
              blocks: extracted?.blocks?.map(textBlockToEngineBlock),
              citedSources: extracted?.citedSources,
            }
      );

      const videoReport: VideoReport | undefined =
        video && videoId
          ? { videoId, automatic: video.automatic, times: findingTimes(result.findings ?? [], video.blocks) }
          : undefined;

      this.stateManager.updateTabState(tabId, {
        status: 'complete',
        progress: 100,
        result,
        findings: result.findings,
        video: videoReport,
      });

      // The content script expects FindingHighlightTarget[] (findingId, string
      // severities, snake_case categories). Posting raw engine Finding[] left
      // findingId undefined and every anchor silently failed. A video has no
      // text in the page to highlight.
      if (!videoReport && !podcast && result.findings && result.findings.length > 0) {
        try {
          await UnifiedRuntime.sendTabMessage(tabId, {
            type: 'FC_APPLY_HIGHLIGHTS',
            payload: findingsToHighlightTargets(result.findings),
          });
        } catch {
          // Non-blocking if content script not loaded
        }
      }

      // Counted before the panel hears of it, so the panel asks for a review on the run that reaches the count.
      await recordFinalizedAnalysis();
      this.safeDispatch('ANALYSIS_COMPLETE', { tabId, result, video: videoReport });
      return { success: true, result };
    } catch (err: unknown) {
      // A pipeline killed by `abortPipelineForTab` because its tab
      // navigated or closed is not a failed analysis: the tab's state was
      // already reset to idle for the new page (or removed entirely), and
      // writing an "error" here - or telling a panel that has since cleared
      // itself for a different article that its analysis failed - would
      // misattribute this run's outcome to a page it was never about.
      if (this.navigationAbortedTabIds.delete(tabId)) {
        return { success: false, error: 'Analyse interrompue : la page a changé.' };
      }
      let errorMsg = err instanceof Error ? err.message : 'Erreur lors de l’analyse critique';
      // The install was revoked, or its account deleted, from the account page:
      // the token is dead for good. Forget it so the panel falls back to the
      // sign-in state instead of failing the same way on the next analysis.
      if (err instanceof HostedApiError && err.code === 'invalid_token') {
        await this.keyStorage.clearHostedSession();
        errorMsg = 'Votre connexion a expiré. Reconnectez-vous depuis les réglages.';
      }
      this.stateManager.updateTabState(tabId, {
        status: 'error',
        error: errorMsg,
      });
      this.safeDispatch('ANALYSIS_ERROR', { tabId, error: errorMsg });
      return { success: false, error: errorMsg };
    } finally {
      // A second analysis on the same tab, started right after this one was
      // aborted, may already have installed its own pipeline under the same
      // key; only remove the entry if it is still this run's.
      if (this.activePipelines.get(tabId) === runner) {
        this.activePipelines.delete(tabId);
      }
    }
  }

  public getStateManager(): TabStateManager {
    return this.stateManager;
  }

  public destroy(): void {
    this.bus.destroy();
    for (const cleanup of this.tabListenerCleanups) cleanup();
    this.tabListenerCleanups = [];
    for (const pipeline of this.activePipelines.values()) {
      pipeline.abort();
    }
    this.activePipelines.clear();
    this.navigationAbortedTabIds.clear();
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

/**
 * A public file (a podcast's feed or transcript), read by the reader's browser
 * without its cookies; null when it is missing or too large, undefined when
 * the browser would not let the extension read it at all (no CORS, no access).
 */
async function readPublicText(url: string): Promise<string | null | undefined> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: 'omit', redirect: 'follow' });
  } catch {
    return undefined;
  }
  try {
    if (!res.ok || Number(res.headers.get('content-length') ?? 0) > PODCAST_MAX_BYTES) return null;
    const text = await res.text();
    return text.length > PODCAST_MAX_BYTES ? null : text;
  } catch {
    return null;
  }
}
