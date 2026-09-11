import type { ReactNode } from 'react';

import { BrandLockup } from './Brand';
import { Link } from '../router';

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-surface/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4">
          <Link to="/" className="flex items-center" aria-label="Squiggle, accueil">
            <BrandLockup />
          </Link>
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted" aria-label="Navigation principale">
            <Link to="/tarifs" className="hover:text-foreground">
              Tarifs
            </Link>
            <Link to="/transparence" className="hover:text-foreground">
              Transparence
            </Link>
            <Link to="/legal" className="hover:text-foreground">
              Légal
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
          <p>Squiggle. Ce que l’article prouve, ce qu’il affirme. Aucune publicité, aucun traceur.</p>
          <nav className="flex flex-wrap gap-4" aria-label="Navigation de pied de page">
            <Link to="/transparence" className="hover:text-foreground">
              Transparence
            </Link>
            <Link to="/legal" className="hover:text-foreground">
              Confidentialité et conditions
            </Link>
            <a
              href="https://github.com/TheGlitching/Squiggle/issues"
              className="hover:text-foreground"
              rel="noreferrer noopener"
              target="_blank"
            >
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
      {lead ? <p className="mt-4 max-w-prose text-lg text-muted">{lead}</p> : null}
      <div className="mt-10">{children}</div>
    </div>
  );
}