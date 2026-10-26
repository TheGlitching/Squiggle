/**
 * The path an article takes, drawn: the reader's browser, our server, the
 * model, the report. What each step keeps is written under it, in the words
 * of `/transparence`, which holds the full table.
 */
import type { ReactNode } from 'react';

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  vectorEffect: 'non-scaling-stroke',
} as const;

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" className="h-10 w-10 shrink-0 text-foreground">
      {children}
    </svg>
  );
}

const ICONS = {
  navigateur: (
    <Icon>
      <rect x="4" y="7" width="32" height="26" rx="4" {...STROKE} />
      <path d="M4 14h32" {...STROKE} />
      <path d="M10 20h16M10 25h12" {...STROKE} />
    </Icon>
  ),
  serveur: (
    <Icon>
      <rect x="7" y="6" width="26" height="12" rx="3" {...STROKE} />
      <rect x="7" y="22" width="26" height="12" rx="3" {...STROKE} />
      <path d="M12 12h2M12 28h2" {...STROKE} />
    </Icon>
  ),
  modele: (
    <Icon>
      <rect x="10" y="10" width="20" height="20" rx="4" {...STROKE} />
      <path d="M15 4v6M20 4v6M25 4v6M15 30v6M20 30v6M25 30v6M4 15h6M4 20h6M4 25h6M30 15h6M30 20h6M30 25h6" {...STROKE} />
    </Icon>
  ),
  rapport: (
    <Icon>
      <rect x="8" y="4" width="24" height="32" rx="3" {...STROKE} />
      <path d="M13 12h14M13 18h9M13 24h14M13 30h7" {...STROKE} />
      <path d="M22 18h5" stroke="#d97706" strokeWidth={3} strokeLinecap="round" />
    </Icon>
  ),
};

export const TRAJET: Array<{ icon: keyof typeof ICONS; title: string; keeps: string }> = [
  { icon: 'navigateur', title: 'Votre navigateur', keeps: 'Envoie le texte que vous lisez ou collez.' },
  { icon: 'serveur', title: 'Notre serveur', keeps: 'Le transmet, sans le conserver.' },
  { icon: 'modele', title: 'Le modèle de langage', keeps: 'Relit l’article et rend ses constats.' },
  { icon: 'rapport', title: 'Le rapport', keeps: 'Gardé 30 jours, avec de courts extraits.' },
];

function Arrow({ vertical }: { vertical: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`h-6 w-6 shrink-0 text-muted ${vertical ? 'ml-2 rotate-90' : 'max-md:ml-2 max-md:rotate-90'}`}
    >
      <path d="M3 12h17M14 6l6 6-6 6" {...STROKE} />
    </svg>
  );
}

/** `vertical` keeps it in one column at every width; otherwise it lies flat from a tablet up. */
export function Trajet({ vertical = false }: { vertical?: boolean }) {
  return (
    <ol
      aria-label="Le trajet d’une analyse"
      className={`m-0 flex list-none flex-col gap-3 p-0 ${vertical ? '' : 'md:flex-row md:items-start md:gap-4'}`}
    >
      {TRAJET.map((step, index) => (
        <li key={step.icon} className={`flex flex-col gap-3 ${vertical ? '' : 'md:flex-1 md:flex-row md:items-start'}`}>
          <div className="flex items-start gap-4 md:min-w-0 md:flex-1">
            {ICONS[step.icon]}
            <div className="min-w-0">
              <p className="m-0 text-base font-semibold">{step.title}</p>
              <p className="mt-0.5 mb-0 text-base leading-snug text-muted">{step.keeps}</p>
            </div>
          </div>
          {index < TRAJET.length - 1 ? <Arrow vertical={vertical} /> : null}
        </li>
      ))}
    </ol>
  );
}
