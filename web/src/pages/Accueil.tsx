/**
 * The home page, also at `/tarifs`. Its first screen keeps the first landing's
 * proportions and its isometric drawing, the reading played in a loop the reader can
 * pause; the rest is said with drawings rather than paragraphs: how a report is made,
 * the same grid for every article, the three ways in, the price and what it pays for,
 * teachers, the data and the open code, every question.
 *
 * The way in it puts first follows the reader's device, and it only draws or names
 * gestures that exist there: the extension on a computer, the site and the app's place
 * in the Share menu on Android, the site and the bookmark on an iPhone. The device is
 * read from `<html data-device>` (set before the first paint, `index.html`), so the
 * page the build renders is right from its first paint; only the browser's own install
 * prompt, which arrives later, changes a button.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { HOSTED_ANALYSIS } from '../../../shared/src/hosted/disclosure';
import { Exemple } from '../components/Exemple';
import { Trajet } from '../components/Trajet';
import {
  ClassFigure,
  CriterionFigure,
  DeviceFigure,
  ExternalMark,
  HeroFigure,
  SquiggleMark,
  StepFigure,
  type Criterion,
  type Step,
} from '../components/Iso';
import { H1, H3, LEAD, MEASURE, PAGE, PRIMARY_BUTTON, QUIET_LINK, SECONDARY_BUTTON, Section } from '../components/Landing';
import { CONTACT_URL } from '../components/Layout';
import { count, installClick } from '../count';
import { DOMAINS, VERIFICATION_STATES } from '../demo';
import { installLabelFor, installUrlFor, isStandalone, useInstall, useUserAgent } from '../install';
import { useBrowserValue } from '../client';
import {
  FREE_ANALYSES,
  GITHUB_URL,
  MONTHLY_ANALYSES,
  OWN_KEY_TOP_MODEL_MONTHLY,
  PRICE_MONTHLY,
  TAGLINE,
} from '../offer';
import { Link } from '../router';

/** Who bills an own-key analysis, named so a reader knows which key to bring. */
const OWN_KEY_PROVIDERS = 'OpenAI, Anthropic, Google Gemini ou OpenRouter';
const API_KEY_MEANS =
  'Une clé d’API, c’est le code d’accès personnel que ce fournisseur vous donne sur son site : vous le collez une fois dans l’extension.';


