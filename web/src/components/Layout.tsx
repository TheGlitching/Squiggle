import type { ReactNode } from 'react';

import { BrandLockup } from './Brand';
import { LEAD, MEASURE, PAGE, QUIET_LINK, TITLE } from './Landing';
import { GITHUB_URL, LEGAL_PAGES, TAGLINE } from '../offer';
import { Link } from '../router';

/** Where a reader reaches us, and the address the legal pages publish. */
export const CONTACT_EMAIL = 'contact@squiggle.fr';
export const CONTACT_URL = `mailto:${CONTACT_EMAIL}`;

const NAV = [
  ['Comment ça marche', '/#comment'],
  ['Tarifs', '/#tarifs'],
] as const;

const NAV_LINK = 'inline-block py-2 text-base text-muted transition-colors duration-160 ease-out hover:text-foreground';

/**
 * Every page's chrome: one header, one footer. `account` is the reader's way in:
 * "Se connecter" where a newcomer lands, "Mon compte" inside the app.
 */
export function Layout({ children, account = 'Se connecter' }: { children: ReactNode; account?: string }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-base text-foreground">
      <header className="border-b border-lineSoft">
        <div className={`${PAGE} flex items-center justify-between gap-x-6 py-3.5`}>
          <Link to="/" aria-label="Squiggle, accueil" className="inline-block shrink-0 py-1">
            <BrandLockup />
          </Link>
          <nav aria-label="Navigation principale" className="flex items-center gap-x-4 sm:gap-x-6 lg:gap-x-7">
            {/* Plain anchors: a hash link must scroll, whichever page it is read from. */}
            {NAV.map(([label, href]) => (
              <a key={href} href={href} className={`${NAV_LINK} max-lg:hidden`}>
                {label}
              </a>
            ))}
            <Link to="/enseignants" className={`${NAV_LINK} max-lg:hidden`}>
              Enseignants
            </Link>
            {/* Under 375 px only the way in fits beside the brand; every page links to the analysis. */}
            <Link to="/analyser" className={`${NAV_LINK} text-foreground max-[374px]:hidden`}>
              Analyser
            </Link>
            <Link
              to={account === 'Se connecter' ? '/connexion' : '/compte'}
              className="inline-block py-2 text-base font-medium whitespace-nowrap text-foreground transition-colors duration-160 ease-out hover:text-accentInk sm:rounded-control sm:border sm:border-borderControl sm:px-3.5 sm:hover:border-accent"
            >
              {account}
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-lineSoft">
        <div
          className={`${PAGE} grid gap-8 py-12 text-base text-muted md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] md:items-end md:gap-12`}
        >
          <div className="grid gap-3">
            <Link to="/" aria-label="Squiggle, accueil" className="inline-block w-fit py-1 text-foreground">
              <BrandLockup />
            </Link>
            <p className="m-0">{TAGLINE} Aucune publicité, aucun traceur.</p>
            <p className="m-0">
              <a href={GITHUB_URL} target="_blank" rel="noreferrer noopener" className={QUIET_LINK}>
                Le code source est sur GitHub <span aria-hidden="true">↗</span>
              </a>
            </p>
          </div>
          <nav aria-label="Navigation de pied de page" className="flex flex-wrap gap-x-6 gap-y-1 md:justify-end">
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
        </div>
      </footer>
    </div>
  );
}

/** A reading page: its title, a one-line lead, and the content on the measure. */
export function Page({
  title,
  lead,
  wide = false,
  children,
}: {
  title: string;
  lead?: string;
  /** Diagrams and tables take the page's full width; running text keeps its own measure. */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`${PAGE} py-12 md:py-20`}>
      <h1 className={`${TITLE} ${MEASURE}`}>{title}</h1>
      {lead ? <p className={`mt-5 ${LEAD} ${MEASURE}`}>{lead}</p> : null}
      <div className={`mt-10 md:mt-14 ${wide ? '' : 'max-w-3xl'}`}>{children}</div>
    </div>
  );
}
