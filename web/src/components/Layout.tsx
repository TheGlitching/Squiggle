import type { ReactNode } from 'react';

import { Eyebrow, LandingShell } from './Landing';

/** Where a reader reaches us, and the address the legal pages publish. */
export const CONTACT_EMAIL = 'contact@squiggle.fr';
export const CONTACT_URL = `mailto:${CONTACT_EMAIL}`;

/** The chrome of the pages that are not the landing: the same header and footer, the account at hand. */
export function Layout({ children }: { children: ReactNode }) {
  return <LandingShell account>{children}</LandingShell>;
}

export function Page({
  title,
  lead,
  eyebrow,
  wide = false,
  children,
}: {
  title: string;
  lead?: string;
  eyebrow?: string;
  /** A page of diagrams and tables rather than running text. */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`mx-auto w-full ${wide ? 'max-w-5xl' : 'max-w-3xl'} px-4 py-12 sm:px-6 md:py-16`}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h1 className="m-0 font-display text-4xl font-semibold tracking-tight text-balance sm:text-5xl">{title}</h1>
      {lead ? <p className="mt-4 mb-0 max-w-2xl text-lg leading-relaxed text-pretty text-muted">{lead}</p> : null}
      <div className="mt-10">{children}</div>
    </div>
  );
}
