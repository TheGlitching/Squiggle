import type { ReactNode } from 'react';

import { Exemple } from '../components/Exemple';
import { Trajet } from '../components/Trajet';
import {
  DeviceFigure,
  ExternalMark,
  HeroFigure,
  SquiggleMark,
  StepFigure,
  type Device,
  type Step,
} from '../components/Iso';
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
import { installLabelFor, installUrlFor, isMobile, useInstall } from '../install';
import { DAILY_ANALYSES, FREE_ANALYSES, GITHUB_URL, PRICE_MONTHLY, TAGLINE } from '../offer';
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

/** Who bills an own-key analysis, named so a reader knows which key to bring. */
const OWN_KEY_PROVIDERS = 'OpenAI, Anthropic, Google Gemini ou OpenRouter';
const API_KEY_MEANS =
  'Une clé d’API, c’est le code d’accès personnel que ce fournisseur vous donne sur son site : vous le collez une fois dans l’extension.';

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
  [
    'Que se passe-t-il après l’essai ?',
    `Rien n’est prélevé : aucune carte n’est demandée. Pour continuer, abonnez-vous depuis Mon compte, ${PRICE_MONTHLY} par mois. Ou passez à l’extension avec votre propre clé d’IA : Squiggle ne vous facture alors plus rien.`,
  ],
  [
    'Gratuit avec ma propre clé : qu’est-ce que je paie ?',
    `Rien à Squiggle. La partie IA de l’analyse tourne sur votre propre compte chez un fournisseur d’IA (${OWN_KEY_PROVIDERS}), qui vous facture directement à l’usage : en général quelques centimes par analyse. ${API_KEY_MEANS} Sans compte chez un fournisseur, le compte Squiggle est plus simple : rien à régler.`,
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

const WAYS_TO_PAY = [
  ['Avec un compte, sans réglage :', `${FREE_ANALYSES} analyses offertes, puis ${PRICE_MONTHLY} par mois.`],
  [
    'Gratuit avec votre propre clé d’IA :',
    'dans l’extension. Votre fournisseur d’IA vous facture directement, en général quelques centimes par analyse.',
  ],
] as const;

/** What the subscription opens, in the reader's terms. */
const INCLUDED = [
  `${DAILY_ANALYSES} analyses par jour`,
  'Le site, l’appli et le bouton du navigateur',
  'Le rapport complet : passages, raisons, note',
  'Aucune publicité, aucun traceur',
];

/** A row of actions: buttons of one height, stacked full width on a phone. */
const ACTIONS = 'flex flex-wrap items-center gap-3 max-sm:flex-col max-sm:items-stretch';
const WAY_ACTION = `${SECONDARY_BUTTON} w-fit max-sm:w-full`;

/** One way in: its drawing, what it is, and its action pinned to the bottom of the column. */
function Way({ device, title, text, children }: { device: Device; title: string; text: ReactNode; children: ReactNode }) {
  return (
    <li className="flex flex-col gap-4">
      <div className="max-w-56">
        <DeviceFigure device={device} />
      </div>
      <h3 className={H3}>{title}</h3>
      <p className="m-0 text-base leading-relaxed text-muted">{text}</p>
      <div className="mt-auto pt-2">{children}</div>
    </li>
  );
}

/** What passes from one stage to the next: down the page on a phone, across it on a wide screen. */
function Then({ label }: { label: string }) {
  const arrow = 'fill-none stroke-accent [stroke-width:1.5] [vector-effect:non-scaling-stroke]';
  return (
    <p className="col-span-2 m-0 grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-x-5 py-3 font-serif text-lg leading-tight text-foreground italic lg:absolute lg:top-6 lg:-right-14 lg:z-10 lg:flex lg:h-20 lg:w-28 lg:flex-col lg:justify-end lg:gap-2 lg:p-0 lg:text-center lg:text-base">
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
            <div className={`mt-8 ${ACTIONS}`}>
              <Link to="/analyser" className={`${PRIMARY_BUTTON} max-sm:w-full`}>
                Analyser un article
              </Link>
              <a href="#exemple" className={`${SECONDARY_BUTTON} max-sm:w-full`}>
                Voir un exemple
              </a>
            </div>
            {/* The two ways to pay, stated where the reader decides; the sign-up stays the one button. */}
            <ul aria-label="Deux façons de l’utiliser" className="mt-8 grid list-none gap-3 p-0 text-base leading-snug">
              {WAYS_TO_PAY.map(([way, terms]) => (
                <li key={way} className="flex gap-3">
                  <SquiggleMark />
                  <span>
                    <span className="font-semibold">{way}</span> <span className="text-muted">{terms}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 mb-0">
              <a href="#tarifs" className={QUIET_LINK}>
                Comparer les deux
              </a>
            </p>
          </div>

          <figure className="m-0 lg:-mt-36">
            <HeroFigure />
            <figcaption className="mt-4">
              <ol className="m-0 grid list-none gap-x-6 gap-y-2 p-0 text-base text-muted sm:grid-cols-3">
                {['Le passage fragile, surligné.', 'La raison, en une phrase.', 'Une note sur 100.'].map(
                  (text, index) => (
                    <li key={text} className="flex items-baseline gap-3">
                      <span
                        aria-hidden="true"
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-accentForeground"
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

      <Section id="exemple" title="Touchez un passage surligné" intro="Le rapport donne sa raison, à côté.">
        <Exemple />
      </Section>

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
                <p className="m-0 font-display text-base font-semibold text-muted tabular-nums">{index + 1}</p>
                <h3 className={`${H3} mt-1`}>{title}</h3>
                <p className="mt-2 mb-0 text-base leading-relaxed text-muted">{text}</p>
              </div>
              {then ? <Then label={then} /> : null}
            </li>
          ))}
        </ol>
      </Section>

      <Section
        id="grille"
        title="La même grille pour tous"
        intro="Cinq critères, appliqués à chaque article, quel qu’en soit l’auteur."
      >
        {/* The weights are the engine's and will move; the page names what is read, not the points.
            A real table on a wide screen; on a phone each row stacks into its criterion, its
            question and its example, and the header stays for assistive technology only. */}
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">Les cinq critères de la grille</caption>
          <thead className="max-md:sr-only">
            <tr className="text-base text-muted">
              <th scope="col" className="w-[32%] pb-4 font-medium">
                Critère
              </th>
              <th scope="col" className="w-[28%] pb-4 font-medium">
                Ce qui est vérifié
              </th>
              <th scope="col" className="pb-4 font-medium">
                Exemple de passage relevé
              </th>
            </tr>
          </thead>
          <tbody>
            {DOMAINS.map(([label, , question, { before, mark, after, note }]) => (
              <tr
                key={label}
                className="grid gap-2 border-t border-lineSoft py-6 max-md:pl-8.5 md:table-row md:py-0"
              >
                <th scope="row" className="font-medium md:py-6 md:pr-8 md:align-top">
                  <span className="flex gap-3 text-lg leading-snug max-md:-ml-8.5">
                    <SquiggleMark />
                    {label}
                  </span>
                </th>
                <td className="text-base leading-snug text-foreground md:py-6 md:pr-8 md:align-top md:text-lg">
                  {question}
                </td>
                <td className="max-md:mt-2 md:py-6 md:align-top">
                  <p className="m-0 font-serif text-lg leading-snug text-foreground italic">
                    «&nbsp;{before}
                    <span className="underline decoration-accent decoration-wavy decoration-[1.5px] underline-offset-[5px] [text-decoration-skip-ink:none]">
                      {mark}
                    </span>
                    {after}&nbsp;»
                  </p>
                  <p className="mt-1 mb-0 text-base text-muted">{note}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-16 grid gap-14 md:mt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-20">
          <div>
            <h3 className={H3}>Un fait n’est jamais déclaré «&nbsp;faux&nbsp;»</h3>
            <p className={`mt-2 mb-0 text-base text-muted ${MEASURE}`}>
              Quand l’article avance un fait, Squiggle dit ce que les sources permettent d’en dire, en quatre états.
            </p>
            <dl className="mt-6 grid gap-x-10 gap-y-6 sm:grid-cols-2">
              {VERIFICATION_STATES.map(({ state, label, hint, chip }) => (
                <div key={state} className="grid content-start justify-items-start gap-2">
                  <dt>
                    <span className={`inline-block rounded-md border px-3 py-1 text-sm font-medium ${chip}`}>
                      {label}
                    </span>
                  </dt>
                  <dd className="m-0 text-base text-muted">{hint}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div>
            <h3 className={H3}>Trois engagements</h3>
            <ul className="mt-6 mb-0 grid list-none gap-4 p-0">
              {COMMITMENTS.map((text) => (
                <li key={text} className="flex gap-3 text-lg leading-snug">
                  <SquiggleMark />
                  {text}
                </li>
              ))}
            </ul>
            <p className="mt-8 mb-0">
              <a href={GITHUB_URL} target="_blank" rel="noreferrer noopener" className={QUIET_LINK}>
                Lire la méthode sur GitHub
                <ExternalMark />
              </a>
            </p>
          </div>
        </div>
      </Section>

      <Section
        id="partout"
        title="Où que vous lisiez"
        intro="Un seul compte, partout. Dans le navigateur, aussi gratuit avec votre propre clé d’IA."
      >
        {/* Three columns of the same shape: the action sits on one line across them, whatever the text above. */}
        <ul className="m-0 grid list-none gap-12 p-0 md:grid-cols-3 md:gap-10">
          <Way device="site" title="Sur le site" text="Collez le texte. Rien à installer.">
            <Link to="/analyser" className={WAY_ACTION}>
              Analyser un article
            </Link>
          </Way>
          <Way
            device="appli"
            title="Sur votre téléphone"
            text="Installez l’appli. Sur Android, partagez-lui un article."
          >
            {install?.kind === 'prompt' ? (
              <button type="button" onClick={install.prompt} className={WAY_ACTION}>
                Installer l’appli
              </button>
            ) : install?.kind === 'ios' ? (
              <p className="m-0 text-base text-muted">Dans Safari : Partager, puis « Sur l’écran d’accueil ».</p>
            ) : (
              <p className="m-0 text-base text-muted">Ouvrez squiggle.fr sur votre téléphone pour l’installer.</p>
            )}
          </Way>
          <Way
            device="navigateur"
            title="Dans votre navigateur"
            text={
              <>
                Un bouton dans votre navigateur, sur ordinateur : un clic sur l’article ouvert. Avec votre compte, ou{' '}
                <a href="#tarifs" className="font-semibold text-foreground underline decoration-accent underline-offset-4 hover:text-accentInk">
                  gratuit avec votre propre clé d’IA
                </a>
                .
              </>
            }
          >
            {/* Only the store this browser installs from; none where no store exists (Safari, phones). */}
            {storeUrl ? (
              <a href={storeUrl} className={WAY_ACTION}>
                {installLabelFor(storeUrl, userAgent)}
              </a>
            ) : (
              <p className="m-0 text-base text-muted">
                {mobile
                  ? 'Sur ordinateur, avec Chrome, Edge, Opera, Brave ou Firefox.'
                  : 'Disponible pour Chrome, Edge, Opera, Brave et Firefox.'}
              </p>
            )}
          </Way>
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

      {/* Two ways to pay for an analysis, not a comparison grid: the plan leads, with the one
          sign-up action; the reader's own key sits beside it as a real choice, its "0 €" and
          who bills what said together. Both cards pin their action to the bottom, above a
          one-line note, so the buttons share a line side by side. */}
      <Section
        id="tarifs"
        title="Tarifs"
        intro="Deux façons de l’utiliser : un compte, sans réglage, à essayer avant de payer ; ou l’extension, gratuite avec votre propre clé d’IA."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Beside the list on a tablet; stacked, with the action at the foot, beside the other card. */}
          <div className="grid gap-x-14 gap-y-8 rounded-card border border-accent/50 bg-surface p-6 md:grid-cols-2 md:grid-rows-[auto_1fr] md:p-10 lg:grid-cols-1 lg:grid-rows-[auto_auto_1fr]">
            <div className="flex flex-col gap-5">
              <h3 className={H3}>Avec un compte Squiggle</h3>
              <p className="m-0 flex items-baseline gap-2">
                <span className="font-display text-6xl leading-none font-semibold tracking-[-0.03em]">
                  {PRICE_MONTHLY}
                </span>
                <span className="text-lg text-muted">par mois</span>
              </p>
              <p className="m-0 text-base text-muted">Sans engagement, résiliable à tout moment depuis Mon compte.</p>
            </div>
            <ul
              aria-label="Ce qui est compris"
              className="m-0 grid list-none content-center gap-4 p-0 text-lg md:row-span-2 lg:row-span-1"
            >
              {INCLUDED.map((text) => (
                <li key={text} className="flex gap-3">
                  <SquiggleMark />
                  {text}
                </li>
              ))}
            </ul>
            <div className="grid gap-3 self-end pt-1">
              <Link to="/connexion" className={`${PRIMARY_BUTTON} w-fit max-sm:w-full`}>
                Essayer gratuitement
              </Link>
              <p className="m-0 text-base">{FREE_ANALYSES} analyses offertes, sans carte bancaire.</p>
            </div>
          </div>
          <div aria-labelledby="propre-cle" className="flex flex-col gap-5 rounded-card border border-border p-6 md:p-10" role="group">
            <h3 id="propre-cle" className={H3}>
              Gratuit avec votre propre clé
            </h3>
            <p className="m-0 flex items-baseline gap-2">
              <span className="font-display text-6xl leading-none font-semibold tracking-[-0.03em]">0 €</span>
              <span className="text-lg text-muted">dans l’extension</span>
            </p>
            <p className="m-0 text-base leading-relaxed">
              Squiggle ne vous facture rien. La partie IA tourne sur votre propre compte chez un fournisseur d’IA (
              {OWN_KEY_PROVIDERS}), qui vous facture directement : en général quelques centimes par analyse.
            </p>
            <p className="m-0 text-base leading-relaxed text-muted">
              {API_KEY_MEANS} La clé reste dans votre navigateur, rien ne passe par nos serveurs.
            </p>
            <p className="m-0 text-base leading-relaxed text-muted">
              Pas de compte chez un fournisseur ? Le compte Squiggle marche sans réglage.
            </p>
            <div className="mt-auto grid gap-3 pt-1">
              {storeUrl ? (
                <a href={storeUrl} className={`${SECONDARY_BUTTON} w-fit max-sm:w-full`}>
                  {installLabelFor(storeUrl, userAgent)}
                </a>
              ) : (
                <p className="m-0 text-base text-muted">Sur ordinateur, avec Chrome, Edge, Opera, Brave ou Firefox.</p>
              )}
              <p className="m-0 text-base">Vous ne payez que votre fournisseur d’IA.</p>
            </div>
          </div>
        </div>
        <ul className="mt-6 grid list-none gap-2 p-0 text-base text-muted sm:flex sm:flex-wrap sm:items-baseline sm:gap-x-8">
          <li>
            Enseignants : gratuit, sur demande.{' '}
            <Link to="/enseignants" className={QUIET_LINK}>
              L’offre enseignants
            </Link>
          </li>
        </ul>
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
