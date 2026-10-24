import type { ReactNode } from 'react';

import { BrandLockup } from './Brand';
import { CONTACT_URL } from './Layout';
import { GITHUB_URL, LEGAL_PAGES } from '../offer';
import { Link } from '../router';

const TRANSITION =
  'transition-[transform,background-color,border-color,color] duration-160 ease-out active:scale-[0.97] motion-reduce:active:scale-100';

export const PRIMARY_BUTTON = `inline-flex items-center justify-center gap-2 rounded-control bg-accent px-5 py-3 text-base font-semibold text-accentForeground hover:bg-accentHover ${TRANSITION}`;
export const SECONDARY_BUTTON = `inline-flex items-center justify-center gap-2 rounded-control border border-borderControl bg-transparent px-5 py-3 text-base font-medium text-foreground hover:border-accent hover:text-accentInk ${TRANSITION}`;
/** An underlined text link; `py-1` keeps its target well above 24 px. */
export const QUIET_LINK =
  'inline-block border-b border-borderControl py-1 text-muted transition-colors duration-160 ease-out hover:border-accent hover:text-accentInk';

/** Page width shared by the header, every section and the footer. */
export const PAGE = 'mx-auto w-full max-w-6xl px-6';
/** The reading measure: no line of running text is longer than this. */
export const MEASURE = 'max-w-[68ch]';

const NAV = [
  ['Ce qu’il vérifie', '/#verifie'],
  ['Neutralité', '/#neutralite'],
  ['Tarifs', '/#tarifs'],
  ['FAQ', '/#faq'],
] as const;

const NAV_LINK = 'inline-block py-2 text-base text-muted transition-colors duration-160 ease-out hover:text-foreground';

/** The landing's own chrome: a slim header and the legal footer, no site layout. */
export function LandingShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-base text-foreground">
      <header className="border-b border-lineSoft">
        <div className={`${PAGE} flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-4`}>
          <Link to="/" aria-label="Squiggle, accueil" className="inline-block py-1">
            <BrandLockup />
          </Link>
          <nav aria-label="Navigation principale" className="flex flex-wrap items-center gap-x-6 gap-y-0">
            {/* Plain anchors: a hash link must scroll, whichever page it is read from. */}
            {NAV.map(([label, href]) => (
              <a key={href} href={href} className={`${NAV_LINK} max-md:hidden`}>
                {label}
              </a>
            ))}
            <Link to="/analyser" className={NAV_LINK}>
              Analyser un texte
            </Link>
            {/* On a phone the header keeps to one line of links: the teachers' offer is
                also in the pricing and the FAQ. */}
            <Link to="/enseignants" className={`${NAV_LINK} max-sm:hidden`}>
              Enseignants
            </Link>
            <Link to="/connexion" className={`${NAV_LINK} font-medium text-foreground`}>
              Se connecter
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-lineSoft">
        <div className={`${PAGE} grid gap-4 py-10 text-base text-muted`}>
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
          </nav>
          <p className="m-0">
            <a href={GITHUB_URL} target="_blank" rel="noreferrer noopener" className={QUIET_LINK}>
              Tout est ouvert. Le code source est sur GitHub{' '}
              <span aria-hidden="true" className="font-mono">
                ↗
              </span>
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}

/** A titled band of the page. Its heading names the region for assistive technology. */
export function Section({
  id,
  title,
  intro,
  children,
}: {
  id: string;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-titre`} className="scroll-mt-4 border-t border-lineSoft py-16 md:py-20">
      <div className={PAGE}>
        <h2 id={`${id}-titre`} className="m-0 font-display text-3xl font-semibold tracking-tight md:text-4xl">
          {title}
        </h2>
        {intro ? <p className={`mt-4 text-lg leading-relaxed text-muted ${MEASURE}`}>{intro}</p> : null}
        <div className={intro ? 'mt-10' : 'mt-6'}>{children}</div>
      </div>
    </section>
  );
}