export const FAQ: Array<[string, ReactNode]> = [
  [
    'Une analyse peut-elle se tromper ?',
    'Oui. Chaque constat cite la phrase exacte et sa raison : vous vérifiez par vous-même.',
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
    `Rien à Squiggle. La partie IA de l’analyse tourne sur votre propre compte chez un fournisseur d’IA (${OWN_KEY_PROVIDERS}), qui vous facture directement chaque analyse, au tarif du modèle choisi. Avec un modèle haut de gamme, par exemple Claude Opus : ${OWN_KEY_TOP_MODEL_MONTHLY} pour ${MONTHLY_ANALYSES} analyses. ${API_KEY_MEANS} Sans compte chez un fournisseur, le compte Squiggle est plus simple : rien à installer, aucune clé à créer.`,
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


/**
 * The two ways in, side by side on the same rows, so a reader compares like with like:
 * the account's real difference is where it works and that it needs nothing set up.
 * The report row says what both reports contain, never that their quality is the same:
 * that depends on the model a reader plugs in.
 */
const COMPARISON: Array<[string, ReactNode, ReactNode]> = [
  [
    'Où l’utiliser',
    'Sur le site, dans l’appli de votre téléphone et dans le bouton du navigateur',
    'Dans l’extension du navigateur, sur ordinateur',
  ],
  [
    'Ce qu’il faut préparer',
    'Rien à installer, aucune clé à créer',
    `Un compte chez un fournisseur d’IA (${OWN_KEY_PROVIDERS}), et une clé d’API à coller dans l’extension`,
  ],
  [
    'Analyses',
    `${MONTHLY_ANALYSES} par mois`,
    'Sans limite, chacune facturée par votre fournisseur',
  ],
  [
    'Ce que vous payez',
    `${PRICE_MONTHLY} par mois, tout compris`,
    <>
      La facture de votre fournisseur, qui dépend du modèle choisi. Avec un modèle haut de gamme, par exemple
      Claude&nbsp;Opus&nbsp;: <strong className="font-semibold text-foreground">{OWN_KEY_TOP_MODEL_MONTHLY}</strong> pour{' '}
      {MONTHLY_ANALYSES} analyses.
    </>,
  ],
  ['Le rapport', 'Passages surlignés, raisons, note sur 100', 'Passages surlignés, raisons, note sur 100'],
  ['Publicité et traceurs', 'Aucun', 'Aucun'],
];

/**
 * The comparison's cells. A table on a wide screen, the account's column outlined in the
 * accent; on a phone the two prices sit side by side, then each row stacks its label above
 * the two answers, each tagged with its way in, since the column heads are scrolled away.
 */
const LABEL_CELL =
  'border-t border-lineSoft py-5 pr-6 text-left align-top text-base font-medium max-md:pb-1 md:w-[22%]';
const ACCOUNT_CELL =
  'border-lineSoft bg-surface px-4 py-5 align-top text-base leading-normal md:w-[39%] md:border-x md:border-t md:border-x-accent/50 md:px-8 max-md:rounded-control max-md:border max-md:border-accent/50 max-md:py-3';
const OWN_KEY_CELL =
  'border-lineSoft px-4 py-5 align-top text-base leading-normal text-muted md:w-[39%] md:border-t md:px-8 max-md:rounded-control max-md:border max-md:border-border max-md:py-3';
/** The way in each answer belongs to, on a phone only: on a wide screen the column head says it. */
const TAG = 'mb-1 block text-sm font-medium text-foreground md:hidden';


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

/**
 * The two ways to pay, row for row: the account's column outlined in the accent, each
 * column ending on its own action, the store this browser installs from or none.
 */
function Comparison() {
  const userAgent = useUserAgent();
  const storeUrl = installUrlFor(userAgent);
  return (
    <table className="w-full border-separate border-spacing-0 text-left max-md:block">
      <caption className="sr-only">Le compte Squiggle et votre propre clé, comparés</caption>
      <thead className="max-md:block">
        <tr className="max-md:grid max-md:grid-cols-2 max-md:gap-3">
          <td className="max-md:hidden" />
          <th
            scope="col"
            className="rounded-t-card border-x border-t border-accent/50 bg-surface p-4 align-top font-normal md:w-[39%] md:px-8 md:pt-8 md:pb-6 max-md:rounded-card max-md:border"
          >
            <span className={`block ${H3}`}>Avec un compte Squiggle</span>
            <span className="mt-4 flex flex-wrap items-baseline gap-x-2">
              <span className="font-display text-4xl leading-none font-semibold tracking-[-0.03em] md:text-6xl">
                {PRICE_MONTHLY}
              </span>
              <span className="text-base text-muted md:text-lg">par mois</span>
            </span>
            <span className="mt-4 block text-base text-muted">Sans engagement, résiliable à tout moment.</span>
          </th>
          <th
            id="propre-cle"
            scope="col"
            className="p-4 align-top font-normal md:w-[39%] md:px-8 md:pt-8 md:pb-6 max-md:rounded-card max-md:border max-md:border-border"
          >
            <span className={`block ${H3}`}>Gratuit avec votre propre clé</span>
            <span className="mt-4 flex flex-wrap items-baseline gap-x-2">
              <span className="font-display text-4xl leading-none font-semibold tracking-[-0.03em] md:text-6xl">
                0 €
              </span>
              <span className="text-base text-muted md:text-lg">chez Squiggle</span>
            </span>
            <span className="mt-4 block text-base text-muted">
              Squiggle ne vous facture rien : la partie IA tourne sur votre propre compte chez un fournisseur d’IA,
              qui vous facture directement.
            </span>
          </th>
        </tr>
      </thead>
      <tbody className="max-md:block">
        {COMPARISON.map(([label, account, ownKey]) => (
          <tr key={label} className="max-md:mt-3 max-md:grid max-md:gap-2">
            <th scope="row" className={LABEL_CELL}>
              {label}
            </th>
            <td className={ACCOUNT_CELL}>
              <span aria-hidden="true" className={TAG}>
                Avec un compte
              </span>
              {account}
            </td>
            <td className={OWN_KEY_CELL}>
              <span aria-hidden="true" className={TAG}>
                Avec votre propre clé
              </span>
              {ownKey}
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot className="max-md:block">
        <tr className="max-md:mt-6 max-md:grid max-md:gap-6">
          <td className="max-md:hidden" />
          <td className="rounded-b-card border-x border-b border-accent/50 bg-surface px-4 pt-6 pb-6 align-top md:border-t md:border-t-lineSoft md:px-8 md:pb-8 max-md:rounded-card max-md:border max-md:p-5">
            <Link to="/analyser" className={`${PRIMARY_BUTTON} w-fit max-sm:w-full`}>
              Essayer gratuitement
            </Link>
            <p className="mt-3 mb-0 text-base">{FREE_ANALYSES} analyses offertes, sans carte bancaire.</p>
          </td>
          <td className="border-lineSoft px-4 pt-6 pb-6 align-top md:border-t md:px-8 md:pb-8 max-md:rounded-card max-md:border max-md:border-border max-md:p-5">
            {storeUrl ? (
              <a
                href={storeUrl}
                onClick={() => count(installClick(storeUrl))}
                className={`${SECONDARY_BUTTON} w-fit max-sm:w-full`}
              >
                {installLabelFor(storeUrl, userAgent)}
              </a>
            ) : (
              <p className="m-0 text-base text-muted">Sur ordinateur, avec Chrome, Edge, Opera, Brave ou Firefox.</p>
            )}
            <p className="mt-3 mb-0 text-base">Vous ne payez que votre fournisseur d’IA.</p>
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

/** What `<html data-device>` shows: one block per device, before the app has run. */
const ON_COMPUTER = '[html[data-device=android]_&]:hidden [html[data-device=ios]_&]:hidden';
const ON_PHONE = 'hidden [html[data-device=android]_&]:block [html[data-device=ios]_&]:block';
const ON_ANDROID = 'hidden [html[data-device=android]_&]:block';
const ON_IOS = 'hidden [html[data-device=ios]_&]:block';
/** A phone-only part of a row of buttons: it takes its place in the row, as `contents` does on a computer. */
const ON_PHONE_INLINE = 'hidden [html[data-device=android]_&]:contents [html[data-device=ios]_&]:contents';

const BODY = 'm-0 text-lg leading-relaxed text-foreground';
const ACTIONS = 'flex flex-wrap items-center gap-3 max-sm:flex-col max-sm:items-stretch';
const PLAIN_LIST = 'm-0 grid list-none gap-2 p-0 text-lg leading-snug';
/** A link inside a sentence: its touch target grows to 44 px without moving the line. */
const INLINE_LINK =
  "relative underline decoration-accent underline-offset-4 hover:text-accentInk after:absolute after:inset-x-0 after:-inset-y-3 after:content-['']";

/** The brand's squiggle as a bullet: kept for the teachers, where it signs the offer. */
function Marks({ items, label }: { items: ReactNode[]; label: string }) {
  return (
    <ul aria-label={label} className="m-0 grid list-none gap-3 p-0 text-lg leading-snug">
      {items.map((item, index) => (
        <li key={index} className="flex gap-3">
          <SquiggleMark />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** The extension from this browser's store; where there is none (Safari), `fallback`. */
function StoreAction({ className, fallback }: { className: string; fallback: ReactNode }) {
  const userAgent = useUserAgent();
  const storeUrl = installUrlFor(userAgent);
  return storeUrl ? (
    <a href={storeUrl} onClick={() => count(installClick(storeUrl))} className={className}>
      {installLabelFor(storeUrl, userAgent)}
    </a>
  ) : (
    <>{fallback}</>
  );
}

/**
 * Installing the app on Android, whatever the browser offers: its own prompt when it
 * has one, a word for the reader inside the installed app, and otherwise the gesture
 * in Chrome's menu, with the bookmark as the other way in.
 */
function AndroidInstall() {
  const install = useInstall();
  const standalone = useBrowserValue(isStandalone, false);
  if (install?.kind === 'prompt') {
    return (
      <button type="button" onClick={install.prompt} className={`${SECONDARY_BUTTON} w-fit max-sm:w-full`}>
        Installer l’appli
      </button>
    );
  }
  if (standalone) return <p className={BODY}>L’appli est installée : partagez un article vers Squiggle.</p>;
  return (
    <div className="grid gap-2">
      {/* Chrome names the entry either way, depending on its version. */}
      <p className={BODY}>
        Dans Chrome : menu ⋮, puis «&nbsp;Installer l’application&nbsp;» ou «&nbsp;Ajouter à l’écran d’accueil&nbsp;».
      </p>
      <p className="m-0">
        <Link to="/favori" className={QUIET_LINK}>
          Ou le favori Squiggle
        </Link>
      </p>
    </div>
  );
}

/**
 * The hero's reading, in a loop, with its own pause: a pause shows the whole reading,
 * still. Off screen the loop waits where it is. Without motion there is no loop to
 * pause, and no button.
 */
/** A moment of the 12 s loop where everything is on the sheet (`.hero-loop` in `index.css`). */
const RESUME_AT = 6000;

function LoopingHero() {
  const box = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const svg = box.current?.querySelector('svg');
    if (!svg) return;
    const wasPaused = svg.hasAttribute('data-paused');
    svg.toggleAttribute('data-paused', paused);
    // Played again, the loop goes on from the whole reading the reader was looking at, not from a bare article.
    if (wasPaused && !paused) for (const animation of svg.getAnimations({ subtree: true })) animation.currentTime = RESUME_AT;
  }, [paused]);

  useEffect(() => {
    const svg = box.current?.querySelector('svg');
    if (!svg || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => svg.toggleAttribute('data-offscreen', !entry.isIntersecting));
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  return (
    <figure className="m-0 lg:-mt-36">
      <div ref={box} className="relative">
        <HeroFigure loop />
        {/* A quiet control on the drawing itself: 44 px to touch, named for assistive technology. */}
        <button
          type="button"
          onClick={() => setPaused((value) => !value)}
          aria-label={paused ? 'Relancer l’animation' : 'Mettre l’animation en pause'}
          title={paused ? 'Relancer l’animation' : 'Mettre l’animation en pause'}
          className="absolute right-0 bottom-0 inline-flex h-11 w-11 items-center justify-center rounded-full border border-borderControl bg-background/80 text-foreground transition-colors duration-160 ease-out hover:border-accent hover:text-accentInk motion-reduce:hidden"
        >
          <svg viewBox="0 0 16 16" className="h-5 w-5" aria-hidden="true">
            {paused ? (
              <path d="M5 3.5v9l7.5-4.5z" fill="currentColor" />
            ) : (
              <path d="M4.5 3h2.5v10H4.5zM9 3h2.5v10H9z" fill="currentColor" />
            )}
          </svg>
        </button>
      </div>
      <figcaption className="mt-4">
        <ol className="m-0 grid list-none gap-x-6 gap-y-2 p-0 text-lg text-foreground sm:grid-cols-3">
          {['Le passage fragile, surligné.', 'La raison, en une phrase.', 'Une note sur 100.'].map((text, index) => (
            <li key={text} className="flex items-baseline gap-3">
              <span
                aria-hidden="true"
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-accentForeground"
              >
                {index + 1}
              </span>
              {text}
            </li>
          ))}
        </ol>
      </figcaption>
    </figure>
  );
}

/** "aux Pays-Bas", "en France": where a host country is, in a sentence. */
function inCountry(country: string): string {
  return /^(Pays-Bas|États-Unis)$/.test(country) ? `aux ${country}` : `en ${country}`;
}

/** Where the account's analyses run, from `shared/`, so the page cannot name a host the server no longer uses. */
const HOST_COUNTRIES = [...new Set(HOSTED_ANALYSIS.inferenceHosts.map((host) => host.country))];
const WHERE = `${HOSTED_ANALYSIS.modelLabel}, servie ${inCountry(HOST_COUNTRIES[0])} d’abord${
  HOST_COUNTRIES.length > 1 ? `, sinon ${HOST_COUNTRIES.slice(1).map(inCountry).join(' ou ')}` : ''
}.`;

/** How a report is made, one drawing a stage, a line each. */
const STAGES: Array<{ step: Step; title: string; text: string; detail?: string; then?: string }> = [
  { step: 'article', title: 'Vous donnez l’article', text: 'Collé, partagé ou d’un clic.', then: 'le texte' },
  {
    step: 'lecture',
    title: 'Une IA le relit en entier',
    text: 'Faits, logique, cadrage, sources et langue.',
    detail: `Avec un compte : ${WHERE}`,
    then: 'les doutes',
  },
  {
    step: 'sources',
    title: 'Les doutes sont vérifiés',
    text: 'Dans les sources. Si elles donnent raison à l’article, le doute est retiré.',
    then: 'les constats',
  },
  { step: 'rapport', title: 'Vous lisez le rapport', text: 'Passages surlignés, raisons, note sur 100.' },
];

/** The question the named model raises, answered from the same constant. */
const WHICH_AI: [string, ReactNode] = [
  'Quelle IA, et où ?',
  <>
    Avec un compte : {WHERE} Elle reçoit l’article sans votre identité. Avec votre propre clé, c’est le modèle que vous
    choisissez.{' '}
    <Link to="/transparence" className={QUIET_LINK}>
      Le trajet des données
    </Link>
  </>,
];
/** The landing's questions, with the model's after the one about where the article goes. */
const QUESTIONS: Array<[string, ReactNode]> = [...FAQ.slice(0, 2), WHICH_AI, ...FAQ.slice(2)];

const CARD = 'rounded-card border border-border bg-surface p-6';

/** Each criterion of the grid (`DOMAINS`, by its full name), as its drawing and one word. */
export const CRITERIA: Record<string, [Criterion, string]> = {
  'Robustesse factuelle et sourcing': ['sources', 'Sources'],
  'Solidité logique et argumentative': ['logique', 'Logique'],
  'Cadrage et procédés rhétoriques': ['cadrage', 'Cadrage'],
  'Déontologie et transparence': ['transparence', 'Transparence'],
  'Soin de la langue': ['langue', 'Langue'],
};
/** The trial without an account is becoming a single one: the page promises a trial, not a daily analysis. */
const OFFER = `Essai gratuit, sans carte. Puis ${PRICE_MONTHLY} par mois.`;

/** What the subscription pays for, shown with the stages it pays for. */
const PAID_FOR: Array<[Step | null, string]> = [
  ['lecture', 'L’IA qui relit chaque article'],
  ['sources', 'Les sources consultées'],
  [null, 'Un outil financé par ses lecteurs : ni publicité, ni revente de données'],
];

export function Accueil() {
  return (
    <>
      {/* The landing's first screen, at its proportions; the drawing reads the article again and again. */}
      <div className={`${PAGE} pt-10 pb-16 md:pt-20 md:pb-24`}>
        <h1 className={`${H1} max-w-[14ch]`}>{TAGLINE}</h1>
        <div className="mt-6 grid items-start gap-6 md:mt-10 md:gap-10 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-16">
          <div>
            {/* The one sentence that says what Squiggle is: in full ink, not grey. */}
            <p className={LEAD.replace('text-muted', 'text-foreground')}>
              Squiggle relit l’article que vous lisez. Il surligne ce qui est fragile, dit pourquoi, et montre aussi ce
              qui tient.
            </p>
            <div className={`mt-8 ${ACTIONS}`}>
              <span className={`contents ${ON_COMPUTER}`}>
                <StoreAction
                  className={`${PRIMARY_BUTTON} max-sm:w-full`}
                  fallback={
                    <Link to="/analyser" className={`${PRIMARY_BUTTON} max-sm:w-full`}>
                      Analyser un article
                    </Link>
                  }
                />
              </span>
              <span className={ON_PHONE_INLINE}>
                <Link to="/analyser" className={`${PRIMARY_BUTTON} max-sm:w-full`}>
                  Analyser un article
                </Link>
              </span>
              <a href="#exemple" onClick={() => count('click_example')} className={`${SECONDARY_BUTTON} max-sm:w-full`}>
                Voir un exemple
              </a>
            </div>
            {/* The way in that this device has besides the button, in one line, then the offer. */}
            <p className={`mt-5 mb-0 text-lg text-foreground ${ON_COMPUTER}`}>
              Sans extension :{' '}
              <Link to="/analyser" className={INLINE_LINK}>
                collez le texte sur le site
              </Link>
              .
            </p>
            <p className={`mt-5 mb-0 text-lg text-foreground ${ON_ANDROID}`}>
              Ou partagez l’article vers{' '}
              <a href="#partout" className={INLINE_LINK}>
                l’appli Squiggle
              </a>
              .
            </p>
            <p className={`mt-5 mb-0 text-lg text-foreground ${ON_IOS}`}>
              Ou{' '}
              <Link to="/favori" className={INLINE_LINK}>
                le favori Squiggle
              </Link>
              , sur l’article ouvert dans Safari.
            </p>
            <p className="mt-2 mb-0 text-lg text-foreground">{OFFER}</p>
          </div>

          <LoopingHero />
        </div>
      </div>

      <Section
        id="exemple"
        title={
          <>
            <span className={ON_COMPUTER}>Cliquez sur un passage surligné</span>
            <span className={ON_PHONE}>Touchez un passage surligné</span>
          </>
        }
        intro="Le rapport donne sa raison, à côté."
      >
        <Exemple />
        <p className={`mt-10 mb-0 ${BODY} ${MEASURE}`}>
          Chaque raison porte un nom, du faux dilemme au chiffre sans origine.{' '}
          <Link to="/glossaire" className={INLINE_LINK}>
            Le glossaire de l’esprit critique
          </Link>{' '}
          les explique un par un, exemples à l’appui.
        </p>
      </Section>

      {/* How a report is made: the four drawings carry it, a line each. */}
      <Section id="comment" title="Comment ça marche" intro="Une à deux minutes, de l’article au rapport.">
        <ol className="m-0 grid list-none gap-0 p-0 lg:grid-cols-4 lg:gap-8">
          {STAGES.map(({ step, title, text, detail, then }, index) => (
            <li
              key={step}
              className="relative grid content-start grid-cols-[7.5rem_minmax(0,1fr)] gap-x-5 lg:grid-cols-1 lg:gap-y-6"
            >
              <div className="lg:pr-12 lg:pl-1">
                <StepFigure step={step} />
              </div>
              <div>
                <p className="m-0 font-display text-base font-semibold text-foreground tabular-nums">{index + 1}</p>
                <h3 className={`${H3} mt-1`}>{title}</h3>
                <p className={`mt-2 ${BODY}`}>{text}</p>
                {detail ? <p className="mt-2 mb-0 text-base text-muted">{detail}</p> : null}
              </div>
              {then ? <Then label={then} /> : null}
            </li>
          ))}
        </ol>
        <p className={`mt-10 ${BODY} ${MEASURE}`}>
          Une IA peut se tromper : chaque constat cite la phrase exacte, vous vérifiez par vous-même.
        </p>
      </Section>

      {/* The grid, shown: one drawing, one word and the reason Squiggle gives, a criterion. */}
      {/* The campaign's way in lands on the section's promise, its title and "chaque camp". */}
      <span id="presidentielle" aria-hidden="true" />
      <Section id="grille" title="La même grille pour tous" intro="Cinq critères, pour chaque article et chaque camp.">
        <ul className="m-0 grid list-none gap-6 p-0 sm:grid-cols-2 lg:grid-cols-5 lg:gap-8">
          {DOMAINS.map(([label, , , { note }]) => {
            const [kind, word] = CRITERIA[label];
            return (
              <li key={label} className="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-x-4 lg:grid-cols-1 lg:items-start lg:gap-y-3">
                <CriterionFigure kind={kind} />
                <div className="grid gap-1">
                  <h3 className="m-0 font-display text-xl font-semibold">
                    {word}
                    <span className="sr-only"> : {label}</span>
                  </h3>
                  <p className="m-0 text-lg leading-snug text-foreground">{note}</p>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="mt-14">
          <h3 className={H3}>Un fait n’est jamais déclaré «&nbsp;faux&nbsp;»</h3>
          <dl className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            {VERIFICATION_STATES.map(({ state, label, hint, chip }) => (
              <div key={state} className="grid content-start justify-items-start gap-2">
                <dt>
                  <span className={`inline-block rounded-md border px-3 py-1 text-sm font-medium ${chip}`}>{label}</span>
                </dt>
                <dd className="m-0 text-base text-foreground">{hint}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="mt-8 mb-0">
          <Link to="/glossaire" className={QUIET_LINK}>
            Glossaire de l’esprit critique
          </Link>
        </p>
      </Section>

      {/* The three ways in, the reader's own device first, each drawn as it is on that device. */}
      <Section id="partout" title="Où que vous lisiez" intro="Un seul compte, partout. Aucune extension obligatoire.">
        <ul className="m-0 grid list-none gap-10 p-0 md:grid-cols-3">
          <li className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-5 md:flex md:flex-col md:gap-4 [html[data-device=android]_&]:order-2 [html[data-device=ios]_&]:order-2">
            <div className="md:flex md:h-48 md:items-end md:justify-center">
              <div className="w-full md:max-w-56">
                <DeviceFigure device="site" />
              </div>
            </div>
            <div className="grid content-start gap-3 md:flex md:flex-1 md:flex-col">
              <h3 className={H3}>Sur le site</h3>
              <p className={BODY}>Collez le texte. Rien à installer.</p>
              <div className="md:mt-auto md:pt-2">
                <Link to="/analyser" className={`${SECONDARY_BUTTON} w-fit max-sm:w-full`}>
                  Analyser un article
                </Link>
              </div>
            </div>
          </li>
          {/* On a phone this card is the reader's own way in: first, full width, its drawing large enough to read. */}
          <li className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-5 md:flex md:flex-col md:gap-4 [html[data-device=android]_&]:order-1 [html[data-device=android]_&]:max-md:grid-cols-1 [html[data-device=android]_&]:max-md:gap-y-4 [html[data-device=ios]_&]:order-1 [html[data-device=ios]_&]:max-md:grid-cols-1 [html[data-device=ios]_&]:max-md:gap-y-4">
            <div className="md:flex md:h-48 md:items-end md:justify-center">
              <div className={`w-full max-md:max-w-64 md:max-w-56 ${ON_ANDROID}`}>
                <DeviceFigure device="partage" />
              </div>
              <div className={`w-full max-md:max-w-64 md:max-w-56 ${ON_IOS}`}>
                <DeviceFigure device="favori" />
              </div>
              <div className={`grid w-full grid-cols-2 gap-2 md:max-w-80 ${ON_COMPUTER}`}>
                <DeviceFigure device="partage" />
                <DeviceFigure device="favori" />
              </div>
            </div>
            <div className="grid content-start gap-3 md:flex md:flex-1 md:flex-col">
              <h3 className={H3}>Sur votre téléphone</h3>
              <div className={ON_ANDROID}>
                <p className={BODY}>Installez l’appli : elle apparaît dans le menu Partager de votre journal.</p>
                <div className="mt-3">
                  <AndroidInstall />
                </div>
              </div>
              <div className={ON_IOS}>
                <p className={BODY}>Le favori Squiggle lit l’article ouvert dans Safari.</p>
                <div className="mt-3">
                  <Link to="/favori" className={`${SECONDARY_BUTTON} w-fit max-sm:w-full`}>
                    Le favori Squiggle
                  </Link>
                </div>
              </div>
              <div className={ON_COMPUTER}>
                <p className={BODY}>Sur Android, l’appli et son menu Partager. Sur iPhone, le favori dans Safari.</p>
                <p className="mt-3 mb-0">
                  <Link to="/favori" className={QUIET_LINK}>
                    Le guide pour votre téléphone
                  </Link>
                </p>
              </div>
            </div>
          </li>
          <li className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-5 md:flex md:flex-col md:gap-4 [html[data-device=android]_&]:order-3 [html[data-device=ios]_&]:order-3">
            <div className="md:flex md:h-48 md:items-end md:justify-center">
              <div className="w-full md:max-w-56">
                <DeviceFigure device="navigateur" />
              </div>
            </div>
            <div className="grid content-start gap-3 md:flex md:flex-1 md:flex-col">
              <h3 className={H3}>Dans votre navigateur</h3>
              {/* The Firefox for Android build is not published yet: the page names the computer only. */}
              <p className={BODY}>Un bouton sur ordinateur, dans Chrome, Edge, Opera, Brave ou Firefox.</p>
              <div className={`md:mt-auto md:pt-2 ${ON_COMPUTER}`}>
                <StoreAction className={`${SECONDARY_BUTTON} w-fit max-sm:w-full`} fallback={null} />
              </div>
            </div>
          </li>
        </ul>
      </Section>

      {/* The subscription first and what it pays for; the free way for those who have a key; every row one tap away. */}
      <Section id="tarifs" title="Tarifs" intro={`${PRICE_MONTHLY} par mois, sans engagement.`}>
        <div className="grid gap-4 md:grid-cols-3">
          <div className={`${CARD} grid content-start gap-6 border-accent/50 md:col-span-2`}>
            <div className="grid gap-3">
              <h3 className={H3}>Avec un compte Squiggle</h3>
              <p className="m-0 flex flex-wrap items-baseline gap-x-2">
                <span className="font-display text-5xl leading-none font-semibold tracking-[-0.03em] md:text-6xl">
                  {PRICE_MONTHLY}
                </span>
                <span className="text-lg text-muted">par mois</span>
              </p>
            </div>
            <ul className={PLAIN_LIST}>
              <li>Un essai sans compte, pour voir</li>
              <li>{FREE_ANALYSES} analyses offertes avec un compte, sans carte bancaire</li>
              <li>{MONTHLY_ANALYSES} analyses par mois, rien à installer</li>
            </ul>
            <div>
              <h4 className="m-0 text-lg font-semibold">Ce que paie votre abonnement</h4>
              <ul className="mt-3 mb-0 grid list-none gap-3 p-0">
                {PAID_FOR.map(([step, text]) => (
                  <li key={text} className="flex items-center gap-4 text-lg leading-snug">
                    <span className="w-16 shrink-0" aria-hidden="true">
                      {step ? <StepFigure step={step} /> : null}
                    </span>
                    {text}
                  </li>
                ))}
              </ul>
            </div>
            <Link to="/analyser" className={`${PRIMARY_BUTTON} w-fit max-sm:w-full`}>
              Essayer gratuitement
            </Link>
          </div>
          <div className={`${CARD} grid content-start gap-4 ${ON_COMPUTER}`}>
            <h3 className={H3}>Vous avez déjà une clé d’IA ?</h3>
            <p className={BODY}>
              L’extension est gratuite chez Squiggle : votre fournisseur d’IA facture chaque analyse, {OWN_KEY_TOP_MODEL_MONTHLY}{' '}
              pour {MONTHLY_ANALYSES} analyses avec un modèle haut de gamme. La clé reste dans votre navigateur.
            </p>
            <StoreAction className={`${SECONDARY_BUTTON} w-fit max-sm:w-full`} fallback={null} />
          </div>
        </div>
        <p className={`mt-6 ${BODY} ${MEASURE} ${ON_PHONE}`}>
          Sur ordinateur, l’extension marche aussi avec votre propre clé d’IA : votre fournisseur facture chaque analyse.
        </p>

        <details className="group mt-8">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 font-display text-xl font-medium [&::-webkit-details-marker]:hidden">
            <span
              aria-hidden="true"
              className="text-2xl leading-none text-accentInk transition-transform duration-160 ease-out group-open:rotate-45 motion-reduce:transition-none"
            >
              +
            </span>
            Comparer ligne à ligne
          </summary>
          <div className="mt-6">
            <Comparison />
          </div>
          <p className={`mt-8 ${BODY} ${MEASURE}`}>
            {API_KEY_MEANS} La clé reste dans votre navigateur, rien ne passe par nos serveurs.
          </p>
        </details>
      </Section>

      {/* Teachers: the class at work, and the offer in a few lines. */}
      <Section id="enseignants" title="Gratuit pour la classe">
        <div className="grid items-start gap-10 md:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] md:gap-16">
          <div className="max-w-72 md:max-w-none">
            <ClassFigure />
          </div>
          <div>
            <Marks
              label="L’offre enseignants"
              items={[
                'Les élèves n’utilisent pas d’IA : vous montrez, ils lisent.',
                'L’abonnement complet, avec une adresse académique.',
                'Le mode classe : l’article au tableau, analysé ensemble.',
                'Une fiche d’activité et une grille de lecture à imprimer.',
              ]}
            />
            <div className="mt-8">
              <Link to="/enseignants" className={`${SECONDARY_BUTTON} w-fit max-sm:w-full`}>
                L’offre enseignants
              </Link>
            </div>
          </div>
        </div>
      </Section>

      {/* Trust: what happens to the article, as a path, and the rules the reading keeps. */}
      <Section id="donnees" title="Vos données" intro="Ce que vous lisez ne sert qu’à votre analyse.">
        <Trajet
          bare
          label="Le trajet d’un article"
          nodes={[
            { name: 'Votre article', note: 'la page ou le texte collé' },
            { name: 'L’analyse', note: 'une à deux minutes' },
            { name: 'Votre rapport', note: 'puis l’article est oublié' },
          ]}
          links={['sans votre identité', 'les constats']}
        />
        <ul className={`mt-10 ${PLAIN_LIST}`}>
          <li>Aucune publicité, aucun traceur.</li>
          <li>Les mêmes critères pour chaque article.</li>
          <li>Le texte est jugé, jamais son auteur.</li>
          <li>La méthode et le code sont publics.</li>
        </ul>
        <p className="mt-6 mb-0 flex flex-wrap gap-x-8 gap-y-2">
          <Link to="/transparence" className={QUIET_LINK}>
            Voir le trajet des données
          </Link>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer noopener" className={QUIET_LINK}>
            Lire la méthode et le code sur GitHub
            <ExternalMark />
          </a>
        </p>
      </Section>

      <Section id="faq" title="Questions fréquentes">
        <div className={`grid ${MEASURE}`}>
          {QUESTIONS.map(([question, answer]) => (
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
              <p className={`pb-5 ${BODY}`}>{answer}</p>
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
