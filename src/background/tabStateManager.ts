/**
 * Tab State Manager & Analysis State Machine for Background Service Worker
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

export class TabStateManager {
  private tabStates: Map<number, TabAnalysisState> = new Map();

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
    this.tabStates.set(tabId, updated);
    return updated;
  }

  public removeTabState(tabId: number): boolean {
    return this.tabStates.delete(tabId);
  }

  public clearAll(): void {
    this.tabStates.clear();
  }

  public getAllStates(): TabAnalysisState[] {
    return Array.from(this.tabStates.values());
  }
}
