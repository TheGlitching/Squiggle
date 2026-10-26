/**
 * How a lesson goes, for a teacher who has never used anything like it: six
 * steps from the kitchen table to the classroom, each with its drawing, in
 * plain words, and the two terms it rests on explained. On screen it is a
 * step-by-step guide; `/classe/mode-emploi` prints it on one page, to keep
 * beside the classroom computer.
 */
import { useState } from 'react';

import { GuideFigure, type GuideStep } from './Iso';
import { PAGE, PRIMARY_BUTTON, QUIET_LINK, SECONDARY_BUTTON, TITLE } from './Landing';
import { BrandLockup } from './Brand';
import { Link } from '../router';

export const GUIDE: Array<{ step: GuideStep; title: string; text: string; tip?: string }> = [
  {
    step: 'preparer',
    title: 'Chez vous, préparez la séance',
    text: 'Analysez l’article sur squiggle.fr, puis cliquez sur « Préparer pour la classe », sous le rapport. Vous voyez tout le corrigé, seul, et vous choisissez l’ordre des constats.',
  },
  {
    step: 'telecharger',
    title: 'Téléchargez le fichier de séance',
    text: 'Cliquez sur « Télécharger la séance ». Le fichier arrive dans le dossier Téléchargements de votre ordinateur. Copiez-le sur une clé USB, ou envoyez-le-vous par e-mail.',
  },
  {
    step: 'adresse',
    title: 'En classe, allez sur squiggle.fr/classe',
    text: 'Sur l’ordinateur de la salle, ouvrez le navigateur internet et tapez squiggle.fr/classe dans la barre d’adresse. Pas besoin de vous connecter.',
  },
  {
    step: 'ouvrir',
    title: 'Ouvrez le fichier',
    text: 'Branchez la clé, cliquez sur « Ouvrir le fichier de séance » et choisissez le fichier. L’article et votre préparation réapparaissent.',
  },
  {
    step: 'etendre',
    title: 'Étendez l’écran vers le projecteur',
    text: 'Appuyez ensemble sur la touche Windows et la touche P, puis choisissez « Étendre ». Cliquez sur « Lancer en classe » : faites glisser la fenêtre du tableau sur l’écran du projecteur, puis cliquez sur « Plein écran ».',
    tip: 'Sur un Mac : menu Pomme, Réglages Système, Moniteurs, puis choisissez d’étendre l’écran plutôt que de le recopier.',
  },
  {
    step: 'reveler',
    title: 'Révélez, constat par constat',
    text: 'Votre écran garde le corrigé, la classe ne voit que le tableau. Appuyez sur la flèche → du clavier pour montrer le constat suivant, quand vous le décidez.',
  },
];

export const TERMS: Array<[string, string]> = [
  [
    'Le fichier de séance',
    'Un fichier qui contient l’article et votre préparation. Son nom se termine par .squiggle. Il s’ouvre sur n’importe quel ordinateur, sans compte ni mot de passe. Squiggle ne le reçoit jamais : il reste sur votre clé ou votre ordinateur.',
  ],
  [
    'L’écran étendu',
    'L’ordinateur traite le projecteur comme un deuxième écran, différent du sien. Votre écran garde vos notes, le projecteur ne montre que le tableau. C’est le contraire de « Dupliquer », où la classe voit tout votre écran.',
  ],
  [
    'Si l’écran ne peut pas être étendu',
    'Affichez seulement la fenêtre du tableau, en plein écran, et avancez avec les flèches du clavier ou une télécommande de présentation. Votre corrigé, préparé chez vous, reste privé.',
  ],
];

