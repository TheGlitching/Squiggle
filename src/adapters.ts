import { SidepanelState, SidepanelStateAdapter } from './types';

export class InMemorySidepanelAdapter implements SidepanelStateAdapter {
  private state: SidepanelState = {
    analysisState: 'IDLE',
    activeCategory: 'ALL',
    selectedFindingId: null,
    hoveredFindingId: null,
    activeTabId: null,
    error: null,
  };
  private listeners: Set<(state: SidepanelState) => void> = new Set();

  getState(): SidepanelState {
    return { ...this.state };
  }

  setState(partial: Partial<SidepanelState>): void {
    this.state = { ...this.state, ...partial };
    this.notify();
  }

  subscribe(listener: (state: SidepanelState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const s = this.getState();
    this.listeners.forEach((l) => l(s));
  }
}
