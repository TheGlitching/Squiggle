import type { ReactNode } from 'react';

import { Exemple } from '../components/Exemple';
import { Trajet } from '../components/Trajet';
import { DeviceFigure, HeroFigure, SquiggleMark, StepFigure, type Step } from '../components/Iso';
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
import { CONTACT_URL } from '../components/Layout';
import { DOMAINS, VERIFICATION_STATES } from '../demo';
import { CHROME_URL, FIREFOX_URL, installLabelFor, installUrlFor, isMobile, useInstall } from '../install';
import { DAILY_ANALYSES, FREE_ANALYSES, GITHUB_URL, PRICE_MONTHLY, SUBSCRIBE_LABEL, TAGLINE } from '../offer';
import { Link } from '../router';

/** The path of an analysis, and what passes from one stage to the next. */
const STEPS: Array<{ step: Step; title: string; text: string; then?: string }> = [
  {
    step: 'article',
    title: 'Vous donnez l’article',
    text: 'Collé sur le site, partagé depuis l’appli, ou d’un clic dans votre navigateur.',
    then: 'le texte',
  },
  {
    step: 'lecture',
    title: 'Il est relu en entier',
    text: 'Faits, logique, cadrage, sources et langue.',
    then: 'les faits mis en doute',
  },
  {
    step: 'sources',
    title: 'Les doutes sont vérifiés',
    text: 'S’il met un fait en question, il consulte d’abord les sources. Si elles donnent raison à l’article, le doute est retiré.',
    then: 'les constats retenus',
  },
  {
    step: 'rapport',
    title: 'Vous lisez le rapport',
    text: 'Passages surlignés, raisons, points forts et une note sur 100.',
  },
];

const COMMITMENTS = [
  'Les mêmes critères pour chaque article.',
  'Le texte est jugé, jamais son auteur.',
  'La méthode et le code sont publics.',
] as const;

const FAQ: Array<[string, ReactNode]> = [
  [
    'Une analyse peut-elle se tromper ?',
    'Oui. Chaque constat cite la phrase exacte et sa raison : vous jugez sur pièces.',
  ],
  [
    'Mon article est-il envoyé quelque part ?',
    <>
      Oui, le temps de l’analyse, sans votre identité. Il n’est pas conservé.{' '}
      <Link to="/transparence" className={QUIET_LINK}>
        Le trajet des données
      </Link>
    </>,
  ],
  ['Et les articles payants ?', 'Squiggle analyse ce que vous pouvez lire, et signale un texte partiel.'],
  ['Comment résilier ?', 'À tout moment, depuis Mon compte, jusqu’à la fin de la période en cours.'],
  [
    'Puis-je l’utiliser en classe ?',
    <>
      Oui, gratuitement.{' '}
      <Link to="/enseignants" className={QUIET_LINK}>
        L’offre enseignants
      </Link>
    </>,
  ],
];

/** What the subscription opens, in the reader's terms. */
const INCLUDED = [
  `${DAILY_ANALYSES} analyses par jour`,
  'Le site, l’appli et le bouton du navigateur',
  'Le rapport complet : passages, raisons, note',
  'Aucune publicité, aucun traceur',
];

/** What passes from one stage to the next: down the page on a phone, across it on a wide screen. */
function Then({ label }: { label: string }) {
  const arrow = 'fill-none stroke-accent [stroke-width:1.5] [vector-effect:non-scaling-stroke]';
  return (
    <p className="col-span-2 m-0 grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-x-5 py-3 font-serif text-lg leading-tight text-accentInk italic lg:absolute lg:top-6 lg:-right-14 lg:z-10 lg:flex lg:h-20 lg:w-28 lg:flex-col lg:justify-end lg:gap-2 lg:p-0 lg:text-center lg:text-base">
      <svg viewBox="0 0 12 44" className="mx-auto h-11 w-3 lg:hidden" aria-hidden="true">
        <path d="M 6 2 V 40 M 1.5 34 L 6 41 L 10.5 34" className={arrow} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{label}</span>
      <svg viewBox="0 0 96 12" className="h-3 w-24 max-lg:hidden" aria-hidden="true">
        <path d="M 2 6 H 92 M 86 1.5 L 93 6 L 86 10.5" className={arrow} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </p>
  );
}

