import { useState } from 'react';

import { isMobile, useInstall, useUserAgent } from '../install';
import { PAGE, PRIMARY_BUTTON } from './Landing';

const DISMISSED_KEY = 'squiggle_install_hint_dismissed';

/** Storage can be blocked (private mode, site data off): the hint then simply comes back next visit. */
function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

function remember() {
  try {
    localStorage.setItem(DISMISSED_KEY, '1');
  } catch {
    // Nothing to keep it in; hiding it for this visit is still what was asked.
  }
}

/** Safari's Share glyph, so the reader looks for the shape, not the word. */
function ShareGlyph() {
  return (
    <svg
      role="img"
      aria-label="Partager"
      viewBox="0 0 20 24"
      className="mx-0.5 inline-block h-[1.15em] w-[0.95em] -translate-y-[0.12em] align-middle"
    >
      <path
        d="M10 15V2M5.5 6.5 10 2l4.5 4.5M6.5 10H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V11a1 1 0 0 0-1-1h-2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The app, offered above the fold on a phone: the browser's own install prompt where it
 * has one, the Share-menu path on iOS Safari. Never on a computer, never inside the
 * installed app, and gone for good once the reader closes it.
 */
export function InstallHint() {
  const install = useInstall();
  const [dismissed, setDismissed] = useState(wasDismissed);
  const ua = useUserAgent();

  if (!install || dismissed || !(isMobile(ua) || install.kind === 'ios')) return null;

  const close = () => {
    remember();
    setDismissed(true);
  };

  return (
    <aside aria-label="L’appli Squiggle" className="border-b border-lineSoft bg-surface print:hidden">
      <div className={`${PAGE} flex items-center gap-3 py-3`}>
        <img src="/icons/icon-192.png" alt="" width={36} height={36} className="h-9 w-9 shrink-0 rounded-[9px]" />
        <p className="m-0 min-w-0 flex-1 text-base leading-snug">
          <span className="block font-semibold">L’appli Squiggle</span>
          {install.kind === 'ios' ? (
            <span className="block text-muted">
              Touchez <ShareGlyph /> puis «&nbsp;Sur l’écran d’accueil&nbsp;».
            </span>
          ) : (
            <span className="block text-muted">Sur votre écran d’accueil.</span>
          )}
        </p>
        {install.kind === 'prompt' ? (
          <button type="button" onClick={install.prompt} className={`${PRIMARY_BUTTON} shrink-0`}>
            Installer
          </button>
        ) : null}
        <button
          type="button"
          onClick={close}
          aria-label="Masquer"
          className="-mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-2xl leading-none text-muted transition-colors duration-160 ease-out hover:text-foreground"
        >
          ×
        </button>
      </div>
    </aside>
  );
}
