export interface SidepanelState {
  analysisState: 'IDLE' | 'LOADING' | 'READY' | 'ERROR';
  activeCategory: string;
  selectedFindingId: string | null;
  hoveredFindingId: string | null;
  activeTabId: number | null;
  error: string | null;
}

export interface SidepanelStateAdapter {
  getState(): SidepanelState;
  setState(state: Partial<SidepanelState>): void;
  subscribe(listener: (state: SidepanelState) => void): () => void;
}
