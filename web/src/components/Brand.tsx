/**
 * The R2-02 badge. Fixed colours: the tile is the brand accent and is
 * never recoloured. The wordmark is set in Bricolage Grotesque 600 (the same
 * face the packaged `lockup-horizontal.svg` was outlined from) rather than
 * inlined as paths, so it inherits the page colour and stays crisp.
 */
export function Badge({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="4 4 120 120" aria-hidden="true" className={className}>
      <rect x="4" y="4" width="120" height="120" rx="30" fill="#9061f0" />
      <rect x="30" y="30" width="68" height="13" rx="6.5" fill="#faf9f5" />
      <rect x="30" y="52" width="50" height="13" rx="6.5" fill="#faf9f5" />
      <path
        d="M35 87 Q45 73 55 87 Q65 101 75 87 Q85 73 95 87"
        fill="none"
        stroke="#faf9f5"
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BrandLockup({ className = '' }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <Badge className="h-8 w-8 shrink-0 sm:h-9 sm:w-9" />
      <span className="font-display text-xl font-semibold leading-none tracking-tight sm:text-2xl">squiggle</span>
    </span>
  );
}