/**
 * A path as a diagram: where something goes, in order, with what travels along
 * each hop written on its arrow. Down the page on a phone, across it on a wide
 * screen; the labels stay real text either way.
 */
const ARROW = 'fill-none stroke-accent [stroke-width:1.5] [vector-effect:non-scaling-stroke]';

export function Trajet({
  label,
  nodes,
  links,
  bare = false,
}: {
  label: string;
  nodes: Array<{ name: string; note?: string }>;
  /** What travels into each node after the first. */
  links: string[];
  /** Each step as plain text, without its box: for a page that already has boxes enough. */
  bare?: boolean;
}) {
  return (
    <ol aria-label={label} className="m-0 flex list-none flex-col p-0 lg:flex-row lg:items-stretch">
      {nodes.map(({ name, note }, index) => (
        // Each hop's arrow is the basis of its item, so every box gets the same share of the width.
        <li
          key={name}
          className={`flex flex-col lg:min-w-0 lg:flex-row lg:items-center ${index > 0 ? 'lg:flex-[1_1_9rem]' : 'lg:flex-[1_1_0%]'}`}
        >
          {index > 0 ? (
            <p className="m-0 grid grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-x-3 py-2 pl-5 font-serif text-lg leading-tight text-foreground italic lg:flex lg:w-36 lg:shrink-0 lg:flex-col lg:gap-2 lg:px-2 lg:py-0 lg:text-center lg:text-base">
              <svg viewBox="0 0 12 40" className="h-10 w-3 lg:hidden" aria-hidden="true">
                <path
                  d="M 6 2 V 36 M 1.5 30 L 6 37 L 10.5 30"
                  className={ARROW}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>{links[index - 1]}</span>
              <svg viewBox="0 0 96 12" className="mx-auto h-3 w-24 max-lg:hidden" aria-hidden="true">
                <path
                  d="M 2 6 H 92 M 86 1.5 L 93 6 L 86 10.5"
                  className={ARROW}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </p>
          ) : null}
          <div
            className={`lg:min-w-0 lg:flex-1 lg:self-stretch ${bare ? 'py-2 lg:text-center' : 'rounded-card border border-border bg-surface px-5 py-4'}`}
          >
            <p className="m-0 font-display text-lg font-semibold">{name}</p>
            {note ? <p className="mt-1 mb-0 text-base text-muted">{note}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
