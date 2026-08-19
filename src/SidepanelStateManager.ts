import { SidepanelState, SidepanelStateAdapter } from './types';
import { InMemorySidepanelAdapter } from './adapters';

export class SidepanelStateManager {
  private adapter: SidepanelStateAdapter;

  constructor(adapter?: SidepanelStateAdapter) {
    this.adapter = adapter || new InMemorySidepanelAdapter();
  }

  public getState(): SidepanelState {
    return this.adapter.getState();
  }

  public setAnalysisState(state: SidepanelState['analysisState']): void {
    this.adapter.setState({ analysisState: state });
  }

  public setSelectedFinding(findingId: string | null): void {
    this.adapter.setState({ selectedFindingId: findingId });
  }

  public setHoveredFinding(findingId: string | null): void {
    this.adapter.setState({ hoveredFindingId: findingId });
  }

  public setActiveCategory(category: string): void {
    this.adapter.setState({ activeCategory: category });
  }

  public subscribe(listener: (state: SidepanelState) => void): () => void {
    return this.adapter.subscribe(listener);
  }
}
