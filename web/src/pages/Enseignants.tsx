import { useEffect, type ReactNode } from 'react';

import { ClassroomFigure, ReadFigure, ReportFigure, Stations, TextFigure } from '../components/Figures';
import { Plate } from '../components/iso';
import { CONTACT_EMAIL, CONTACT_URL } from '../components/Layout';
import { LandingShell, MEASURE, PAGE, PRIMARY_BUTTON, QUIET_LINK, SECONDARY_BUTTON, Section } from '../components/Landing';
import { Link } from '../router';

const USES = [
  {
    figure: <ReadFigure />,
    title: 'Lire, puis comparer',
    note: 'Les élèves notent ce qui cloche, puis comparent avec l’analyse.',
  },
  {
    figure: <ReportFigure />,
    title: 'Projeter un rapport',
    note: 'Une note et des constats lisibles de loin.',
  },
  {
    figure: <TextFigure />,
    title: 'Travailler la méthode',
    note: 'Repérer, chercher la source, juger l’argument.',
  },
];

const FRAME = [
  'Aucune publicité, aucun traceur.',
  'Code, grille et calcul de la note publics.',
  'Un texte jugé, jamais son auteur ni le média.',
  'Chaque constat cite sa phrase.',
];

const ACCESS: Array<[string, ReactNode]> = [
  ['Créez votre compte', <>Sur le site, avec votre e-mail.</>],
  ['Écrivez-nous', <>À {CONTACT_EMAIL}, avec votre établissement.</>],
  ['C’est ouvert', <>L’offre s’active sur votre compte.</>],
];

function Check() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-accentInk">
      <path d="M4 10.5l4 4 8-9" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Enseignants() {
  useEffect(() => {
    const previous = document.title;
    document.title = 'Squiggle pour les enseignants';
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <LandingShell>
      <div className="hero-backdrop">
        <div className={`${PAGE} grid items-center gap-10 pt-10 pb-16 md:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-16 lg:pb-24`}>
          <div>
            <h1 className="m-0 font-display text-[2.6rem] leading-[1.04] font-semibold tracking-[-0.03em] text-balance sm:text-6xl">
              Squiggle pour les enseignants
            </h1>
            <p className={`mt-5 mb-0 text-lg leading-relaxed text-pretty text-muted md:text-xl ${MEASURE}`}>
              L’esprit critique, sur un vrai article, sous les yeux de la classe.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <a href={CONTACT_URL} className={`${PRIMARY_BUTTON} max-sm:w-full`}>
                Demander l’accès enseignant
              </a>
              {/* A plain anchor: a client-side navigation would drop the hash and not scroll. */}
              <a href="/#rapport" className={`${SECONDARY_BUTTON} max-sm:w-full`}>
                Voir un rapport
              </a>
            </div>
            <p className="mt-4 mb-0 text-base text-muted">Gratuit pour les enseignants, sur demande.</p>
          </div>
          <Plate fig="2" name="En classe" readout="5 constats · 61/100">
            <div className="mt-2 h-64 sm:h-80">
              <ClassroomFigure />
            </div>
          </Plate>
        </div>
      </div>

      <Section id="usages" index="01 · En classe" title="Ce que vous pouvez en faire">
        <Stations label="Trois usages" items={USES} />
      </Section>

      <Section id="cadre" index="02 · Le cadre" title="Un outil à montrer en classe">
        <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
          {FRAME.map((line) => (
            <li key={line} className="flex gap-3 rounded-card border border-border bg-surface p-4 text-base leading-relaxed">
              <Check />
              {line}
            </li>
          ))}
        </ul>
        <p className="mt-6 mb-0">
          <Link to="/transparence" className={QUIET_LINK}>
            Voir où va l’article analysé
          </Link>
        </p>
      </Section>

      <Section id="acces" index="03 · L’accès" title="Gratuit, sur simple demande">
        <ol className="m-0 grid list-none gap-4 p-0 md:grid-cols-3">
          {ACCESS.map(([title, text], index) => (
            <li key={title} className="flex gap-4 rounded-card border border-border bg-surface p-5">
              <span
                aria-hidden="true"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent font-mono text-base font-semibold text-accentForeground"
              >
                {index + 1}
              </span>
              <div>
                <h3 className="m-0 font-display text-xl font-semibold">{title}</h3>
                <p className="mt-1 mb-0 text-base leading-relaxed text-muted">{text}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <a href={CONTACT_URL} className={`${PRIMARY_BUTTON} max-sm:w-full`}>
            Demander l’accès enseignant
          </a>
          <Link to="/" className={`${SECONDARY_BUTTON} max-sm:w-full`}>
            Retour à l’accueil
          </Link>
        </div>
      </Section>
    </LandingShell>
  );
}
