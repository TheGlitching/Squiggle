import type { ReactNode } from 'react';

import { BrandLockup } from './Brand';
import { CONTACT_URL } from './Layout';
import { GITHUB_URL, LEGAL_PAGES, TAGLINE } from '../offer';
import { Link } from '../router';

const TRANSITION =
  'transition-[transform,background-color,border-color,color] duration-160 ease-out active:scale-[0.97] motion-reduce:active:scale-100';

export const PRIMARY_BUTTON = `inline-flex min-h-12 items-center justify-center gap-2 rounded-control bg-accent px-5 py-3 text-base font-semibold text-accentForeground hover:bg-accentHover ${TRANSITION}`;
export const SECONDARY_BUTTON = `inline-flex min-h-12 items-center justify-center gap-2 rounded-control border border-borderControl bg-transparent px-5 py-3 text-base font-medium text-foreground hover:border-accent hover:text-accentInk ${TRANSITION}`;
/** An underlined text link; `py-1` keeps its target well above 24 px. */
export const QUIET_LINK =
  'inline-block border-b border-borderControl py-1 text-muted transition-colors duration-160 ease-out hover:border-accent hover:text-accentInk';

/** Page width shared by the header, every section and the footer: a 16 px gutter on a phone. */
export const PAGE = 'mx-auto w-full max-w-6xl px-4 sm:px-6';
/** The reading measure: no line of running text is longer than this. */
export const MEASURE = 'max-w-[68ch]';

const NAV = [
  ['Comment ça marche', '/#comment'],
  ['Tarifs', '/#tarifs'],
  ['FAQ', '/#faq'],
] as const;

const NAV_LINK = 'inline-block py-2 text-base whitespace-nowrap text-muted transition-colors duration-160 ease-out hover:text-foreground';

/**
 * Every page's chrome: a slim translucent header that stays at hand, and the
 * legal footer. A signed-in area names the account rather than the sign-in.
 */
export function LandingShell({ children, account = false }: { children: ReactNode; account?: boolean }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-base text-foreground">
      <header className="site-header sticky top-0 z-30 border-b border-lineSoft">
        <div className={`${PAGE} flex items-center justify-between gap-x-4 py-3`}>
          <Link to="/" aria-label="Squiggle, accueil" className="inline-block shrink-0 py-1">
            <BrandLockup />
          </Link>
          <nav aria-label="Navigation principale" className="flex items-center gap-x-4 sm:gap-x-6">
            {/* Plain anchors: a hash link must scroll, whichever page it is read from. */}
            {NAV.map(([label, href]) => (
              <a key={href} href={href} className={`${NAV_LINK} max-lg:hidden`}>
                {label}
              </a>
            ))}
            <Link to="/enseignants" className={`${NAV_LINK} max-md:hidden`}>
              Enseignants
            </Link>
            <Link to="/analyser" className={`${NAV_LINK} md:hidden`}>
              Analyser
            </Link>
            <Link
              to={account ? '/compte' : '/connexion'}
              className="inline-flex min-h-10 items-center rounded-control border border-borderControl px-3 py-2 text-base font-medium whitespace-nowrap text-foreground transition-colors duration-160 ease-out hover:border-accent hover:text-accentInk"
            >
              {account ? 'Mon compte' : 'Se connecter'}
            </Link>
          </nav>
        </div>
        <div aria-hidden="true" className="scroll-progress" />
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-lineSoft">
        <div className={`${PAGE} grid gap-5 py-10 text-base text-muted`}>
          <nav aria-label="Navigation de pied de page" className="flex flex-wrap gap-x-6 gap-y-1">
            <Link to="/analyser" className={QUIET_LINK}>
              Analyser un article
            </Link>
            <Link to="/enseignants" className={QUIET_LINK}>
              Enseignants
            </Link>
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
          </nav>
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <p className="m-0">Squiggle. {TAGLINE} Aucune publicité, aucun traceur.</p>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer noopener" className={QUIET_LINK}>
              Tout est ouvert. Le code source est sur GitHub{' '}
              <span aria-hidden="true" className="font-mono">
                ↗
              </span>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** The mono caption over a heading: a section's number, or a page's kind. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="mb-3 block font-mono text-[13px] font-medium tracking-[0.16em] text-accentInk uppercase">
      {children}
    </span>
  );
}

/** A titled band of the page. Its heading names the region for assistive technology. */
export function Section({
  id,
  index,
  title,
  intro,
  children,
}: {
  id: string;
  /** The section's number, set as a caption over its title. */
  index?: string;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-titre`} className="scroll-mt-16 border-t border-lineSoft py-16 md:py-24">
      <div className={PAGE}>
        {index ? <Eyebrow>{index}</Eyebrow> : null}
        <h2
          id={`${id}-titre`}
          className="m-0 font-display text-3xl font-semibold tracking-tight text-balance md:text-5xl md:leading-[1.05]"
        >
          {title}
        </h2>
        {intro ? <p className={`mt-4 text-lg leading-relaxed text-pretty text-muted md:text-xl ${MEASURE}`}>{intro}</p> : null}
        <div className={intro ? 'mt-10 md:mt-12' : 'mt-8 md:mt-10'}>{children}</div>
      </div>
    </section>
  );
}