function Terms({ compact = false }: { compact?: boolean }) {
  return (
    <dl className={`m-0 grid ${compact ? 'gap-2' : 'gap-5 md:grid-cols-3 md:gap-8'}`}>
      {TERMS.map(([term, definition]) => (
        <div key={term} className="grid content-start gap-1">
          <dt className={compact ? 'font-semibold' : 'font-display text-xl font-semibold'}>{term}</dt>
          <dd className={`m-0 ${compact ? '' : 'text-lg leading-relaxed text-muted'}`}>{definition}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The guide on screen: one step at a time, large, with its drawing playing once as it arrives. */
export function ModeEmploi() {
  const [current, setCurrent] = useState(0);
  const { step, title, text, tip } = GUIDE[current];
  const last = GUIDE.length - 1;

  return (
    <div className="grid gap-12">
      <div className="grid gap-8 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-14">
        <ol aria-label="Les six étapes" className="m-0 grid list-none grid-cols-6 gap-2 p-0 lg:grid-cols-1 lg:content-start">
          {GUIDE.map((item, index) => (
            <li key={item.step}>
              <button
                type="button"
                aria-current={index === current ? 'step' : undefined}
                onClick={() => setCurrent(index)}
                className={`flex min-h-12 w-full items-center gap-3 rounded-control border px-2 py-2 text-left text-base leading-snug transition-colors duration-160 ease-out max-lg:justify-center lg:px-3 ${
                  index === current
                    ? 'border-accent bg-accentSoft text-foreground'
                    : 'border-transparent text-muted hover:border-border hover:text-foreground'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base font-bold tabular-nums ${
                    index === current ? 'bg-accent text-accentForeground' : 'border border-borderControl'
                  }`}
                >
                  {index + 1}
                </span>
                <span className="max-lg:sr-only">{item.title}</span>
              </button>
            </li>
          ))}
        </ol>

        <div className="grid gap-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:items-center md:gap-10">
          {/* Keyed: a new step mounts a new drawing, so its motion plays from the start. */}
          <div key={step} className="guide-figure rounded-card border border-border bg-surface px-4 py-6 sm:px-8 sm:py-10">
            <GuideFigure step={step} />
          </div>
          <div key={`${step}-texte`} className="hero-card grid content-start gap-4" aria-live="polite">
            <p className="m-0 text-lg font-medium text-accentInk tabular-nums">
              Étape {current + 1} sur {GUIDE.length}
            </p>
            <h3 className="m-0 font-display text-3xl leading-tight font-semibold tracking-tight text-balance">{title}</h3>
            <p className="m-0 text-xl leading-relaxed">{text}</p>
            {tip ? <p className="m-0 text-lg leading-relaxed text-muted">{tip}</p> : null}
            <div className="mt-2 flex flex-wrap gap-3">
              {current < last ? (
                <button type="button" onClick={() => setCurrent(current + 1)} className={`${PRIMARY_BUTTON} text-lg max-sm:w-full`}>
                  Étape suivante →
                </button>
              ) : (
                <Link to="/classe" className={`${PRIMARY_BUTTON} text-lg max-sm:w-full`}>
                  Ouvrir le mode classe
                </Link>
              )}
              {current > 0 ? (
                <button type="button" onClick={() => setCurrent(current - 1)} className={`${SECONDARY_BUTTON} text-lg max-sm:w-full`}>
                  ← Étape précédente
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 border-t border-lineSoft pt-10">
        <h3 className="m-0 font-display text-2xl font-semibold">Trois mots à connaître</h3>
        <Terms />
        <p className="m-0">
          <Link to="/classe/mode-emploi" className={`${QUIET_LINK} text-lg`}>
            Imprimer ce mode d’emploi (une page)
          </Link>
        </p>
      </div>
    </div>
  );
}

/** /classe/mode-emploi: the whole guide on one A4 page, to print and keep by the classroom computer. */
export function ModeEmploiPage() {
  return (
    <div className={`${PAGE} py-8 sm:py-12 print:max-w-none print:p-0`}>
      <div className="mb-8 grid gap-4 print:hidden">
        <h1 className={TITLE}>Le mode d’emploi, sur une page</h1>
        <p className="m-0 max-w-[60ch] text-lg leading-relaxed text-muted">
          À imprimer et à garder près de l’ordinateur de la salle.
        </p>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => window.print()} className={`${PRIMARY_BUTTON} max-sm:w-full`}>
            Imprimer
          </button>
          <Link to="/classe" className={`${SECONDARY_BUTTON} max-sm:w-full`}>
            Le mode classe
          </Link>
        </div>
      </div>
      <article
        aria-label="Mode d’emploi"
        className="sheet guide-sheet mx-auto grid max-w-[210mm] content-start gap-5 rounded-sm bg-white px-5 py-8 text-[14px] leading-snug text-paperInk shadow-[0_1px_0_#c9c6bf,0_20px_50px_rgb(0_0_0/0.45)] sm:px-[12mm] sm:py-[12mm] print:max-w-none print:rounded-none print:p-0 print:shadow-none"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-paperEdge pb-3">
          <p className="m-0 font-display text-[22px] leading-tight font-semibold">Une séance avec Squiggle, pas à pas</p>
          <BrandLockup className="[&_span]:text-xl [&_svg]:h-7 [&_svg]:w-7" />
        </div>
        <ol className="m-0 grid list-none gap-x-6 gap-y-4 p-0 sm:grid-cols-2">
          {GUIDE.map(({ step, title, text, tip }, index) => (
            <li key={step} className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-3 break-inside-avoid">
              <div className="rounded-[10px] bg-[#1b1b1f] px-1.5 py-2 print:[print-color-adjust:exact]">
                <GuideFigure step={step} />
              </div>
              <div className="grid gap-1">
                <p className="m-0 flex items-baseline gap-2 font-display text-[15px] font-semibold">
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-paperInk text-[12px] text-paper print:[print-color-adjust:exact]">
                    {index + 1}
                  </span>
                  {title}
                </p>
                <p className="m-0 text-[13px]">{text}</p>
                {tip ? <p className="m-0 text-[12px] text-paperMuted">{tip}</p> : null}
              </div>
            </li>
          ))}
        </ol>
        <div className="grid gap-2 rounded-md border border-paperEdge p-4 text-[13px]">
          <Terms compact />
        </div>
        <p className="m-0 text-[12px] text-paperMuted">
          squiggle.fr/classe · Les élèves n’utilisent pas d’IA et n’ont pas de compte : ils lisent, soulignent et
          débattent d’une analyse que vous avez préparée.
        </p>
      </article>
    </div>
  );
}
