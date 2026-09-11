/**
 * The bridge page. It is the web half of connecting a keyless reader's
 * extension, and it must build the request from the extension's own query
 * parameters — the public key is passed through, never invented.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { account as makeAccount, installFetch, jsonResponse } from './helpers';
import { Pont } from '../src/pages/Pont';

const JWK = { kty: 'EC', crv: 'P-256', x: 'abc_DEF-123', y: '456' };
const EXT = 'abcdefghijklmnopabcdefghijklmnop';
const BRIDGE_PATH = `/pont?ext=${EXT}&pub=${encodeURIComponent(JSON.stringify(JWK))}`;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderAt(path: string) {
  window.history.pushState({}, '', path);
  return render(<Pont />);
}

describe('Pont', () => {
  it('without bridge parameters, tells the reader to start from the extension', async () => {
    installFetch(() => jsonResponse({ ok: false, error: 'invalid_session' }, 401));
    renderAt('/pont');
    expect(
      await screen.findByText(/ouvrez l’extension dans votre navigateur/i),
    ).toBeInTheDocument();
  });

  it('asks a signed-out reader to sign in first, keeping the bridge query', async () => {
    installFetch(() => jsonResponse({ ok: false, error: 'invalid_session' }, 401));
    renderAt(BRIDGE_PATH);
    expect(await screen.findByText('Connectez-vous d’abord')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Se connecter' });
    expect(link.getAttribute('href')).toContain('/connexion?next=');
  });

  it('claims a token bound to the extension public key it was given', async () => {
    const { calls } = installFetch((call) => {
      if (call.url.endsWith('/web/account')) return jsonResponse({ ok: true, ...makeAccount() });
      if (call.url.endsWith('/auth/claim')) {
        return jsonResponse({ ok: true, token: 'tok', keyId: 'kid', userId: 'u1' });
      }
      return undefined;
    });

    renderAt(BRIDGE_PATH);

    await waitFor(() => {
      const claim = calls.find((c) => c.url.endsWith('/auth/claim'));
      expect(claim?.body).toEqual({ publicKeyJwk: JWK });
    });
  });

  it('offers the manual code fallback when the automatic claim fails', async () => {
    const user = userEvent.setup();
    installFetch((call) => {
      if (call.url.endsWith('/web/account')) return jsonResponse({ ok: true, ...makeAccount() });
      if (call.url.endsWith('/auth/claim')) {
        return jsonResponse({ ok: false, error: 'internal', message: 'boom' }, 500);
      }
      if (call.url.endsWith('/web/bridge/code')) {
        return jsonResponse({ ok: true, code: 'ABCD2345', expiresAt: Date.now() + 600_000 });
      }
      return undefined;
    });

    renderAt(BRIDGE_PATH);
    await screen.findByRole('button', { name: /afficher un code/i });

    await user.click(screen.getByRole('button', { name: /afficher un code/i }));
    expect(await screen.findByText('ABCD2345')).toBeInTheDocument();
  });
});
