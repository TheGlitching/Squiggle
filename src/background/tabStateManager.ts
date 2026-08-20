/**
 * Tab State Manager & Analysis State Machine for Background Service Worker
 *
 * An MV3 service worker is terminated after a short idle period, so a Map alone
 * loses every finished analysis the moment the browser decides the worker is not
 * busy. Coming back to a tab minutes later then showed an empty panel, and the only
 * way to see the report again was to pay for it again.
 *
 * State is therefore mirrored into `storage.session`, which survives the worker but
 * lives in memory and is discarded when the browser closes. That distinction is the
 * point: a report quotes the article and names the page, so keeping it on disk would
 * amount to a durable record of what was read, which PRIVACY.md promises the
 * extension does not keep. Session storage buys back the lost work without making
 * that promise false. It also needs no permission beyond the `storage` already
 * declared, and Firefox has it from 115, which is the manifest's floor.
 */

import { AnalysisResult, Finding, PipelineStatus } from '../engine/types';
import type { ExtractedArticle } from '../content/types';

export interface TabAnalysisState {
  tabId: number;
  url?: string;
  title?: string;
  status: PipelineStatus | 'idle';
  progress: number;
  currentStep?: string;
  article?: ExtractedArticle;
  findings?: Finding[];
  result?: AnalysisResult;
  error?: string;
  selectedFindingId?: string | null;
  hoveredFindingId?: string | null;
  lastUpdated: number;
}

/** Enough to cover the tabs a reader juggles, bounded so the quota cannot run away. */
const MAX_CACHED_TABS = 25;
const SESSION_KEY = 'squiggle_tab_states';

type PersistedState = Omit<TabAnalysisState, 'article'>;

/** `storage.session` where the browser offers it, otherwise nothing to mirror into. */
function sessionArea(): chrome.storage.StorageArea | undefined {
  const area = (globalThis as { chrome?: typeof chrome }).chrome?.storage?.session;
  return area && typeof area.get === 'function' ? area : undefined;
}

export class TabStateManager {
  private tabStates: Map<number, TabAnalysisState> = new Map();
  /** Resolves once the mirror has been read, so a restart can await it. */
  public readonly ready: Promise<void>;

  constructor() {
    this.ready = this.hydrate();
  }

  private async hydrate(): Promise<void> {
    const area = sessionArea();
    if (!area) return;
    try {
      const stored = await area.get([SESSION_KEY]);
      const states = stored?.[SESSION_KEY] as PersistedState[] | undefined;
      if (!Array.isArray(states)) return;
      for (const state of states) {
        // A live entry always wins: the worker may have moved on while this read
        // was in flight, and the mirror is the older of the two by definition.
        if (typeof state?.tabId === 'number' && !this.tabStates.has(state.tabId)) {
          this.tabStates.set(state.tabId, state as TabAnalysisState);
        }
      }
    } catch {
      // A mirror that cannot be read costs a re-analysis, never a broken panel.
    }
  }

  /**
   * The extracted article is deliberately dropped rather than mirrored. It is by far
   * the largest field, nothing reads it once the analysis is done, and the findings
   * carry the block ids that in-page highlighting resolves against a fresh read.
   *
   * Recency comes from the Map's insertion order, which `touch` maintains, and not
   * from `lastUpdated`: two analyses finishing in the same millisecond carry equal
   * timestamps, and sorting on them evicted the newest entries instead of the oldest.
   */
  private persist(): void {
    const area = sessionArea();
    if (!area) return;

    const inTouchOrder = Array.from(this.tabStates.values());
    const kept = inTouchOrder
      .slice(-MAX_CACHED_TABS)
      .map(({ article: _article, ...rest }) => rest);

    void Promise.resolve(area.set({ [SESSION_KEY]: kept })).catch(() => {
      // Over quota or unavailable: the in-memory map is still correct.
    });
  }

  public getOrCreateTabState(tabId: number, initial?: Partial<TabAnalysisState>): TabAnalysisState {
    let state = this.tabStates.get(tabId);
    if (!state) {
      state = {
        tabId,
        status: 'idle',
        progress: 0,
        lastUpdated: Date.now(),
        ...initial,
      };
      this.tabStates.set(tabId, state);
    }
    return state;
  }

  public getTabState(tabId: number): TabAnalysisState | undefined {
    return this.tabStates.get(tabId);
  }

  public updateTabState(tabId: number, updates: Partial<TabAnalysisState>): TabAnalysisState {
    const existing = this.getOrCreateTabState(tabId);
    const updated: TabAnalysisState = {
      ...existing,
      ...updates,
      lastUpdated: Date.now(),
    };
    // Re-inserting moves this tab to the end, which is what makes insertion order
    // mean "least recently touched first" for the bound in `persist`.
    this.tabStates.delete(tabId);
    this.tabStates.set(tabId, updated);
    this.persist();
    return updated;
  }

  public removeTabState(tabId: number): boolean {
    const removed = this.tabStates.delete(tabId);
    if (removed) this.persist();
    return removed;
  }

  public clearAll(): void {
    this.tabStates.clear();
    this.persist();
  }

  public getAllStates(): TabAnalysisState[] {
    return Array.from(this.tabStates.values());
  }
}
