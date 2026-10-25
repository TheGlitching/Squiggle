import { useState, type ReactNode } from 'react';

import { BrandLockup } from './Brand';
import { CONTACT_URL } from './Layout';
import { useInstall } from '../install';
import { GITHUB_URL, LEGAL_PAGES, TAGLINE } from '../offer';
import { Link } from '../router';

const TRANSITION =
  'transition-[transform,background-color,border-color,color] duration-160 ease-out active:scale-[0.97] motion-reduce:active:scale-100';

export const PRIMARY_BUTTON = `inline-flex min-h-12 items-center justify-center gap-2 rounded-control bg-accent px-5 py-3 text-base font-semibold text-accentForeground hover:bg-accentHover disabled:opacity-60 ${TRANSITION}`;
export const SECONDARY_BUTTON = `inline-flex min-h-12 items-center justify-center gap-2 rounded-control border border-borderControl bg-transparent px-5 py-3 text-base font-medium text-foreground hover:border-accent hover:text-accentInk disabled:opacity-60 ${TRANSITION}`;
/** An underlined text link; `py-1` keeps its target well above 24 px. */
export const QUIET_LINK =
  'inline-block border-b border-borderControl py-1 text-muted transition-colors duration-160 ease-out hover:border-accent hover:text-accentInk';

/** Page width shared by the header, every section and the footer. */
export const PAGE = 'mx-auto w-full max-w-6xl px-5 sm:px-6';
/** The reading measure: no line of running text is longer than this. */
export const MEASURE = 'max-w-[62ch]';

const NAV = [
  ['Comment ça marche', '/#comment'],
  ['Tarifs', '/#tarifs'],
] as const;

const NAV_LINK =
  'inline-block py-2 text-base whitespace-nowrap text-muted transition-colors duration-160 ease-out hover:text-foreground';

/**
 * Installing the app, where the browser can: Chromium hands over its own
 * prompt, iOS Safari only has its Share menu, so there the button shows how.
 */
export function InstallControl({ className = '' }: { className?: string }) {
  const install = useInstall();
  const [help, setHelp] = useState(false);
  if (!install) return null;
  if (install.kind === 'prompt') {
    return (
      <button
        type="button"
        onClick={install.prompt}
        className={`rounded-control border border-borderControl px-2.5 py-2 text-base font-medium whitespace-nowrap ${className}`}
      >
        Installer
      </button>
    );
  }
  return (
    <span className={`relative ${className}`}>
      <button
        type="button"
        aria-expanded={help}
        aria-controls="installer-aide"
        onClick={() => setHelp((open) => !open)}
        className="rounded-control border border-borderControl px-2.5 py-2 text-base font-medium whitespace-nowrap"
      >
        Installer
      </button>
      {help ? (
        <span
          id="installer-aide"
          className="absolute top-full right-0 z-20 mt-2 block w-64 rounded-card border border-border bg-surface p-4 text-sm leading-relaxed text-foreground shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
        >
          Touchez{' '}
          <svg viewBox="0 0 20 20" className="inline h-4 w-4 align-[-2px]" aria-label="Partager" role="img">
            <path d="M10 2v11M6 6l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5 9H4v9h12V9h-1" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>{' '}
          Partager, puis « Sur l’écran d’accueil ». Squiggle s’ouvre alors comme une appli.
        </span>
      ) : null}
    </span>
  );
}

