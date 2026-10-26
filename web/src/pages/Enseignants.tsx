import { Exercice } from '../components/Exercice';
import { ClassFigure, SquiggleMark } from '../components/Iso';
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
import { DAILY_ANALYSES } from '../offer';
import { Link } from '../router';

/** The request, written for the teacher: the three facts we need to grant the offer. */
export const TEACHER_REQUEST_URL = `${CONTACT_URL}?subject=${encodeURIComponent(
  'Accès enseignant Squiggle',
)}&body=${encodeURIComponent('Établissement :\nDiscipline :\nAdresse e-mail du compte Squiggle :\n')}`;

/** The offer at a glance: who, what, how. */
const OFFER: Array<[string, string]> = [
  ['Pour qui', 'Enseignants et documentalistes'],
  ['Ce qui est offert', 'L’abonnement complet, gratuit'],
  ['Comment', 'Sur simple demande, par e-mail'],
];

const INCLUDED = [
  `${DAILY_ANALYSES} analyses par jour`,
  'Le site, l’appli et le bouton du navigateur',
  'Le rapport complet, à projeter en classe',
  'Aucune publicité, aucun traceur',
] as const;

const REQUEST_STEPS = [
  'Créez votre compte sur le site.',
  `Écrivez-nous à ${CONTACT_EMAIL}, avec votre établissement et votre discipline.`,
  'Nous activons l’offre sur votre compte.',
] as const;

const FRAME = [
  'Aucune publicité, aucun traceur.',
  'Le texte est jugé, jamais son auteur ni le média.',
  'La méthode et le code sont publics.',
  'Une analyse peut se tromper : chaque constat cite sa phrase.',
] as const;

const REQUEST = 'Demander l’accès enseignant';

export function Enseignants() {
  return (
    <>
      <div
        className={`${PAGE} grid items-center gap-12 pt-10 pb-16 md:pt-20 md:pb-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-16`}
      >
        <div>
          <h1 className={`${H1} max-w-[16ch]`}>Squiggle pour les enseignants</h1>
          <p className={`mt-6 ${LEAD} ${MEASURE}`}>
            Un article de l’actualité, relu sous les yeux de la classe. Les élèves cherchent d’abord, le rapport vient
            ensuite. Gratuit pour les enseignants, sur demande.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3">
            <a href={TEACHER_REQUEST_URL} className={`${PRIMARY_BUTTON} max-sm:w-full`}>
              {REQUEST}
            </a>
            <a href="#exercice" className={`${SECONDARY_BUTTON} max-sm:w-full`}>
              Essayer l’exercice
            </a>
          </div>
          <dl className="mt-10 mb-0 grid gap-x-8 gap-y-4 sm:grid-cols-3">
            {OFFER.map(([term, detail]) => (
              <div key={term} className="grid content-start gap-1">
                <dt className="text-base text-muted">{term}</dt>
                <dd className="m-0 text-base leading-snug font-semibold">{detail}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="mx-auto w-full max-w-sm">
          <ClassFigure />
        </div>
      </div>

      <Section
        id="exercice"
        title="L’exercice, en trois temps"
        intro="Essayez-le comme vos élèves : marquez d’abord ce qui vous paraît fragile, puis comparez avec l’analyse."
      >
        <Exercice />
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
        <div className="grid gap-12 md:grid-cols-3 md:gap-10">
          <div>
            <h3 className={H3}>Pour qui</h3>
            <p className="mt-4 mb-0 text-lg leading-snug">
              Les enseignants et les professeurs documentalistes, quelle que soit la discipline, pour leurs cours.
            </p>
          </div>
          <div>
            <h3 className={H3}>Ce qui est offert</h3>
            <ul aria-label="Ce qui est offert" className="mt-4 mb-0 grid list-none gap-3 p-0 text-lg leading-snug">
              {INCLUDED.map((text) => (
                <li key={text} className="flex gap-3">
                  <SquiggleMark />
                  {text}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className={H3}>Comment le demander</h3>
            <ol aria-label="Comment le demander" className="mt-4 mb-0 grid list-none gap-3 p-0 text-lg leading-snug">
              {REQUEST_STEPS.map((text, index) => (
                <li key={text} className="flex items-baseline gap-3">
                  <span
                    aria-hidden="true"
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-accentForeground"
                  >
                    {index + 1}
                  </span>
                  <span>{text}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div className="mt-12 flex flex-wrap items-center gap-x-4 gap-y-3">
          <a href={TEACHER_REQUEST_URL} className={`${PRIMARY_BUTTON} max-sm:w-full`}>
            {REQUEST}
          </a>
          <Link to="/" className={`${SECONDARY_BUTTON} max-sm:w-full`}>
            Retour à l’accueil
          </Link>
        </div>
      </Section>
    </>
  );
}
