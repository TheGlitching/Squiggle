/**
 * The /favori guide: only the reader's own browser, and one button that copies
 * the bookmark and moves on to the gesture that saves it.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Favori, bookmarkletFor } from '../src/pages/Favori';

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Favori', () => {
  it('on an Android phone, copies the bookmark and moves on to saving it', async () => {
    vi.stubGlobal('navigator', { ...navigator, userAgent: ANDROID, maxTouchPoints: 5 });
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    render(<Favori />);

    expect(screen.getByRole('button', { name: 'Android' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Copier le favori' }));

    expect(writeText).toHaveBeenCalledWith(bookmarkletFor(window.location.origin));
    expect(screen.getByRole('heading', { name: 'Mettez cette page en favori' })).toHaveFocus();
    expect(screen.getByText('Étape 2 sur 5')).toBeInTheDocument();
  });

  it('on a computer, offers the bookmark to drag, with its javascript: address', () => {
    render(<Favori />);
    expect(screen.getByRole('link', { name: 'Analyser avec Squiggle' })).toHaveAttribute(
      'href',
      bookmarkletFor(window.location.origin),
    );
  });
});