export function Accueil() {
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const storeUrl = installUrlFor(userAgent);
  const mobile = isMobile(userAgent);
  const install = useInstall();

  return (
    <>
      <div className={`${PAGE} pt-10 pb-16 md:pt-20 md:pb-24`}>
        <h1 className={`${H1} max-w-[14ch]`}>{TAGLINE}</h1>
        <div className="mt-6 grid items-start gap-10 md:mt-10 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-16">
          <div>
            <p className={LEAD}>
              Squiggle relit l’article que vous lisez. Il surligne ce qui est fragile, dit pourquoi, et montre aussi ce
              qui tient.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
              <Link to="/analyser" className={`${PRIMARY_BUTTON} max-sm:w-full`}>
                Analyser un article
              </Link>
              {install?.kind === 'prompt' ? (
                <button type="button" onClick={install.prompt} className={`${SECONDARY_BUTTON} max-sm:w-full`}>
                  Installer l’appli
                </button>
              ) : null}
              <a href="#exemple" className={QUIET_LINK}>
                Voir un exemple
              </a>
            </div>
          </div>

          <figure className="m-0 lg:-mt-36">
            <HeroFigure />
            <figcaption className="mt-4">
              <ol className="m-0 grid list-none gap-x-6 gap-y-2 p-0 text-base text-muted sm:grid-cols-3">
                {['Le passage fragile, surligné.', 'La raison, en une phrase.', 'Une note sur 100.'].map(
                  (text, index) => (
                    <li key={text} className="flex items-baseline gap-2.5">
                      <span
                        aria-hidden="true"
                        className="inline-flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-accentForeground"
                      >
                        {index + 1}
                      </span>
                      {text}
                    </li>
                  ),
                )}
              </ol>
            </figcaption>
          </figure>
        </div>
      </div>

      {/* The example speaks for itself: no heading, only its name for assistive technology. */}
      <section id="exemple" aria-label="Un exemple" className="scroll-mt-4 border-t border-lineSoft py-16 md:py-24">
        <div className={PAGE}>
          <p className={`mb-8 ${LEAD} ${MEASURE}`}>Touchez un passage surligné pour lire sa raison.</p>
          <Exemple />
        </div>
      </section>

      <Section id="comment" title="Comment ça marche" intro="Une à deux minutes, de l’article au rapport.">
        <ol className="m-0 grid list-none gap-0 p-0 lg:grid-cols-4 lg:gap-8">
          {STEPS.map(({ step, title, text, then }, index) => (
            <li
              key={step}
              className="relative grid content-start grid-cols-[7.5rem_minmax(0,1fr)] gap-x-5 lg:grid-cols-1 lg:gap-y-6"
            >
              <div className="lg:pr-12 lg:pl-1">
                <StepFigure step={step} />
              </div>
              <div>
                <p className="m-0 font-mono text-base font-semibold text-accentInk">{index + 1}</p>
                <h3 className={`${H3} mt-1`}>{title}</h3>
                <p className="mt-2 mb-0 text-base leading-relaxed text-muted">{text}</p>
              </div>
              {then ? <Then label={then} /> : null}
            </li>
          ))}
        </ol>
      </Section>

      <Section id="grille" title="La même grille pour tous" intro="Cinq questions, posées à chaque article.">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-20">
          {/* The weights are the engine's and will move; the page names what is read, not the points. */}
          <div className="grid items-start gap-8 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:gap-10">
            <div className="mx-auto w-full max-w-60 md:pt-2">
              <StepFigure step="lecture" />
            </div>
            <ol aria-label="Les cinq domaines" className="m-0 grid list-none gap-0 p-0">
              {DOMAINS.map(([label, , question]) => (
                <li key={label} className="flex gap-4 border-b border-lineSoft py-4 last:border-b-0">
                  <SquiggleMark />
                  <span className="grid gap-1">
                    <span className="font-medium">{label}</span>
                    <span className="text-muted">{question}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div className="grid content-start gap-10">
            <ul className="m-0 grid list-none gap-4 p-0">
              {COMMITMENTS.map((text) => (
                <li key={text} className="flex gap-3 text-lg leading-snug">
                  <SquiggleMark />
                  {text}
                </li>
              ))}
            </ul>
            <div>
              <h3 className={H3}>Jamais «&nbsp;faux&nbsp;»</h3>
              <dl className="mt-4 grid gap-3">
                {VERIFICATION_STATES.map(({ state, label, hint, chip }) => (
                  <div key={state} className="grid gap-1.5">
                    <dt>
                      <span className={`inline-block rounded-md border px-2.5 py-0.5 text-sm font-medium ${chip}`}>
                        {label}
                      </span>
                    </dt>
                    <dd className="m-0 text-base text-muted">{hint}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <p className="m-0">
              <a href={GITHUB_URL} target="_blank" rel="noreferrer noopener" className={QUIET_LINK}>
                Lire la méthode sur GitHub <span aria-hidden="true">↗</span>
              </a>
            </p>
          </div>
        </div>
      </Section>

      <Section id="partout" title="Où que vous lisiez" intro="Un seul compte, partout.">
        <ul className="m-0 grid list-none gap-12 p-0 md:grid-cols-3 md:gap-10">
          <li className="grid content-start gap-4">
            <div className="max-w-56">
              <DeviceFigure device="site" />
            </div>
            <h3 className={H3}>Sur le site</h3>
            <p className="m-0 text-base leading-relaxed text-muted">Collez le texte. Rien à installer.</p>
            <Link to="/analyser" className={`${SECONDARY_BUTTON} w-fit`}>
              Analyser un article
            </Link>
          </li>
          <li className="grid content-start gap-4">
            <div className="max-w-56">
              <DeviceFigure device="appli" />
            </div>
            <h3 className={H3}>Sur votre téléphone</h3>
            <p className="m-0 text-base leading-relaxed text-muted">
              Installez l’appli. Sur Android, partagez-lui un article.
            </p>
            {install?.kind === 'prompt' ? (
              <button type="button" onClick={install.prompt} className={`${SECONDARY_BUTTON} w-fit`}>
                Installer l’appli
              </button>
            ) : null}
            {install?.kind === 'ios' ? (
              <p className="m-0 text-base text-muted">Sur iPhone : Partager, puis « Sur l’écran d’accueil ».</p>
            ) : null}
          </li>
          <li className="grid content-start gap-4">
            <div className="max-w-56">
              <DeviceFigure device="navigateur" />
            </div>
            <h3 className={H3}>Dans votre navigateur</h3>
            <p className="m-0 text-base leading-relaxed text-muted">
              Un bouton dans Chrome ou Firefox, sur ordinateur : un clic sur l’article ouvert.
            </p>
            {storeUrl ? (
              <a href={storeUrl} className={`${SECONDARY_BUTTON} w-fit`}>
                {installLabelFor(storeUrl)}
              </a>
            ) : mobile ? null : (
              <div className="flex flex-wrap gap-3">
                <a href={CHROME_URL} className={SECONDARY_BUTTON}>
                  Chrome
                </a>
                <a href={FIREFOX_URL} className={SECONDARY_BUTTON}>
                  Firefox
                </a>
              </div>
            )}
          </li>
        </ul>
      </Section>

      <Section
        id="donnees"
        title="Vos données"
        intro="Aucune publicité, aucun traceur. Ce que vous lisez ne sert qu’à votre analyse."
      >
        <Trajet
          label="Le trajet d’un article"
          nodes={[
            { name: 'Votre article', note: 'la page ou le texte collé' },
            { name: 'L’analyse', note: 'une à deux minutes' },
            { name: 'Votre rapport', note: 'passages surlignés et raisons' },
          ]}
          links={['sans votre identité', 'les constats']}
        />
        <p className="mt-8 mb-0">
          <Link to="/transparence" className={QUIET_LINK}>
            Voir le trajet des données
          </Link>
        </p>
      </Section>

      <Section id="tarifs" title="Tarifs" intro="Essayez d’abord. Payez seulement si l’outil vous sert.">
        <div className="grid gap-10 rounded-card border border-accent/50 bg-surface p-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-14 md:p-10">
          <div className="grid content-start gap-5">
            <h3 className={H3}>Abonnement</h3>
            <p className="m-0 flex items-baseline gap-2">
              <span className="font-display text-6xl leading-none font-semibold tracking-[-0.03em]">
                {PRICE_MONTHLY}
              </span>
              <span className="text-lg text-muted">par mois</span>
            </p>
            <p className="m-0 text-base text-muted">Sans engagement, résiliable à tout moment.</p>
            <Link to="/connexion" className={`${PRIMARY_BUTTON} w-fit max-sm:w-full`}>
              {SUBSCRIBE_LABEL}
            </Link>
            <p className="m-0 text-base text-muted">
              Commencez par {FREE_ANALYSES} analyses offertes, sans carte bancaire.
            </p>
          </div>
          <ul aria-label="Ce qui est compris" className="m-0 grid list-none content-center gap-4 p-0 text-lg">
            {INCLUDED.map((text) => (
              <li key={text} className="flex gap-3">
                <SquiggleMark />
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-6 mb-0 text-base text-muted">
          Gratuit pour les enseignants, sur demande :{' '}
          <Link to="/enseignants" className={QUIET_LINK}>
            Offre enseignants
          </Link>
          . Avec votre propre clé d’API, l’extension est gratuite.
        </p>
      </Section>

      <Section id="faq" title="Questions fréquentes">
        <div className={`grid ${MEASURE}`}>
          {FAQ.map(([question, answer]) => (
            <details key={question} className="group border-t border-lineSoft last:border-b">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 font-display text-xl font-medium [&::-webkit-details-marker]:hidden">
                {question}
                <span
                  aria-hidden="true"
                  className="text-2xl leading-none text-accentInk transition-transform duration-160 ease-out group-open:rotate-45 motion-reduce:transition-none"
                >
                  +
                </span>
              </summary>
              <p className="m-0 pb-5 text-base leading-relaxed text-muted">{answer}</p>
            </details>
          ))}
        </div>
        <p className="mt-8 mb-0">
          <a href={CONTACT_URL} className={QUIET_LINK}>
            Une autre question ? Écrivez-nous
          </a>
        </p>
      </Section>
    </>
  );
}
