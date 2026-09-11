import type { ReactNode } from 'react';

import { Link } from '../router';

function Mark() {
  return (
    <svg viewBox="0 0 128 128" aria-hidden="true" className="h-7 w-7 shrink-0">
      <rect x="4" y="4" width="120" height="120" rx="30" fill="#9E2A2B" />
      <rect x="30" y="42" width="68" height="12" rx="6" fill="#FBF9F5" />
      <rect x="30" y="64" width="48" height="12" rx="6" fill="#FBF9F5" />
      <path
        d="M28 99 q12 -16 24 0 q12 16 24 0 q12 -16 24 0"
        fill="none"
        stroke="#FBF9F5"
        strokeWidth="10"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-surface/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 py-4">
          <Link to="/" className="flex items-center gap-2.5" aria-label="Squiggle, accueil">
            <Mark />
            <span className="font-display text-lg font-semibold tracking-tight">Squiggle</span>
          </Link>
          <nav className="flex items-center gap-5 text-sm text-muted" aria-label="Navigation principale">
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
              className="rounded-md border border-border bg-surface px-3 py-1.5 font-medium text-foreground hover:border-accent hover:text-accent"
            >
              Mon compte
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-16 border-t border-border bg-surface">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-5 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            Squiggle — savoir ce que vaut ce que vous lisez. Aucune publicité, aucun traceur, aucune
            télémétrie.
          </p>
          <nav className="flex gap-4" aria-label="Navigation de pied de page">
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
