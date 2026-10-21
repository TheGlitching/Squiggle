import { Demo, DemoText } from '../components/Demo';
import {
  LandingShell,
  MEASURE,
  PAGE,
  PRIMARY_BUTTON,
  QUIET_LINK,
  SECONDARY_BUTTON,
  Section,
} from '../components/Landing';
import { VERIFICATION_STATES } from '../demo';
import { CHROME_URL, FIREFOX_URL, installUrlFor } from '../install';
import { DAILY_ANALYSES, FREE_ANALYSES, GITHUB_URL, PRICE_MONTHLY, SUBSCRIBE_LABEL } from '../offer';
import { Link } from '../router';
import { CONTACT_URL } from '../components/Layout';

/** The five domains of the grid. A test pins these to the engine's own definitions. */
export const DOMAINS = [
  ['Robustesse factuelle et sourcing', 35, 'Les chiffres, les dates et les citations sont-ils précis, sourcés, vérifiables ?'],
  ['Solidité logique et argumentative', 25, 'Les conclusions découlent-elles des faits, ou d’un saut de raisonnement ?'],
  ['Cadrage et procédés rhétoriques', 25, 'Le titre, les mots choisis et la mise en scène orientent-ils le jugement sans preuve ?'],
  ['Déontologie et transparence', 10, 'Les sources sont-elles nommées, les intérêts signalés, le fait distingué du commentaire ?'],
  ['Soin de la langue', 5, 'Orthographe et grammaire, comme indice de rigueur.'],
] as const;

const NEUTRALITY = [
  [
    'Une seule grille pour tous les articles',
    'Les mêmes cinq domaines et les mêmes pondérations s’appliquent à chaque article, quels que soient le sujet, le média ou le bord de l’auteur. Aucun réglage ne favorise un titre.',
  ],
  [
    'Une méthode publique',
    'La grille, les consignes données au modèle et le calcul de la note sont publiés avec le code source. Vous pouvez vérifier comment une note est obtenue, et la contester.',
  ],
  [
    'Aucun verdict sur les personnes',
    'Squiggle juge la solidité d’un texte, jamais l’honnêteté d’un auteur, d’un média ou d’une personne citée. Ce qu’il ne peut pas vérifier, il le dit « non vérifiable », pas « faux ».',
  ],
] as const;

const FAQ = [
  [
    'Sur quels navigateurs fonctionne-t-il ?',
    'Sur Chrome et Firefox, ainsi que sur les navigateurs basés sur Chromium comme Edge ou Brave.',
  ],
  [
    'Que se passe-t-il quand mes analyses offertes sont épuisées ?',
    `Vous pouvez vous abonner (${PRICE_MONTHLY} par mois, ${DAILY_ANALYSES} analyses par jour) ou utiliser votre propre clé d’API auprès d’un fournisseur de modèle : l’extension reste alors gratuite.`,
  ],
  [
    'Une analyse peut-elle se tromper ?',
    'Oui. Elle est produite en partie par un modèle de langage. C’est pourquoi chaque constat cite la phrase exacte de l’article et donne sa raison : vous jugez sur pièces. Quand une affirmation ne peut pas être vérifiée, le rapport le dit au lieu de trancher.',
  ],
  [
    'Mon article est-il envoyé quelque part ?',
    'Avec un compte, oui : le texte de l’article transite par notre serveur et par le fournisseur du modèle le temps de l’analyse, puis n’est pas conservé. Avec votre propre clé, il part directement chez le fournisseur que vous avez choisi. Le détail est sur la page Transparence.',
  ],
  [
    'Et les articles payants ?',
    'Squiggle analyse le texte que votre navigateur affiche. Sur un article derrière un abonnement, c’est ce que vous pouvez lire, et le rapport signale que l’analyse est partielle.',
  ],
  [
    'Comment résilier mon abonnement ?',
    'À tout moment depuis la page « Mon compte », via le portail de gestion Stripe. La résiliation prend effet à la fin de la période en cours.',
  ],
  [
    'Puis-je l’utiliser en classe ?',
    <>
      Oui, et c’est gratuit pour les enseignants sur demande.{' '}
      <Link to="/enseignants" className={QUIET_LINK}>
        La page Enseignants explique comment
      </Link>
      .
    </>,
  ],
] as const;

