/**
 * The R2-02 badge as an inline mark, for the extension's own surfaces
 * (side panel header, welcome page). Fixed colours: the tile is the brand
 * accent and is never recoloured.
 */
export function SquiggleBadge({ className = 'h-6 w-6' }: { className?: string }) {
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