/** The page a commercial e-mail links to: nothing happens until the button is pressed. */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { installFetch, jsonResponse } from './helpers';
import { Desinscription } from '../src/pages/Desinscription';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Desinscription', () => {
  it('withdraws only on the button, with the token of the link', async () => {
    const user = userEvent.setup();
    const { calls } = installFetch((call) => (call.url.includes('/web/unsubscribe') ? jsonResponse({ ok: true }) : undefined));
    window.history.pushState({}, '', '/desinscription?t=jeton-du-lien');
    render(<Desinscription />);
    expect(calls).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Ne plus recevoir ces e-mails' }));
    expect(await screen.findByRole('status')).toHaveTextContent('vous ne recevrez plus');
    expect(calls.map((c) => c.url)).toEqual([expect.stringContaining('/web/unsubscribe?t=jeton-du-lien')]);
  });

  it('leads to the account when the link has lost its token', () => {
    installFetch(() => undefined);
    window.history.pushState({}, '', '/desinscription');
    render(<Desinscription />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('link', { name: 'votre compte' })).toHaveAttribute('href', '/compte');
  });
});
