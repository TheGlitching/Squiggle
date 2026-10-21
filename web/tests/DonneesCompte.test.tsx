/**
 * "Données et compte": revoke an install, change the address, erase the
 * account. Each test drives the whole account page against a stubbed API and
 * checks both what the reader sees and what was (or was not) sent.
 */
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { account as makeAccount, installFetch, jsonResponse, type Call } from './helpers';
import { Compte } from '../src/pages/Compte';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const INSTALLS = [
  { id: 'k2', createdAt: Date.UTC(2026, 9, 12, 12), expiresAt: Date.UTC(2027, 0, 10, 12) },
  { id: 'k1', createdAt: Date.UTC(2026, 8, 1, 12), expiresAt: Date.UTC(2026, 11, 1, 12) },
];

interface Routes {
  installs?: typeof INSTALLS;
  respond?: (call: Call) => Response | undefined;
}

function renderCompte(path = '/compte', routes: Routes = {}) {
  const fetchState = installFetch((call) => {
    const custom = routes.respond?.(call);
    if (custom) return custom;
    if (call.url.endsWith('/web/account/installs')) {
      return jsonResponse({ ok: true, installs: routes.installs ?? INSTALLS });
    }
    if (call.url.endsWith('/installs/revoke')) return jsonResponse({ ok: true });
    if (call.url.endsWith('/web/account')) return jsonResponse({ ok: true, ...makeAccount() });
    return undefined;
  });
  window.history.pushState({}, '', path);
  render(<Compte />);
  return fetchState;
}

function posted(calls: Call[], suffix: string): Call[] {
  return calls.filter((c) => c.method === 'POST' && c.url.endsWith(suffix));
}

