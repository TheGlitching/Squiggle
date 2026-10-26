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
import { ModeEmploi } from '../components/ModeEmploi';
import { MONTHLY_ANALYSES, SUBSCRIBE_LABEL } from '../offer';
import { Link } from '../router';

/** The request, written for the teacher: the three facts we need to grant the offer. */
export const TEACHER_REQUEST_URL = `${CONTACT_URL}?subject=${encodeURIComponent(
  'Accès enseignant Squiggle',
)}&body=${encodeURIComponent('Établissement :\nDiscipline :\nAdresse e-mail du compte Squiggle :\n')}`;

/** The offer at a glance: who, what, how. */
const OFFER: Array<[string, string]> = [
  ['Pour qui', 'Enseignants et documentalistes'],
  ['Ce qui est offert', 'L’abonnement complet, gratuit'],
  ['Comment', 'Un code de réduction, sur demande'],
];

/** What the classroom mode does, in the order a lesson uses it. */
const MODE: Array<[string, string]> = [
  [
    'Préparer en privé',
    'Tout le corrigé, pour vous seul : chaque passage relevé, son explication et une question à poser. Vous choisissez l’ordre et retirez ce que vous ne traiterez pas. La note reste masquée, sauf si vous l’affichez.',
  ],
  [
    'Révéler un à un',
    'Au vidéoprojecteur, le tableau montre l’article aux phrases numérotées. La classe propose ses phrases, vous comptez les mains, puis vous révélez chaque constat d’une touche.',
  ],
  [
    'Une fiche à photocopier',
    'La fiche élève numérote les phrases comme le tableau, sans rien de l’analyse. Le corrigé suit votre ordre. Les deux s’impriment en A4.',
  ],
];

const INCLUDED = [
  `${MONTHLY_ANALYSES} analyses par mois`,
  'Le site, l’appli et le bouton du navigateur',
  'Le mode classe : préparer en privé, révéler un à un, fiche à photocopier',
  'Aucune publicité, aucun traceur',
] as const;

const REQUEST_STEPS = [
  'Créez votre compte sur le site.',
  `Écrivez-nous à ${CONTACT_EMAIL}, avec votre établissement et votre discipline.`,
  'Vous recevez un code de réduction : saisissez-le en vous abonnant, depuis « Mon compte ». Le total passe à 0 €, sans carte bancaire.',
] as const;

/**
 * The 2027 press week (CLEMI): a shared code the CLEMI publishes on its page for
 * registered teachers. The code itself is never printed here: this page is
 * public, and the code is meant for those teachers only.
 */
const PRESS_WEEK_STEPS = [
  'Retrouvez le code Squiggle sur la page des offres réservée aux enseignants inscrits, sur le site du CLEMI.',
  `Créez votre compte sur squiggle.fr, ouvrez « Mon compte », puis cliquez sur « ${SUBSCRIBE_LABEL} ».`,
  'Cliquez sur « Ajouter un code promotionnel » et saisissez le code : le total passe à 0 €.',
] as const;

const PRESS_WEEK_FACTS = [
  'L’abonnement complet, gratuit pendant 6 mois.',
  'Aucune carte bancaire n’est demandée, et rien ne sera prélevé : au bout de 6 mois, l’accès s’arrête de lui-même.',
  'Aucun compte élève : vous seul lancez l’analyse, les élèves lisent, soulignent et débattent.',
  'De la 4e au lycée. En 4e et en 3e, seul l’enseignant se sert de l’outil.',
] as const;

const FRAME = [
  'Aucune publicité, aucun traceur.',
  'Le texte est jugé, jamais son auteur ni le média.',
  'La méthode et le code sont publics.',
  'Une analyse peut se tromper : chaque constat cite sa phrase.',
] as const;

const REQUEST = 'Demander l’accès enseignant';

function Marks({ items, label }: { items: readonly string[]; label: string }) {
  return (
    <ul aria-label={label} className="m-0 grid list-none gap-3 p-0 text-lg leading-normal">
      {items.map((text) => (
        <li key={text} className="flex gap-3">
          <SquiggleMark />
          {text}
        </li>
      ))}
    </ul>
  );
}

