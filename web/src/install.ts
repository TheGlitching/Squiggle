import { useSyncExternalStore } from 'react';

/**
 * Where the install button sends the reader. One named constant per store,
 * routed by user agent so the button is never dead: Firefox goes to AMO, a
 * Chromium browser goes to the Chrome Web Store, and anything else (Safari, a
 * phone) gets no store at all, so the page leads with the analysis on the site.
 */
export const CHROME_URL =
  'https://chromewebstore.google.com/detail/squiggle-analyse-critique/gmlbdffooflgdpeiapkdfgkhnfclppec';
export const FIREFOX_URL = 'https://addons.mozilla.org/en-US/firefox/addon/squiggle-analysis/';

/** A phone or a tablet: no browser there installs the extension from a store. */
export function isMobile(userAgent: string): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/.test(userAgent);
}

/** The store URL for this user agent, or `null` when neither store applies. */
export function installUrlFor(userAgent: string): string | null {
  if (isMobile(userAgent)) return null;
  if (/Firefox\//i.test(userAgent)) return FIREFOX_URL;
  if (/Chrome\//.test(userAgent) || /Edg\//.test(userAgent) || /OPR\//.test(userAgent) || /Brave/.test(userAgent)) {
    return CHROME_URL;
  }
  return null;
}
/**
 * The install button names the reader's own browser: Edge, Opera and Brave
 * install from the Chrome Web Store, but their readers know their browser's name.
 */
export function installLabelFor(url: string, userAgent = ''): string {
  if (url === FIREFOX_URL) return 'Ajouter à Firefox';
  if (/Edg\//.test(userAgent)) return 'Ajouter à Edge';
  if (/OPR\//.test(userAgent)) return 'Ajouter à Opera';
  if (/Brave/.test(userAgent)) return 'Ajouter à Brave';
  return 'Ajouter à Chrome';
}

/** True inside the app installed on the home screen, which has its own cookies on iOS. */
export function isStandalone(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
}

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

/**
 * The browser's install prompt, held once for the whole page. It is captured as the
 * module loads, so a prompt fired before React mounts is not lost, and every install
 * button shares it: the event can only be used once.
 */
let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function publish(next: InstallPromptEvent | null) {
  deferred = next;
  for (const listener of listeners) listener();
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    publish(event as InstallPromptEvent);
  });
  window.addEventListener('appinstalled', () => publish(null));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * How this browser installs the app, if it does and it is not installed yet:
 * Chromium hands over its own prompt, iOS Safari only has its Share menu.
 * An iPad's Safari reports a Mac, so it is told apart by its touch screen.
 */
export function useInstall(): { kind: 'prompt'; prompt: () => void } | { kind: 'ios' } | null {
  const event = useSyncExternalStore(subscribe, () => deferred, () => null);
  const ua = navigator.userAgent;
  const ios =
    (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) && !/CriOS|FxiOS/.test(ua);

  if (isStandalone()) return null;
  if (event) return { kind: 'prompt', prompt: () => void event.prompt().finally(() => publish(null)) };
  return ios ? { kind: 'ios' } : null;
}
