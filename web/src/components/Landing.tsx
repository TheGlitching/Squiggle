import type { ReactNode } from 'react';

const TRANSITION =
  'transition-[transform,background-color,border-color,color] duration-160 ease-out active:scale-[0.97] motion-reduce:active:scale-100';

export const PRIMARY_BUTTON = `inline-flex min-h-12 items-center justify-center gap-2 rounded-control bg-accent px-5 py-3 text-base font-semibold text-accentForeground hover:bg-accentHover ${TRANSITION}`;
export const SECONDARY_BUTTON = `inline-flex min-h-12 items-center justify-center gap-2 rounded-control border border-borderControl bg-transparent px-5 py-3 text-base font-medium text-foreground hover:border-accent hover:text-accentInk ${TRANSITION}`;
/** An underlined text link; `py-1` keeps its target well above 24 px. */
export const QUIET_LINK =
  'inline-block border-b border-borderControl py-1 text-muted transition-colors duration-160 ease-out hover:border-accent hover:text-accentInk';

/** Page width shared by the header, every section and the footer. */
export const PAGE = 'mx-auto w-full max-w-6xl px-4 sm:px-6';
/** The reading measure: no line of running text is longer than this. */
export const MEASURE = 'max-w-[68ch]';

/**
 * The type scale. The display sizes follow the viewport between a phone and a
 * wide screen; Bricolage's optical size follows the font size on its own.
 */
export const H1 =
  'm-0 font-display text-[clamp(2.75rem,1.5rem+5.4vw,6rem)] leading-[0.98] font-semibold tracking-[-0.04em] text-balance';
export const H2 =
  'm-0 font-display text-[clamp(2rem,1.45rem+2.4vw,3.25rem)] leading-[1.04] font-semibold tracking-[-0.03em] text-balance';
export const H3 = 'm-0 font-display text-xl leading-snug font-semibold tracking-[-0.01em]';
/** The title of a working or reading page: firm, smaller than the landing's poster. */
export const TITLE =
  'm-0 font-display text-4xl leading-[1.05] font-semibold tracking-[-0.03em] text-balance md:text-5xl';
export const FIELD =
  'mt-2 block w-full rounded-control border border-borderControl bg-surface px-4 py-3 text-base text-foreground outline-hidden transition-colors duration-160 ease-out placeholder:text-muted focus:border-accentHover disabled:opacity-70';
export const LEAD = 'm-0 text-lg leading-relaxed text-pretty text-muted md:text-xl';

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
    <section id={id} aria-labelledby={`${id}-titre`} className="scroll-mt-4 border-t border-lineSoft py-16 md:py-24">
      <div className={PAGE}>
        <h2 id={`${id}-titre`} className={H2}>
          {title}
        </h2>
        {intro ? <p className={`mt-4 ${LEAD} ${MEASURE}`}>{intro}</p> : null}
        <div className={intro ? 'mt-10 md:mt-12' : 'mt-8 md:mt-10'}>{children}</div>
      </div>
    </section>
  );
}