function Steps({ items, label }: { items: readonly string[]; label: string }) {
  return (
    <ol aria-label={label} className="m-0 grid list-none gap-3 p-0 text-lg leading-normal">
      {items.map((text, index) => (
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
  );
}

export function Enseignants() {
  return (
    <>
      <div
        className={`${PAGE} grid items-center gap-12 pt-10 pb-16 md:pt-20 md:pb-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-16`}
      >
        <div>
          <h1 className={`${H1} max-w-[16ch]`}>Squiggle pour les enseignants</h1>
          <p className={`mt-6 ${LEAD} ${MEASURE}`}>
            Un article de l’actualité, relu sous les yeux de la classe. Vous préparez chez vous et voyez tout le corrigé,
            seul ; en classe, le tableau ne montre que ce que vous révélez. Les élèves n’utilisent pas d’IA. Gratuit pour
            les enseignants.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3">
            <a href={TEACHER_REQUEST_URL} className={`${PRIMARY_BUTTON} max-sm:w-full`}>
              {REQUEST}
            </a>
            <a href="#mode-classe" className={`${SECONDARY_BUTTON} max-sm:w-full`}>
              Découvrir le mode classe
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
        id="mode-classe"
        title="Le mode classe"
        intro="Préparé chez vous, révélé en classe, constat par constat. Il est inclus dans tout compte, essai compris."
      >
        <div className="grid gap-10 md:grid-cols-3 md:gap-10">
          {MODE.map(([title, text]) => (
            <div key={title}>
              <h3 className={H3}>{title}</h3>
              <p className="mt-3 mb-0 text-lg leading-relaxed text-muted">{text}</p>
            </div>
          ))}
        </div>
        <p className={`mt-10 mb-0 text-xl leading-relaxed ${MEASURE}`}>
          Les élèves n’utilisent pas d’IA et n’ont pas de compte : ils lisent, soulignent et débattent d’une analyse que
          vous avez préparée. Aucun téléphone n’est nécessaire.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3">
          <Link to="/classe" className={`${PRIMARY_BUTTON} max-sm:w-full`}>
            Ouvrir le mode classe
          </Link>
          <a href="#pas-a-pas" className={`${SECONDARY_BUTTON} max-sm:w-full`}>
            Voir une séance pas à pas
          </a>
        </div>
      </Section>

      <Section id="pas-a-pas" title="Une séance, pas à pas">
        <ModeEmploi />
      </Section>

      <Section
        id="exercice"
        title="L’exercice, en trois temps"
        intro="Essayez-le comme vos élèves, sur un article d’exemple : marquez d’abord ce qui vous paraît fragile, puis révélez l’analyse. En classe, le mode classe fait la même chose au tableau, sur votre article."
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
        <p className={`mt-8 mb-0 text-lg leading-relaxed ${MEASURE}`}>
          Analysez des articles publiés, jamais un texte d’élève : une copie est une donnée personnelle, elle n’a pas sa
          place dans un outil d’IA.
        </p>
        <p className="mt-8 mb-0">
          <Link to="/transparence" className={QUIET_LINK}>
            Voir où va l’article analysé
          </Link>
        </p>
      </Section>

      <Section
        id="semaine-presse"
        title="Semaines de la presse 2027"
        intro="Pour les Semaines de la presse et des médias dans l’École, du 15 au 28 mars 2027, Squiggle propose aux enseignants inscrits un accès gratuit à l’abonnement complet."
      >
        <div className="grid gap-12 md:grid-cols-2 md:gap-16">
          <div>
            <h3 className={H3}>Ce qui est offert</h3>
            <div className="mt-4">
              <Marks items={PRESS_WEEK_FACTS} label="Ce qui est offert pendant les Semaines de la presse" />
            </div>
          </div>
          <div>
            <h3 className={H3}>Comment l’activer</h3>
            <div className="mt-4">
              <Steps items={PRESS_WEEK_STEPS} label="Comment activer l’accès des Semaines de la presse" />
            </div>
          </div>
        </div>
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
            <div className="mt-4">
              <Marks items={INCLUDED} label="Ce qui est offert" />
            </div>
          </div>
          <div>
            <h3 className={H3}>Comment le demander</h3>
            <div className="mt-4">
              <Steps items={REQUEST_STEPS} label="Comment le demander" />
            </div>
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
