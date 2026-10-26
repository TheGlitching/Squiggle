import { useEffect } from 'react';

import { FigClasse } from '../components/FigClasse';
import { LandingShell, MEASURE, PAGE, PRIMARY_BUTTON, QUIET_LINK, SECONDARY_BUTTON, Section } from '../components/Landing';
import { CONTACT_EMAIL, CONTACT_URL } from '../components/Layout';
import { Link } from '../router';

const USES = [
  ['Lire avant d’analyser', 'Les élèves notent ce qui leur paraît fragile. Puis la classe compare avec le rapport.'],
  ['Projeter un rapport', 'La phrase exacte, le nom du problème, la raison : lisible du fond de la salle.'],
  ['Parler méthode, pas verdict', '« Non vérifiable » n’est pas « faux » : de quoi ouvrir la discussion.'],
] as const;

const FRAME = [
  'Aucune publicité, aucun traceur : rien ne suit les élèves.',
  'La grille, les consignes et le calcul de la note sont publics.',
  'Le rapport juge un texte, jamais son auteur ni le média.',
  'Chaque constat cite sa phrase : on en débat sur pièces.',
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
      <section aria-labelledby="enseignants-titre" className={`${PAGE} pt-6 pb-16 sm:pt-12 md:pb-24`}>
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
          <div>
            <h1
              id="enseignants-titre"
              className="m-0 font-display text-[2.6rem] leading-[1.02] font-semibold tracking-[-0.035em] text-balance sm:text-6xl"
            >
              Squiggle pour les enseignants
            </h1>
            <p className={`mt-5 mb-8 text-lg leading-relaxed text-pretty md:text-xl ${MEASURE}`}>
              La classe repère ce qui cloche dans un article. Squiggle donne un deuxième avis. On compare.
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <a href={CONTACT_URL} className={`${PRIMARY_BUTTON} max-sm:w-full`}>
                Demander l’accès enseignant
              </a>
              <Link to="/analyser?exemple" className={`${SECONDARY_BUTTON} max-sm:w-full`}>
                Voir un rapport d’exemple
              </Link>
            </div>
            <p className="mt-4 mb-0 text-base text-muted">Gratuit pour les enseignants, sur demande.</p>
          </div>
          <FigClasse />
        </div>
      </section>

      <Section id="usages" title="Ce que vous pouvez en faire" tone="raised">
        <ul className="m-0 grid list-none gap-8 p-0 md:grid-cols-3 md:gap-10">
          {USES.map(([title, text]) => (
            <li key={title}>
              <h3 className="m-0 text-2xl leading-snug font-semibold tracking-tight">{title}</h3>
              <p className="mt-2 mb-0 text-lg leading-relaxed">{text}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="cadre" title="Un outil que l’on peut montrer en classe" layout="split">
        <ul className="m-0 grid list-none gap-5 p-0">
          {FRAME.map((line) => (
            <li key={line} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-4 text-lg leading-relaxed">
              <svg viewBox="0 0 20 20" aria-hidden="true" className="mt-1.5 h-5 w-5 text-[#34d399]">
                <path d="M4 10.5l3.5 3.5L16 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {line}
            </li>
          ))}
        </ul>
        <p className="mt-8 mb-0">
          <Link to="/transparence" className={QUIET_LINK}>
            Voir où va l’article analysé
          </Link>
        </p>
      </Section>

      <Section id="acces" title="Obtenir l’accès gratuit" tone="raised" layout="split">
        <ol className="m-0 grid list-none gap-6 p-0">
          {[
            ['Créez un compte', 'Sur le site, avec votre adresse e-mail ou Google.'],
            ['Écrivez-nous', `À ${CONTACT_EMAIL}, avec votre établissement et votre discipline.`],
            ['C’est prêt', 'Nous activons l’offre sur votre compte.'],
          ].map(([title, text]) => (
            <li key={title}>
              <h3 className="m-0 text-xl font-semibold">{title}</h3>
              <p className="mt-1 mb-0 text-lg leading-relaxed">{text}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-3">
          <a href={CONTACT_URL} className={`${PRIMARY_BUTTON} max-sm:w-full`}>
            Demander l’accès enseignant
          </a>
          <Link to="/" className={QUIET_LINK}>
            Retour à l’accueil
          </Link>
        </div>
      </Section>
    </LandingShell>
  );
}
