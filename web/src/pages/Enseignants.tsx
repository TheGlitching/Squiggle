import { useEffect } from 'react';

import { ClassFigure, SquiggleMark, StepFigure, type Step } from '../components/Iso';
import {
  H1,
  H3,
  LEAD,
  MEASURE,
  PAGE,
  PRIMARY_BUTTON,
  QUIET_LINK,
  SECONDARY_BUTTON,
  Section,
} from '../components/Landing';
import { CONTACT_EMAIL, CONTACT_URL } from '../components/Layout';
import { Link } from '../router';

/** A lesson, in the order it runs. */
const USES: Array<[Step, string, string]> = [
  ['article', 'Les élèves lisent d’abord', 'Ils notent ce qui leur paraît fragile, sans aide.'],
  ['rapport', 'Vous lancez l’analyse', 'Chaque constat est surligné, avec sa phrase et sa raison.'],
  ['lecture', 'La classe compare', '« Faux » ou « non vérifiable » ? On en débat sur pièces.'],
];

const FRAME = [
  'Aucune publicité, aucun traceur.',
  'Le texte est jugé, jamais son auteur ni le média.',
  'La méthode et le code sont publics.',
  'Une analyse peut se tromper : chaque constat cite sa phrase.',
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
    <>
      <div
        className={`${PAGE} grid items-center gap-12 pt-10 pb-16 md:pt-20 md:pb-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-16`}
      >
        <div>
          <h1 className={`${H1} max-w-[16ch]`}>Squiggle pour les enseignants</h1>
          <p className={`mt-6 ${LEAD} ${MEASURE}`}>
            Un article de l’actualité, relu sous les yeux de la classe. Les élèves cherchent d’abord, le rapport vient
            ensuite.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3">
            <a href={CONTACT_URL} className={`${PRIMARY_BUTTON} max-sm:w-full`}>
              Demander l’accès enseignant
            </a>
            {/* A plain anchor: a client-side navigation would drop the hash and not scroll. */}
            <a href="/#exemple" className={`${SECONDARY_BUTTON} max-sm:w-full`}>
              Voir un exemple
            </a>
          </div>
          <p className="mt-5 mb-0 text-base text-muted">Gratuit pour les enseignants, sur demande.</p>
        </div>
        <div className="mx-auto w-full max-w-sm">
          <ClassFigure />
        </div>
      </div>

      <Section id="usages" title="Ce que vous pouvez en faire">
        <ol className="m-0 grid list-none gap-10 p-0 md:grid-cols-3 md:gap-10">
          {USES.map(([step, title, text], index) => (
            <li
              key={title}
              className="grid content-start grid-cols-[7.5rem_minmax(0,1fr)] gap-x-5 md:grid-cols-1 md:gap-y-5"
            >
              <div className="md:max-w-64">
                <StepFigure step={step} />
              </div>
              <div>
                <p className="m-0 font-mono text-base font-semibold text-accentInk">{index + 1}</p>
                <h3 className={`${H3} mt-1`}>{title}</h3>
                <p className="mt-2 mb-0 text-base leading-relaxed text-muted">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="cadre" title="Un outil que l’on peut montrer en classe">
        <ul className={`m-0 grid list-none gap-4 p-0 text-lg leading-snug ${MEASURE}`}>
          {FRAME.map((text) => (
            <li key={text} className="flex gap-3">
              <SquiggleMark />
              {text}
            </li>
          ))}
        </ul>
        <p className="mt-8 mb-0">
          <Link to="/transparence" className={QUIET_LINK}>
            Voir où va l’article analysé
          </Link>
        </p>
      </Section>

      <Section id="acces" title="Obtenir l’accès gratuit">
        <ol className={`m-0 grid list-none gap-5 p-0 text-lg ${MEASURE}`}>
          {[
            'Créez votre compte sur le site.',
            `Écrivez-nous à ${CONTACT_EMAIL}, avec votre établissement et votre discipline.`,
            'Nous activons l’offre sur votre compte.',
          ].map((text, index) => (
            <li key={text} className="flex items-baseline gap-4">
              <span className="font-mono text-base font-semibold text-accentInk">{index + 1}</span>
              <span>{text}</span>
            </li>
          ))}
        </ol>
        <div className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-3">
          <a href={CONTACT_URL} className={`${PRIMARY_BUTTON} max-sm:w-full`}>
            Demander l’accès enseignant
          </a>
          <Link to="/" className={`${SECONDARY_BUTTON} max-sm:w-full`}>
            Retour à l’accueil
          </Link>
        </div>
      </Section>
    </>
  );
}
