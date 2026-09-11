/**
 * The account page renders one of the four states from the usage module and
 * offers only the action that state allows: subscribe, manage, or nothing.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { account as makeAccount, installFetch, jsonResponse } from './helpers';
import { Compte } from '../src/pages/Compte';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderWith(account: ReturnType<typeof makeAccount>) {
  installFetch(() => jsonResponse({ ok: true, ...account }));
  window.history.pushState({}, '', '/compte');
  return render(<Compte />);
}

describe('Compte', () => {
  it('shows an unused trial and no way to pay', async () => {
    renderWith(makeAccount({ usage: { used: 1, limit: 3, remaining: 2, resetsAt: null } }));
    expect(await screen.findByText('Analyse d’essai')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /s’abonner/i })).toBeNull();
  });

  it('shows an exhausted trial and a subscribe action', async () => {
    renderWith(makeAccount({ usage: { used: 3, limit: 3, remaining: 0, resetsAt: null } }));
    expect(await screen.findByText('Essai épuisé')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /s’abonner/i })).toBeInTheDocument();
  });

  it('shows an active subscription with its daily allowance and a manage action', async () => {
    renderWith(
      makeAccount({
        plan: 'active',
        usage: { used: 1, limit: 5, remaining: 4, resetsAt: null },
      }),
    );
    expect(await screen.findByText('Abonnement actif')).toBeInTheDocument();
    expect(screen.getByText('Il vous reste 4 analyses aujourd’hui.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /gérer ou résilier/i })).toBeInTheDocument();
  });

  it('shows an exhausted daily quota without asking to pay again', async () => {
    renderWith(
      makeAccount({ plan: 'active', usage: { used: 5, limit: 5, remaining: 0, resetsAt: 1 } }),
    );
    expect(await screen.findByText('Quota du jour atteint')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /s’abonner/i })).toBeNull();
    expect(screen.getByRole('button', { name: /gérer ou résilier/i })).toBeInTheDocument();
  });

  it('shows a lapsed plan and a subscribe action', async () => {
    renderWith(
      makeAccount({ plan: 'none', usage: { used: 0, limit: 0, remaining: 0, resetsAt: null } }),
    );
    expect(await screen.findByText('Aucun abonnement actif')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /s’abonner/i })).toBeInTheDocument();
  });

  it('invites a signed-out reader to sign in', async () => {
    installFetch(() => jsonResponse({ ok: false, error: 'invalid_session' }, 401));
    window.history.pushState({}, '', '/compte');
    render(<Compte />);
    expect(await screen.findByText(/connectez-vous pour voir votre abonnement/i)).toBeInTheDocument();
  });
});
