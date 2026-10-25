import type { ReactNode } from 'react';

import { SiteFooter, SiteHeader } from './Landing';

/** Where a reader reaches us, and the address the legal pages publish. */
export const CONTACT_EMAIL = 'contact@squiggle.fr';
export const CONTACT_URL = `mailto:${CONTACT_EMAIL}`;

/** The app pages (analysis, account, sign-in, transparency, legal): the site's header and footer. */
export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader account="compte" />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}

export function Page({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:py-16">
      <h1 className="m-0 font-display text-4xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl">
        {title}
      </h1>
      {lead ? <p className="mt-4 mb-0 max-w-[62ch] text-lg leading-relaxed text-pretty text-muted">{lead}</p> : null}
      <div className="mt-10 sm:mt-14">{children}</div>
    </div>
  );
}
