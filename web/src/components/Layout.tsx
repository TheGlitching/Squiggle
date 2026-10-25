import type { ReactNode } from 'react';

import { BrandLockup } from './Brand';
import { LEGAL_PAGES, TAGLINE } from '../offer';
import { Link } from '../router';

/** Where a reader reaches us, and the address the legal pages publish. */
export const CONTACT_EMAIL = 'contact@squiggle.fr';
export const CONTACT_URL = `mailto:${CONTACT_EMAIL}`;

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-surface/80 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4">
          <Link to="/" className="flex items-center" aria-label="Squiggle, accueil">
            <BrandLockup />
          </Link>
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted" aria-label="Navigation principale">
            <Link to="/analyser" className="hover:text-foreground">
              Analyser un texte
            </Link>
            <Link to="/tarifs" className="hover:text-foreground">
              Tarifs
            </Link>
            {/* In the footer too; on a phone the header keeps to one line of links. */}
            <Link to="/transparence" className="hover:text-foreground max-sm:hidden">
              Transparence
            </Link>
            <Link
              to="/compte"
              className="rounded-md border border-border bg-surface px-3 py-1.5 font-medium text-foreground hover:border-accent hover:text-accentInk"
            >
              Mon compte
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-16 border-t border-border bg-surface">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-5 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>Squiggle. {TAGLINE} Aucune publicité, aucun traceur.</p>
          <nav className="flex flex-wrap gap-4" aria-label="Navigation de pied de page">
            <Link to="/transparence" className="hover:text-foreground">
              Transparence
            </Link>
            {LEGAL_PAGES.map(([to, label]) => (
              <Link key={to} to={to} className="hover:text-foreground">
                {label}
              </Link>
            ))}
            <a href={CONTACT_URL} className="hover:text-foreground">
              Contact
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

export function Page({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-12">
      <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      {lead ? <p className="mt-4 max-w-2xl text-lg text-muted">{lead}</p> : null}
      <div className="mt-10">{children}</div>
    </div>
  );
}