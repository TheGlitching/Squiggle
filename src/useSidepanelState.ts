import { useState, useEffect } from 'react';
import { SidepanelState } from './types';
import { SidepanelStateManager } from './SidepanelStateManager';

export function useSidepanelState(manager: SidepanelStateManager) {
  const [state, setState] = useState<SidepanelState>(() => manager.getState());

  useEffect(() => {
    return manager.subscribe((next) => setState(next));
  }, [manager]);

  return state;
}