export function Accueil() {
  const installUrl = installUrlFor(typeof navigator === 'undefined' ? '' : navigator.userAgent);

  return (
    <LandingShell>
      <div className={`${PAGE} grid items-center gap-12 py-12 md:py-16 lg:grid-cols-[minmax(0,1fr)_26rem] lg:gap-16`}>
        <div>
          <h1 className="m-0 font-display text-4xl font-semibold leading-[1.1] tracking-tight md:text-5xl lg:text-6xl">
            Analyse l’article que vous lisez et montre ce qui ne tient pas.
          </h1>
          <p className={`mt-6 text-lg leading-relaxed text-muted md:text-xl ${MEASURE}`}>
            Squiggle relit un article de presse comme un lecteur exigeant : il surligne dans la page
            les passages fragiles, dit pourquoi, et cherche en ligne de quoi confirmer ou infirmer
            les faits qu’il peut vérifier.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3">
            {installUrl ? (
              <a href={installUrl} className={PRIMARY_BUTTON}>
                Installer l’extension
              </a>
            ) : (
              <p className="m-0 text-base text-muted">
                Disponible pour{' '}
                <a href={CHROME_URL} className={QUIET_LINK}>
                  Chrome
                </a>{' '}
                et{' '}
                <a href={FIREFOX_URL} className={QUIET_LINK}>
                  Firefox
                </a>
                .
              </p>
            )}
            <a href="#tarifs" className={SECONDARY_BUTTON}>
              Voir les tarifs
            </a>
          </div>
          <p className="mt-4 text-base text-muted">
            {FREE_ANALYSES} analyses offertes, puis {PRICE_MONTHLY} par mois. Sans engagement.
          </p>
        </div>

        <figure className="m-0 mx-auto w-full max-w-[26rem] lg:mx-0">
          <div className="relative h-[34rem] overflow-hidden rounded-card border border-border bg-surface lg:h-[40rem]">
            <img
              src="/landing/rapport.png"
              width={800}
              height={2756}
              alt="Capture du panneau Squiggle : une note de 61 sur 100, « article fragile », les cinq domaines notés, puis deux constats qui citent chacun la phrase de l’article concernée."
              className="block h-full w-full object-cover object-top"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-surface to-transparent"
            />
          </div>
          <figcaption className="mt-3 text-base text-muted">
            Le panneau de l’extension, sur un article d’exemple.
          </figcaption>
        </figure>
      </div>

      <Section
        id="verifie"
        title="Ce qu’il vérifie"
        intro="Chaque article est relu selon cinq domaines pondérés sur 100. Les constats sont surlignés dans la page, avec la raison."
      >
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-16">
          <ol className="m-0 grid list-none gap-3 p-0" aria-label="Les cinq domaines">
            {DOMAINS.map(([label, weight, question]) => (
              <li key={label} className="rounded-card border border-border bg-surface p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3 className="m-0 font-display text-xl font-semibold">{label}</h3>
                  <span className="font-mono text-sm text-muted">{weight} points sur 100</span>
                </div>
                <p className={`mt-2 mb-0 text-base leading-relaxed text-muted ${MEASURE}`}>{question}</p>
              </li>
            ))}
          </ol>

          <div className="self-start lg:sticky lg:top-8">
            <Demo />
            <DemoText />
          </div>
        </div>

        <h3 className="mt-14 mb-0 font-display text-2xl font-semibold">Quatre états pour chaque fait</h3>
        <p className={`mt-3 text-base leading-relaxed text-muted ${MEASURE}`}>
          Une affirmation n’est jamais simplement vraie ou fausse : elle est confirmée, doutée par les
          sources, laissée sans source par l’article, ou impossible à vérifier telle qu’elle est écrite.
        </p>
        <dl className="mt-6 grid gap-4 md:grid-cols-2">
          {VERIFICATION_STATES.map(({ state, label, hint, chip }) => (
            <div key={state} className="rounded-card border border-border bg-surface p-5">
              <dt>
                <span className={`inline-block rounded-md border px-2.5 py-1 text-sm font-medium ${chip}`}>
                  {label}
                </span>
              </dt>
              <dd className="m-0 mt-3 text-base leading-relaxed text-muted">{hint}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section
        id="neutralite"
        title="Comment il reste neutre"
        intro="Une note n’a de valeur que si l’on sait comment elle est fabriquée."
      >
        <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-3">
          {NEUTRALITY.map(([title, text]) => (
            <li key={title} className="rounded-card border border-border bg-surface p-6">
              <h3 className="m-0 font-display text-xl font-semibold">{title}</h3>
              <p className="mt-3 mb-0 text-base leading-relaxed text-muted">{text}</p>
            </li>
          ))}
        </ul>
        <p className="mt-6">
          <a href={GITHUB_URL} target="_blank" rel="noreferrer noopener" className={QUIET_LINK}>
            Lire la méthode et le code sur GitHub{' '}
            <span aria-hidden="true" className="font-mono">
              ↗
            </span>
          </a>
        </p>
      </Section>

      <Section id="confidentialite" title="Vos données">
        <p className={`m-0 text-base leading-relaxed text-muted ${MEASURE}`}>
          Avec un compte, le texte de l’article transite par notre serveur et par le fournisseur du
          modèle le temps de l’analyse, puis n’est pas conservé. Le rapport, qui cite de courts
          extraits, est gardé 30 jours dans un cache partagé. Aucune publicité, aucun traceur. Avec
          votre propre clé, l’article part directement chez le fournisseur que vous avez choisi, jamais
          chez nous.
        </p>
        <p className="mt-4">
          <Link to="/transparence" className={QUIET_LINK}>
            Voir le trajet exact des données
          </Link>
        </p>
      </Section>

      <Section
        id="tarifs"
        title="Tarifs"
        intro="Essayez d’abord. Payez seulement si l’outil vous sert."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <article className="flex flex-col rounded-card border border-border bg-surface p-6">
            <h3 className="m-0 font-display text-xl font-semibold">Essai</h3>
            <p className="mt-3 mb-0 font-display text-3xl font-semibold">Gratuit</p>
            <p className="mt-3 text-base leading-relaxed text-muted">
              {FREE_ANALYSES} analyses offertes à l’inscription, sans carte bancaire.
            </p>
          </article>

          <article className="flex flex-col rounded-card border-2 border-accent bg-surface p-6">
            <h3 className="m-0 font-display text-xl font-semibold">Abonnement</h3>
            <p className="mt-3 mb-0 font-display text-3xl font-semibold">
              {PRICE_MONTHLY}
              <span className="text-base font-normal text-muted"> par mois</span>
            </p>
            <p className="mt-3 text-base leading-relaxed text-muted">
              {DAILY_ANALYSES} analyses par jour. Sans engagement, résiliable à tout moment.
            </p>
            <Link to="/connexion" className={`${PRIMARY_BUTTON} mt-auto`}>
              {SUBSCRIBE_LABEL}
            </Link>
          </article>

          <article className="flex flex-col rounded-card border border-border bg-surface p-6">
            <h3 className="m-0 font-display text-xl font-semibold">Votre propre clé</h3>
            <p className="mt-3 mb-0 font-display text-3xl font-semibold">Gratuit</p>
            <p className="mt-3 text-base leading-relaxed text-muted">
              L’extension ne coûte rien : vous réglez directement le fournisseur du modèle de votre choix.
            </p>
          </article>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-card border border-border bg-accentSoft p-6">
          <p className={`m-0 text-base leading-relaxed ${MEASURE}`}>
            <strong className="font-semibold">Gratuit pour les enseignants, sur demande.</strong>{' '}
            Pour projeter un rapport en classe ou préparer un exercice d’éducation aux médias.
          </p>
          <Link to="/enseignants" className={SECONDARY_BUTTON}>
            Offre enseignants
          </Link>
        </div>
      </Section>

      <Section id="faq" title="Questions fréquentes">
        <div className={`grid gap-3 ${MEASURE}`}>
          {FAQ.map(([question, answer]) => (
            <details key={question} className="group rounded-card border border-border bg-surface">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 font-display text-lg font-medium [&::-webkit-details-marker]:hidden">
                {question}
                <span
                  aria-hidden="true"
                  className="font-mono text-accentInk transition-transform duration-160 ease-out group-open:rotate-45 motion-reduce:transition-none"
                >
                  +
                </span>
              </summary>
              <p className="m-0 px-5 pb-5 text-base leading-relaxed text-muted">{answer}</p>
            </details>
          ))}
        </div>
        <p className="mt-6">
          <a href={CONTACT_URL} target="_blank" rel="noreferrer noopener" className={QUIET_LINK}>
            Une autre question ? Écrivez-nous
          </a>
        </p>
      </Section>
    </LandingShell>
  );
}
