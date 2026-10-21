import { useEffect } from 'react';

import { CONTACT_URL } from '../components/Layout';
import { LandingShell, MEASURE, PAGE, PRIMARY_BUTTON, QUIET_LINK, SECONDARY_BUTTON, Section } from '../components/Landing';
import { Link } from '../router';

const USES = [
  [
    'Faire lire avant de faire analyser',
    'Les élèves lisent l’article et notent ce qui leur paraît fragile. Vous lancez ensuite l’analyse : chaque constat est surligné dans la page, avec la phrase exacte et la raison, et la classe compare.',
  ],
  [
    'Projeter un rapport commenté',
    'Une note sur 100, cinq domaines et des constats lisibles de loin. Le rapport dit aussi ce qu’il n’a pas pu vérifier, ce qui ouvre la discussion sur la différence entre « faux » et « non vérifiable ».',
  ],
  [
    'Travailler sur la méthode, pas sur le verdict',
    'Repérer l’affirmation, chercher sa source, juger l’argument : les quatre états d’une affirmation et la grille commune à tous les articles servent de vocabulaire partagé.',
  ],
] as const;

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
      <div className={`${PAGE} py-12 md:py-16`}>
        <h1 className="m-0 font-display text-4xl font-semibold leading-[1.1] tracking-tight md:text-5xl">
          Squiggle pour les enseignants
        </h1>
        <p className={`mt-6 text-lg leading-relaxed text-muted md:text-xl ${MEASURE}`}>
          Repérer une affirmation, chercher sa source, juger un argument : c’est déjà un exercice
          d’éducation aux médias et à l’information. Squiggle le fait sous les yeux de la classe, sur
          l’article que vous choisissez.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3">
          <a href={CONTACT_URL} target="_blank" rel="noreferrer noopener" className={PRIMARY_BUTTON}>
            Demander l’accès enseignant
          </a>
          {/* A plain anchor: a client-side navigation would drop the hash and not scroll. */}
          <a href="/#verifie" className={SECONDARY_BUTTON}>
            Voir ce qu’il vérifie
          </a>
        </div>
        <p className="mt-4 text-base text-muted">Gratuit pour les enseignants, sur demande.</p>
      </div>

      <Section id="usages" title="Ce que vous pouvez en faire">
        <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-3">
          {USES.map(([title, text]) => (
            <li key={title} className="rounded-card border border-border bg-surface p-6">
              <h3 className="m-0 font-display text-xl font-semibold">{title}</h3>
              <p className="mt-3 mb-0 text-base leading-relaxed text-muted">{text}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="cadre" title="Un outil que l’on peut montrer en classe">
        <ul className={`m-0 grid list-none gap-3 p-0 text-base leading-relaxed text-muted ${MEASURE}`}>
          <li>Aucune publicité et aucun traceur : rien ne suit les élèves d’une page à l’autre.</li>
          <li>Le code, la grille et le calcul de la note sont publics : la méthode se discute et se critique.</li>
          <li>Le rapport évalue un texte, jamais son auteur ni le média qui l’a publié.</li>
          <li>
            Une analyse peut se tromper : chaque constat cite la phrase concernée pour que l’on puisse
            en débattre sur pièces.
          </li>
        </ul>
        <p className="mt-6">
          <Link to="/transparence" className={QUIET_LINK}>
            Voir où va l’article analysé
          </Link>
        </p>
      </Section>

      <Section
        id="acces"
        title="Obtenir l’accès gratuit"
        intro="L’offre est gratuite pour les enseignants. Elle s’ouvre sur simple demande."
      >
        <ol className={`m-0 grid list-decimal gap-3 pl-6 text-base leading-relaxed text-muted ${MEASURE}`}>
          <li>Installez l’extension depuis la page d’accueil, sur Chrome ou Firefox.</li>
          <li>
            Écrivez-nous depuis la page de contact, en indiquant votre établissement et votre
            discipline.
          </li>
          <li>Nous activons l’offre sur votre compte.</li>
        </ol>
        <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3">
          <a href={CONTACT_URL} target="_blank" rel="noreferrer noopener" className={PRIMARY_BUTTON}>
            Demander l’accès enseignant
          </a>
          <Link to="/" className={SECONDARY_BUTTON}>
            Retour à l’accueil
          </Link>
        </div>
      </Section>
    </LandingShell>
  );
}
