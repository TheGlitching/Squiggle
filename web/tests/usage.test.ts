/**
 * The four account states the product defines, as text. This is where the
 * reader is told whether they can analyse, must pay, or must wait for the
 * counter to reset.
 */
import { describe, expect, it } from 'vitest';

import { account } from './helpers';
import { describeAccount } from '../src/usage';

describe('describeAccount', () => {
  it('reports an unused trial as analysable', () => {
    const view = describeAccount(account());
    expect(view.state).toBe('trial');
    expect(view.canAnalyse).toBe(true);
    expect(view.needsSubscription).toBe(false);
  });

  it('reports an exhausted trial as needing a subscription', () => {
    const view = describeAccount(
      account({ usage: { used: 3, limit: 3, remaining: 0, resetsAt: null } }),
    );
    expect(view.state).toBe('trial_exhausted');
    expect(view.canAnalyse).toBe(false);
    expect(view.needsSubscription).toBe(true);
  });

  it('reports an active plan with remaining analyses', () => {
    const view = describeAccount(
      account({
        plan: 'active',
        planExpiresAt: Date.UTC(2026, 0, 1),
        usage: { used: 1, limit: 5, remaining: 4, resetsAt: Date.UTC(2026, 0, 2) },
      }),
    );
    expect(view.state).toBe('active');
    expect(view.canAnalyse).toBe(true);
    expect(view.detail).toContain('4');
  });

  it('reports an active plan whose daily quota is exhausted', () => {
    const view = describeAccount(
      account({ plan: 'active', usage: { used: 5, limit: 5, remaining: 0, resetsAt: 1 } }),
    );
    expect(view.state).toBe('quota_exhausted');
    expect(view.canAnalyse).toBe(false);
    expect(view.needsSubscription).toBe(false);
  });

  it('reports a lapsed plan as needing a subscription', () => {
    const view = describeAccount(
      account({ plan: 'none', usage: { used: 0, limit: 0, remaining: 0, resetsAt: null } }),
    );
    expect(view.state).toBe('lapsed');
    expect(view.canAnalyse).toBe(false);
    expect(view.needsSubscription).toBe(true);
  });
});
