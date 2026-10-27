/**
 * The login flow: an e-mail becomes a magic link, the link (or the typed code)
 * becomes a session cookie. The pages never see the cookie; they only see the
 * API's success.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { account, installFetch, jsonResponse } from './helpers';
import { Connexion } from '../src/pages/Connexion';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderAt(path: string) {
  window.history.pushState({}, '', path);
  return render(<Connexion />);
}

describe('Connexion', () => {
  it('turns a typed e-mail into a code, then the code into a session', async () => {
    const user = userEvent.setup();
    const { calls } = installFetch((call) => {
      if (call.url.endsWith('/web/account')) {
        return jsonResponse({ ok: false, error: 'invalid_session' }, 401);
      }
      if (call.url.endsWith('/auth/magic-link')) {
        return jsonResponse({ ok: true, sent: true });
      }
      if (call.url.endsWith('/auth/magic-link/verify')) {
        return jsonResponse({ ok: true, userId: 'u1', email: 'marie@example.com' });
      }
      return undefined;
    });

    renderAt('/connexion');

    await user.type(screen.getByLabelText('Adresse e-mail'), 'marie@example.com');
    await user.click(screen.getByRole('button', { name: 'Recevoir mon code' }));

    await screen.findByLabelText('Code de connexion');
    await user.type(screen.getByLabelText('Code de connexion'), 'abcd2345');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));

    await waitFor(() => {
      const verify = calls.find((c) => c.url.endsWith('/auth/magic-link/verify'));
      expect(verify?.body).toEqual({ code: 'ABCD2345' });
    });
  });

  it('verifies a code carried in the emailed link and continues to the account', async () => {
    const { calls } = installFetch((call) => {
      if (call.url.endsWith('/auth/magic-link/verify')) {
        return jsonResponse({ ok: true, userId: 'u1', email: 'marie@example.com' });
      }
      return undefined;
    });

    renderAt('/connexion?code=ABCD2345&next=/compte');

    await waitFor(() => {
      expect(calls.some((c) => c.url.endsWith('/auth/magic-link/verify'))).toBe(true);
    });
    await waitFor(() => {
      expect(window.location.pathname).toBe('/compte');
    });
  });
  // Back from the destination must leave the sign-in page behind, not land on it and be sent forward again.
  it('replaces itself in the history when the reader is already signed in', async () => {
    installFetch((call) =>
      call.url.endsWith('/web/account') ? jsonResponse({ ok: true, ...account() }) : undefined,
    );
    window.history.pushState({}, '', '/enseignants');
    renderAt('/connexion?next=/compte');

    await waitFor(() => expect(window.location.pathname).toBe('/compte'));
    window.history.back();
    await waitFor(() => expect(window.location.pathname).toBe('/enseignants'));
  });

  const BRIDGE = `/pont?${new URLSearchParams({ ext: 'abcdefghijklmnop', pub: '{"kty":"EC"}' })}`;

  it('asks the server to keep the bridge destination when it requests the e-mail', async () => {
    const user = userEvent.setup();
    const { calls } = installFetch((call) => {
      if (call.url.endsWith('/web/account')) {
        return jsonResponse({ ok: false, error: 'invalid_session' }, 401);
      }
      if (call.url.endsWith('/auth/magic-link')) return jsonResponse({ ok: true, sent: true });
      return undefined;
    });

    renderAt(`/connexion?${new URLSearchParams({ next: BRIDGE })}`);
    await user.type(screen.getByLabelText('Adresse e-mail'), 'marie@example.com');
    await user.click(screen.getByRole('button', { name: 'Recevoir mon code' }));

    await waitFor(() => {
      const request = calls.find((c) => c.url.endsWith('/auth/magic-link'));
      expect(request?.body).toEqual({ email: 'marie@example.com', next: BRIDGE });
    });
  });

  it('carries the destination on the Google link', () => {
    installFetch(() => jsonResponse({ ok: false, error: 'invalid_session' }, 401));
    renderAt(`/connexion?${new URLSearchParams({ next: BRIDGE })}`);
    const href = screen.getByRole('link', { name: 'Continuer avec Google' }).getAttribute('href')!;
    expect(new URL(href, 'https://squiggle.fr').searchParams.get('next')).toBe(BRIDGE);
  });

  // Google's branding: its own four-colour "G" beside the label, never the label alone.
  it('draws the Google button with the official G', () => {
    installFetch(() => jsonResponse({ ok: false, error: 'invalid_session' }, 401));
    renderAt('/connexion');
    const google = screen.getByRole('link', { name: 'Continuer avec Google' });
    const fills = [...google.querySelectorAll('svg path')].map((path) => path.getAttribute('fill'));
    expect(fills).toEqual(['#EA4335', '#4285F4', '#FBBC05', '#34A853']);
    expect(google.className).toContain('bg-[#131314]');
  });

  it('sends the Google link without a destination when there is none', () => {
    installFetch(() => jsonResponse({ ok: false, error: 'invalid_session' }, 401));
    renderAt('/connexion');
    expect(screen.getByRole('link', { name: 'Continuer avec Google' }).getAttribute('href')).toBe('/auth/google');
  });

  it('follows the destination the server kept when the emailed link opens in a new tab', async () => {
    installFetch((call) => {
      if (call.url.endsWith('/auth/magic-link/verify')) {
        return jsonResponse({ ok: true, userId: 'u1', email: 'marie@example.com', next: BRIDGE });
      }
      return undefined;
    });

    // No `next` in the URL: the emailed link only carries the code.
    renderAt('/connexion?code=ABCD2345');

    await waitFor(() => {
      expect(window.location.pathname).toBe('/pont');
    });
    expect(new URLSearchParams(window.location.search).get('ext')).toBe('abcdefghijklmnop');
  });

  it('inside the installed app, asks for the code rather than the link', async () => {
    const user = userEvent.setup();
    installFetch((call) => {
      if (call.url.endsWith('/web/account')) return jsonResponse({ ok: false, error: 'invalid_session' }, 401);
      if (call.url.endsWith('/auth/magic-link')) return jsonResponse({ ok: true, sent: true });
      return undefined;
    });
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(display-mode: standalone)' }));

    renderAt('/connexion');
    await user.type(screen.getByLabelText('Adresse e-mail'), 'marie@example.com');
    await user.click(screen.getByRole('button', { name: 'Recevoir mon code' }));

    expect(await screen.findByText(/plutôt que de toucher le lien/)).toBeInTheDocument();
    expect(screen.queryByText(/ou ouvrez le lien/)).toBeNull();
  });
});
