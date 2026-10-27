/**
 * The account page renders one of the four states from the usage module and
 * offers only the action that state allows: subscribe, manage, or nothing.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { account as makeAccount, installFetch, jsonResponse } from './helpers';
import { Compte } from '../src/pages/Compte';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** The account read, plus an empty installs list for the data section. */
function installAccountFetch(account: ReturnType<typeof makeAccount>) {
  installFetch((call) =>
    call.url.endsWith('/web/account/installs')
      ? jsonResponse({ ok: true, installs: [] })
      : jsonResponse({ ok: true, ...account }),
  );
}

function renderWith(account: ReturnType<typeof makeAccount>) {
  installAccountFetch(account);
  window.history.pushState({}, '', '/compte');
  return render(<Compte />);
}

describe('Compte', () => {
  it('lets a reader subscribe during the trial, before the free analyses run out', async () => {
    renderWith(makeAccount({ usage: { used: 1, limit: 3, remaining: 2, resetsAt: null } }));
    expect(await screen.findByText('Analyse d’essai')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /s’abonner : 4,99 €\/mois/i })).toBeInTheDocument();
  });

  it('only starts checkout once the reader asks for the service to start immediately', async () => {
    renderWith(makeAccount({ usage: { used: 1, limit: 3, remaining: 2, resetsAt: null } }));
    const subscribe = await screen.findByRole('button', { name: /s’abonner/i });
    expect(subscribe).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /commence dès le paiement/ }));
    expect(subscribe).toBeEnabled();
    expect(screen.getByRole('link', { name: 'Conditions de vente' })).toHaveAttribute('href', '/cgv');
    expect(screen.getByText(/TVA non applicable, art\. 293 B du CGI/)).toBeInTheDocument();
  });

  it('shows an exhausted trial and a subscribe action', async () => {
    renderWith(makeAccount({ usage: { used: 3, limit: 3, remaining: 0, resetsAt: null } }));
    expect(await screen.findByText('Essai épuisé')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /s’abonner/i })).toBeInTheDocument();
  });

  it('shows an active subscription with what is left this period and a manage action', async () => {
    renderWith(
      makeAccount({
        plan: 'active',
        usage: { used: 1, limit: 60, remaining: 59, resetsAt: null },
      }),
    );
    expect(await screen.findByText('Abonnement actif')).toBeInTheDocument();
    expect(screen.getByText('Il vous reste 59 analyses ce mois-ci.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /gérer ou résilier/i })).toBeInTheDocument();
  });

  it('shows an exhausted monthly quota, with the renewal date, without asking to pay again', async () => {
    const renewal = Date.UTC(2026, 10, 26, 12);
    renderWith(
      makeAccount({
        plan: 'active',
        planExpiresAt: renewal,
        usage: { used: 60, limit: 60, remaining: 0, resetsAt: renewal },
      }),
    );
    expect(await screen.findByText('Quota du mois atteint')).toBeInTheDocument();
    expect(screen.getByText('Vos 60 analyses de ce mois sont utilisées. Le compteur repart le 26 novembre.')).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Analyses restantes' })).toHaveAttribute('aria-valuemax', '60');
    expect(screen.getByText('analyse restante sur 60')).toBeInTheDocument();
    expect(screen.getByText('Renouvellement le 26 novembre 2026')).toBeInTheDocument();
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

  it('shows the activation banner only until the plan is active', async () => {
    window.history.pushState({}, '', '/compte?paiement=ok');
    installAccountFetch(makeAccount());
    const pending = render(<Compte />);
    expect(await screen.findByText(/en cours d’activation/)).toBeInTheDocument();
    pending.unmount();

    installAccountFetch(
      makeAccount({ plan: 'active', usage: { used: 0, limit: 60, remaining: 60, resetsAt: null } }),
    );
    window.history.pushState({}, '', '/compte?paiement=ok');
    render(<Compte />);
    expect(await screen.findByText('Merci ! Votre abonnement est actif.')).toBeInTheDocument();
    expect(screen.queryByText(/en cours d’activation/)).toBeNull();
  });

  it('offers an academic address the teacher access instead of the paid subscription', async () => {
    const { calls } = installFetch((call) => {
      if (call.url.endsWith('/web/account/installs')) return jsonResponse({ ok: true, installs: [] });
      if (call.url.endsWith('/web/account/teacher-checkout')) {
        return jsonResponse({ ok: true, url: 'https://checkout.stripe.example/teacher' });
      }
      return jsonResponse({ ok: true, ...makeAccount({ email: 'marie@ac-lyon.fr', teacherOffer: true }) });
    });
    window.history.pushState({}, '', '/compte');
    render(<Compte />);

    const access = await screen.findByRole('button', { name: 'Accès enseignant' });
    expect(screen.queryByRole('button', { name: /s’abonner/i })).toBeNull();
    expect(screen.getByText(/gratuit jusqu’au 30 juin/)).toBeInTheDocument();
    // Nothing is paid, so there is no immediate-start request to tick first.
    expect(access).toBeEnabled();
    fireEvent.click(access);
    await vi.waitFor(() => expect(calls.some((c) => c.url.endsWith('/web/account/teacher-checkout'))).toBe(true));
  });

  it('invites a signed-out reader to sign in', async () => {
    installFetch(() => jsonResponse({ ok: false, error: 'invalid_session' }, 401));
    window.history.pushState({}, '', '/compte');
    render(<Compte />);
    expect(await screen.findByText(/connectez-vous pour voir votre abonnement/i)).toBeInTheDocument();
  });
});