/** The one header of the site: the landing pages and the app pages share it. */
export function SiteHeader({ account = 'connexion' }: { account?: 'connexion' | 'compte' }) {
  return (
    <header>
      <div className={`${PAGE} flex items-center justify-between gap-x-6 py-3 sm:py-4`}>
        <Link to="/" aria-label="Squiggle, accueil" className="inline-block shrink-0 py-1">
          <BrandLockup className="max-sm:gap-2 max-sm:[&>span]:text-lg max-sm:[&>svg]:h-7 max-sm:[&>svg]:w-7" />
        </Link>
        <nav aria-label="Navigation principale" className="flex items-center gap-x-3 sm:gap-x-6">
          {/* Plain anchors: a hash link must scroll, whichever page it is read from. */}
          {NAV.map(([label, href]) => (
            <a key={href} href={href} className={`${NAV_LINK} max-lg:hidden`}>
              {label}
            </a>
          ))}
          <Link to="/enseignants" className={`${NAV_LINK} max-lg:hidden`}>
            Enseignants
          </Link>
          <Link to="/analyser" className={`${NAV_LINK} max-sm:hidden`}>
            Analyser un texte
          </Link>
          <InstallControl className="sm:hidden" />
          {account === 'compte' ? (
            <Link to="/compte" className={`${NAV_LINK} font-medium text-foreground`}>
              Mon compte
            </Link>
          ) : (
            <>
              <Link to="/connexion" className={`${NAV_LINK} font-medium text-foreground max-sm:hidden`}>
                Se connecter
              </Link>
              {/* The phone's header keeps to one line: the shorter word, same place. */}
              <Link to="/connexion" className={`${NAV_LINK} font-medium text-foreground sm:hidden`}>
                Connexion
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto bg-surface">
      <div className={`${PAGE} grid gap-6 py-12 text-base text-muted`}>
        <p className="m-0 font-display text-2xl font-semibold tracking-tight text-foreground">{TAGLINE}</p>
        <nav aria-label="Navigation de pied de page" className="flex flex-wrap gap-x-6 gap-y-1">
          <Link to="/transparence" className={QUIET_LINK}>
            Transparence
          </Link>
          {LEGAL_PAGES.map(([to, label]) => (
            <Link key={to} to={to} className={QUIET_LINK}>
              {label}
            </Link>
          ))}
          <a href={CONTACT_URL} className={QUIET_LINK}>
            Contact
          </a>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer noopener" className={QUIET_LINK}>
            Code source{' '}
            <span aria-hidden="true">↗</span>
          </a>
        </nav>
        <p className="m-0 text-base">Aucune publicité, aucun traceur.</p>
      </div>
    </footer>
  );
}

/** The landing's own chrome: the site header and footer around full-width sections. */
export function LandingShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-base text-foreground">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}

/** A titled band of the page. Its heading names the region for assistive technology. */
export function Section({
  id,
  title,
  intro,
  tone = 'plain',
  layout = 'stack',
  aside,
  children,
}: {
  id: string;
  title: string;
  intro?: ReactNode;
  /** `raised` lays the band on the surface tone: a step in background, not a rule. */
  tone?: 'plain' | 'raised';
  /** `split` sets the heading in a left column on a wide screen, the content on the right. */
  layout?: 'stack' | 'split';
  /** Under the heading, in the left column of a split band. */
  aside?: ReactNode;
  children: ReactNode;
}) {
  const heading = (
    <>
      <h2
        id={`${id}-titre`}
        className="m-0 font-display text-3xl leading-[1.1] font-semibold tracking-tight text-balance md:text-5xl"
      >
        {title}
      </h2>
      {intro ? <p className={`mt-4 mb-0 text-lg leading-relaxed text-pretty text-muted md:text-xl ${MEASURE}`}>{intro}</p> : null}
      {aside}
    </>
  );
  return (
    <section
      id={id}
      aria-labelledby={`${id}-titre`}
      className={`scroll-mt-4 py-16 md:py-28 ${tone === 'raised' ? 'bg-surface' : ''}`}
    >
      {layout === 'split' ? (
        <div className={`${PAGE} grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16`}>
          <div className="lg:sticky lg:top-8 lg:self-start">{heading}</div>
          <div>{children}</div>
        </div>
      ) : (
        <div className={PAGE}>
          {heading}
          <div className={intro ? 'mt-10 md:mt-14' : 'mt-8 md:mt-12'}>{children}</div>
        </div>
      )}
    </section>
  );
}
