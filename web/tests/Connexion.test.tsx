/**
 * The login flow: an e-mail becomes a magic link, the link (or the typed code)
 * becomes a session cookie. The pages never see the cookie; they only see the
 * API's success.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { installFetch, jsonResponse } from './helpers';
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
});
