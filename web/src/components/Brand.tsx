/**
 * The approved R2-02 badge. Fixed colours: the tile is the brand accent and is
 * never recoloured. The wordmark is set in Bricolage Grotesque 600 (the same
 * face the packaged `lockup-horizontal.svg` was outlined from) rather than
 * inlined as paths, so it inherits the page colour and stays crisp.
 */
export function Badge({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 104 104" aria-hidden="true" className={className}>
      <rect width="104" height="104" rx="26" fill="#e0483f" />
      <path
        d="M20 52 Q36 30 52 52 T84 52"
        fill="none"
        stroke="#faf9f5"
        strokeWidth="11.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BrandLockup({ className = '' }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <Badge className="h-9 w-9 shrink-0" />
      <span className="font-display text-2xl font-semibold leading-none tracking-tight">squiggle</span>
    </span>
  );
}