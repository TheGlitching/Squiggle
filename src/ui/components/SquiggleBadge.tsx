/**
 * The approved R2-02 badge as an inline mark, for the extension's own surfaces
 * (side panel header, welcome page). Fixed colours: the tile is the brand
 * accent and is never recoloured.
 */
export function SquiggleBadge({ className = 'h-6 w-6' }: { className?: string }) {
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