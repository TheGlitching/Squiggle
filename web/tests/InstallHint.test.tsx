/** The app offered above the fold on a phone: the browser's own prompt, or iOS Safari's Share path. */
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/App';
import { MOBILE } from './helpers';

const DESKTOP_CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36';
const [ANDROID, , , IPHONE] = MOBILE;

function at(userAgent: string) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
  return render(<App />);
}

const hint = () => screen.queryByRole('complementary', { name: 'L’appli Squiggle' });

function offerPrompt() {
  const prompt = vi.fn(() => Promise.resolve());
  act(() => {
    window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), { prompt }));
  });
  return prompt;
}

/** An in-memory `Storage`: the test environment's own `localStorage` is not usable. */
function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const map = new Map<string, string>();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, String(v)) };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
});

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  // The prompt is held for the whole page; spend any left over so the next case starts without one.
  act(() => {
    window.dispatchEvent(new Event('appinstalled'));
  });
});

describe('InstallHint', () => {
  it('shows iOS Safari where its install lives, right under the header', () => {
    at(IPHONE);
    const banner = within(hint()!);
    expect(banner.getByText('L’appli Squiggle')).toBeInTheDocument();
    expect(banner.getByRole('img', { name: 'Partager' })).toBeInTheDocument();
    expect(banner.getByText(/Sur l’écran d’accueil/)).toBeInTheDocument();
    expect(hint()!.previousElementSibling?.tagName).toBe('HEADER');
  });

  it('hands Android the browser’s own prompt, and leaves once the app is installed', async () => {
    at(ANDROID);
    expect(hint()).toBeNull();
    const prompt = offerPrompt();
    await userEvent.click(within(hint()!).getByRole('button', { name: 'Installer' }));
    expect(prompt).toHaveBeenCalledOnce();
    await waitFor(() => expect(hint()).toBeNull());
  });

  it('stays closed once dismissed, on the next visit too', async () => {
    at(IPHONE);
    await userEvent.click(within(hint()!).getByRole('button', { name: 'Masquer' }));
    expect(hint()).toBeNull();
    cleanup();
    at(IPHONE);
    expect(hint()).toBeNull();
  });

  it('never shows on a computer, even where the browser could install the app', () => {
    at(DESKTOP_CHROME);
    offerPrompt();
    expect(hint()).toBeNull();
  });

  it('never shows inside the installed app', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(display-mode: standalone)' }));
    at(IPHONE);
    expect(hint()).toBeNull();
  });
});
