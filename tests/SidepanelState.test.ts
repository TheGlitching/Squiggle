import { describe, it, expect } from 'vitest';
import { SidepanelStateManager } from '../src/SidepanelStateManager';

describe('SidepanelStateManager', () => {
  it('initializes with default state', () => {
    const manager = new SidepanelStateManager();
    const state = manager.getState();
    expect(state.analysisState).toBe('IDLE');
    expect(state.activeCategory).toBe('ALL');
    expect(state.selectedFindingId).toBeNull();
  });

  it('updates state and notifies subscribers', () => {
    const manager = new SidepanelStateManager();
    let latestState = manager.getState();
    const unsubscribe = manager.subscribe((state) => {
      latestState = state;
    });

    manager.setAnalysisState('LOADING');
    expect(latestState.analysisState).toBe('LOADING');

    manager.setSelectedFinding('finding-123');
    expect(latestState.selectedFindingId).toBe('finding-123');

    unsubscribe();
    manager.setSelectedFinding(null);
    expect(latestState.selectedFindingId).toBe('finding-123');
  });
});