describe('extensions connectées', () => {
  it('lists the installs and revokes the one the reader picks', async () => {
    const user = userEvent.setup();
    const { calls } = renderCompte();

    const list = await screen.findByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Extension connectée le 12 octobre 2026')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Révoquer l’extension connectée le 12 octobre 2026' }));

    await waitFor(() => expect(posted(calls, '/web/account/installs/revoke')).toHaveLength(1));
    expect(posted(calls, '/web/account/installs/revoke')[0].body).toEqual({ id: 'k2' });
    expect(await screen.findByText(/extension révoquée/i)).toBeInTheDocument();
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(1);
    expect(screen.queryByText('Extension connectée le 12 octobre 2026')).toBeNull();
  });

  it('says so when no extension is connected', async () => {
    renderCompte('/compte', { installs: [] });
    expect(await screen.findByText('Aucune extension connectée.')).toBeInTheDocument();
  });

  it('treats an install already revoked elsewhere as done, not as an error', async () => {
    const user = userEvent.setup();
    renderCompte('/compte', {
      respond: (call) =>
        call.url.endsWith('/installs/revoke') ? jsonResponse({ ok: false, error: 'not_found' }, 404) : undefined,
    });
    await user.click(await screen.findByRole('button', { name: /révoquer l’extension connectée le 12 octobre/i }));
    expect(await screen.findByText('Cette extension était déjà révoquée.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a failed revocation and keeps the install listed', async () => {
    const user = userEvent.setup();
    renderCompte('/compte', {
      respond: (call) =>
        call.url.endsWith('/installs/revoke') ? jsonResponse({ ok: false, error: 'internal' }, 500) : undefined,
    });
    await user.click(await screen.findByRole('button', { name: /révoquer l’extension connectée le 12 octobre/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Une erreur est survenue');
    expect(screen.getByText('Extension connectée le 12 octobre 2026')).toBeInTheDocument();
  });
});

describe('changer d’adresse e-mail', () => {
  it('sends a code to the new address, then confirms it and shows the new address', async () => {
    const user = userEvent.setup();
    const { calls } = renderCompte('/compte', {
      respond: (call) => {
        if (call.url.endsWith('/web/account/email')) return jsonResponse({ ok: true, sent: true });
        if (call.url.endsWith('/web/account/email/confirm')) {
          return jsonResponse({ ok: true, email: 'nouvelle@example.com' });
        }
        return undefined;
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Changer d’adresse e-mail' }));
    await user.type(screen.getByLabelText('Nouvelle adresse e-mail'), 'nouvelle@example.com');
    await user.click(screen.getByRole('button', { name: 'Envoyer le code' }));

    expect(posted(calls, '/web/account/email')[0].body).toEqual({ email: 'nouvelle@example.com' });
    expect(await screen.findByText(/si nouvelle@example\.com est disponible/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Code de confirmation'), 'abcd2345');
    await user.click(screen.getByRole('button', { name: 'Confirmer l’adresse' }));

    expect(posted(calls, '/web/account/email/confirm')[0].body).toEqual({ code: 'ABCD2345' });
    expect(await screen.findByText('Votre adresse est maintenant nouvelle@example.com.')).toBeInTheDocument();
    // The account header follows.
    expect(screen.getAllByText('nouvelle@example.com').length).toBeGreaterThan(0);
    expect(screen.queryByText('marie@example.com')).toBeNull();
  });

  it('opens on the code step, prefilled, from the emailed link', async () => {
    renderCompte('/compte?email-code=WXYZ2345');
    expect(await screen.findByLabelText('Code de confirmation')).toHaveValue('WXYZ2345');
    expect(screen.getByRole('button', { name: 'Confirmer l’adresse' })).toBeInTheDocument();
  });

  it('names an address that is already taken', async () => {
    const user = userEvent.setup();
    renderCompte('/compte?email-code=WXYZ2345', {
      respond: (call) =>
        call.url.endsWith('/email/confirm') ? jsonResponse({ ok: false, error: 'email_taken' }, 409) : undefined,
    });
    await user.click(await screen.findByRole('button', { name: 'Confirmer l’adresse' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('déjà utilisée par un autre compte');
  });

  it('shows an expired code and lets the reader cancel', async () => {
    const user = userEvent.setup();
    renderCompte('/compte?email-code=WXYZ2345', {
      respond: (call) =>
        call.url.endsWith('/email/confirm') ? jsonResponse({ ok: false, error: 'expired_link' }, 410) : undefined,
    });
    await user.click(await screen.findByRole('button', { name: 'Confirmer l’adresse' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ce code a expiré');
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByLabelText('Code de confirmation')).toBeNull();
  });
});

describe('supprimer mon compte', () => {
  it('sends nothing until the reader has read what goes and confirmed', async () => {
    const user = userEvent.setup();
    const { calls } = renderCompte();

    await user.click(await screen.findByRole('button', { name: 'Supprimer mon compte…' }));

    const group = screen.getByRole('group', { name: 'Supprimer définitivement votre compte ?' });
    expect(within(group).getByText(/votre compte et votre adresse e-mail/)).toBeInTheDocument();
    expect(within(group).getByText(/extensions connectées, qui cesseront de fonctionner/)).toBeInTheDocument();
    expect(within(group).getByText(/journal d’usage/)).toBeInTheDocument();
    expect(within(group).getByText(/abonnement en cours est résilié immédiatement/)).toBeInTheDocument();
    expect(posted(calls, '/web/account/delete')).toHaveLength(0);

    // Cancel is where the focus lands, and it backs out without a request.
    expect(screen.getByRole('button', { name: 'Annuler' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByRole('group', { name: /supprimer définitivement/i })).toBeNull();
    expect(posted(calls, '/web/account/delete')).toHaveLength(0);
  });

  it('erases the account with an explicit confirmation and says it is done', async () => {
    const user = userEvent.setup();
    const { calls } = renderCompte('/compte', {
      respond: (call) => (call.url.endsWith('/web/account/delete') ? jsonResponse({ ok: true }) : undefined),
    });

    await user.click(await screen.findByRole('button', { name: 'Supprimer mon compte…' }));
    await user.click(screen.getByRole('button', { name: 'Supprimer définitivement mon compte' }));

    await waitFor(() => expect(posted(calls, '/web/account/delete')).toHaveLength(1));
    expect(posted(calls, '/web/account/delete')[0].body).toEqual({ confirm: true });
    expect(await screen.findByRole('heading', { name: 'Compte supprimé' })).toBeInTheDocument();
    expect(screen.queryByText('marie@example.com')).toBeNull();
  });

  it('keeps the account and explains why when the subscription could not be cancelled', async () => {
    const user = userEvent.setup();
    renderCompte('/compte', {
      respond: (call) =>
        call.url.endsWith('/web/account/delete')
          ? jsonResponse({ ok: false, error: 'billing_unavailable' }, 502)
          : undefined,
    });

    await user.click(await screen.findByRole('button', { name: 'Supprimer mon compte…' }));
    await user.click(screen.getByRole('button', { name: 'Supprimer définitivement mon compte' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('votre compte n’a pas été supprimé');
    expect(screen.queryByRole('heading', { name: 'Compte supprimé' })).toBeNull();
    // The button is back, so the reader can retry.
    expect(screen.getByRole('button', { name: 'Supprimer définitivement mon compte' })).toBeEnabled();
  });

  it('no longer promises the feature as coming soon', async () => {
    renderCompte();
    await screen.findByRole('heading', { name: 'Données et compte' });
    expect(screen.queryByText(/arrivent prochainement/)).toBeNull();
  });
});

