import type { ReactNode } from 'react';

import {
  BrowserFigure,
  GridFigure,
  LensFigure,
  OpenFigure,
  PasteFigure,
  ReadFigure,
  ReportFigure,
  ReportTileFigure,
  ServerFigure,
  Stations,
  TextFigure,
} from '../components/Figures';
import { HeroFigure } from '../components/HeroFigure';
import { LandingShell, MEASURE, PAGE, PRIMARY_BUTTON, QUIET_LINK, SECONDARY_BUTTON, Section } from '../components/Landing';
import { CONTACT_URL } from '../components/Layout';
import { ReportDiagram } from '../components/ReportDiagram';
import { CHROME_URL, FIREFOX_URL, installLabelFor, installUrlFor, isMobile, useInstall } from '../install';
import { frenchSpacing } from '../format';
import { DAILY_ANALYSES, FREE_ANALYSES, GITHUB_URL, PRICE_MONTHLY, SUBSCRIBE_LABEL, TAGLINE } from '../offer';
import { Link } from '../router';

const STEPS = [
  {
    figure: <PasteFigure />,
    title: 'Vous collez l’article',
    note: 'Sur le site, dans l’appli, ou d’un clic sur ordinateur.',
  },
  {
    figure: <ReadFigure />,
    title: 'Squiggle le relit',
    note: 'Phrase par phrase, même grille pour tous. S’il met un fait en question, il consulte d’abord les sources.',
  },
  {
    figure: <ReportFigure />,
    title: 'Vous lisez son avis',
    note: 'Une note sur 100, les passages fragiles et leur raison. En une à deux minutes.',
  },
];

const NEUTRALITY = [
  ['Une seule grille', 'Mêmes questions, mêmes poids, quel que soit le média ou le bord.', <GridFigure key="grille" />],
  ['Une méthode publique', 'Grille et code en ligne : une note se vérifie et se conteste.', <OpenFigure key="methode" />],
  ['Le texte, jamais l’auteur', 'Aucun verdict sur une personne ou un média.', <TextFigure key="texte" />],
] as const;

const DATA_FLOW = [
  { figure: <BrowserFigure />, title: 'Votre navigateur', note: 'Envoie le texte de l’article.' },
  { figure: <ServerFigure />, title: 'Notre serveur', note: 'Le transmet sans l’écrire nulle part.' },
  { figure: <LensFigure />, title: 'Le service d’analyse', note: 'Le lit le temps de l’analyse.' },
  { figure: <ReportTileFigure />, title: 'Le rapport', note: 'Gardé 30 jours, avec de courts extraits.' },
];

const FAQ: Array<[string, ReactNode]> = [
  ['Sur quel appareil ?', 'Partout : sur le site, avec l’appli installée, ou d’un clic sur Chrome et Firefox.'],
  [
    `Et après les ${FREE_ANALYSES} analyses offertes ?`,
    `L’abonnement : ${PRICE_MONTHLY} par mois, ${DAILY_ANALYSES} analyses par jour, sans engagement.`,
  ],
  ['Une analyse peut-elle se tromper ?', 'Oui. Chaque constat cite donc sa phrase et sa raison : vous jugez sur pièces.'],
  [
    'Mon article est-il envoyé quelque part ?',
    <>
      À notre serveur et au service d’analyse, le temps de l’analyse. Il n’est pas conservé.{' '}
      <Link to="/transparence" className={QUIET_LINK}>
        Le trajet exact
      </Link>
    </>,
  ],
  ['Et les articles payants ?', 'Squiggle analyse ce que vous pouvez lire, et signale un article coupé.'],
  ['Comment résilier mon abonnement ?', 'À tout moment, depuis « Mon compte ». Effet à la fin de la période en cours.'],
  [
    'Puis-je l’utiliser en classe ?',
    <>
      Oui, gratuitement, sur demande.{' '}
      <Link to="/enseignants" className={QUIET_LINK}>
        La page Enseignants
      </Link>
    </>,
  ],
];

/** The analyses an offer gives, as dots: three to try, ten a day. */
function Dots({ count, label }: { count: number; label: string }) {
  return (
    <span role="img" aria-label={label} className="mt-5 flex flex-wrap gap-1.5">
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className="h-3 w-3 rounded-full bg-accent" />
      ))}
    </span>
  );
}

/** The ways in, ordered by what this device can do: the site first, then the app or the browser button. */
function HeroActions() {
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const installUrl = installUrlFor(userAgent);
  const mobile = isMobile(userAgent);
  const install = useInstall();

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link to="/analyser" className={`${PRIMARY_BUTTON} max-sm:w-full`}>
          Analyser un article
        </Link>
        {installUrl ? (
          <a href={installUrl} className={`${SECONDARY_BUTTON} max-sm:w-full`}>
            {installLabelFor(installUrl)}
          </a>
        ) : install?.kind === 'prompt' ? (
          <button type="button" onClick={install.prompt} className={`${SECONDARY_BUTTON} max-sm:w-full`}>
            Installer l’application
          </button>
        ) : null}
      </div>
      <p className="mt-4 mb-0 text-base text-muted">
        {FREE_ANALYSES} analyses offertes, sans carte bancaire.
      </p>
      {!installUrl && install?.kind === 'ios' ? (
        <p className="mt-2 mb-0 text-base text-muted">
          Pour l’avoir comme une application, touchez Partager puis « Sur l’écran d’accueil ».
        </p>
      ) : null}
      {!installUrl && !mobile ? (
        <p className="mt-2 mb-0 text-base text-muted">
          Aussi en bouton pour{' '}
          <a href={CHROME_URL} className={QUIET_LINK}>
            Chrome
          </a>{' '}
          et{' '}
          <a href={FIREFOX_URL} className={QUIET_LINK}>
            Firefox
          </a>
          .
        </p>
      ) : null}
    </>
  );
}

export function Accueil() {
  return (
    <LandingShell>
      <div className="hero-backdrop">
        <div className={`${PAGE} pt-10 pb-16 md:pt-16 lg:pb-24`}>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-end lg:gap-16">
            <h1 className="m-0 font-display text-[2.6rem] leading-[1.02] font-semibold tracking-[-0.03em] text-balance sm:text-6xl lg:text-7xl">
              {TAGLINE}
            </h1>
            <div>
              <p className={`m-0 text-lg leading-relaxed text-pretty text-muted md:text-xl ${MEASURE}`}>
                Collez un article{'\u00a0'}: Squiggle surligne ce qui cloche, dit pourquoi, et montre aussi ce qui est solide.
              </p>
              <HeroActions />
            </div>
          </div>
          <div className="mt-10 md:mt-14">
            <HeroFigure />
          </div>
        </div>
      </div>

      <Section id="comment" index="01 · Comment ça marche" title="Trois gestes, un deuxième avis">
        <Stations label="Les trois étapes" items={STEPS} />
      </Section>

      <Section id="rapport" index="02 · Le rapport" title="Ce que dit le rapport">
        <ReportDiagram />
      </Section>

      <Section id="neutralite" index="03 · Neutralité" title="Neutre par construction">
        <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-3">
          {NEUTRALITY.map(([title, text, figure]) => (
            <li
              key={title}
              className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-4 rounded-card border border-border bg-surface p-4 md:block md:p-5"
            >
              <div className="h-20 md:h-32">{figure}</div>
              <div>
                <h3 className="m-0 font-display text-xl font-semibold md:mt-5">{title}</h3>
                <p className="mt-2 mb-0 text-base leading-relaxed text-muted">{text}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-6 mb-0">
          <a href={GITHUB_URL} target="_blank" rel="noreferrer noopener" className={QUIET_LINK}>
            Lire la méthode et le code sur GitHub{' '}
            <span aria-hidden="true" className="font-mono">
              ↗
            </span>
          </a>
        </p>
      </Section>

      <Section id="donnees" index="04 · Vos données" title="Ce que devient votre article">
        <Stations label="Le trajet d’un article" items={DATA_FLOW} size="sm" />
        <p className={`mt-6 mb-0 text-lg leading-relaxed text-pretty ${MEASURE}`}>
          Le texte de l’article n’est pas conservé. Aucune publicité, aucun traceur.
        </p>
        <p className="mt-3 mb-0">
          <Link to="/transparence" className={QUIET_LINK}>
            Voir le trajet exact des données
          </Link>
        </p>
      </Section>

      <Section id="tarifs" index="05 · Tarifs" title="Essayez d’abord" intro="Payez seulement si l’outil vous sert.">
        <div className="grid gap-4 md:grid-cols-2">
          <article className="flex flex-col rounded-card border border-border bg-surface p-6">
            <h3 className="m-0 font-display text-xl font-semibold">Essai</h3>
            <p className="mt-2 mb-0 font-display text-5xl font-semibold tracking-tight">Gratuit</p>
            <Dots count={FREE_ANALYSES} label={`${FREE_ANALYSES} analyses`} />
            <p className="mt-4 mb-6 text-base leading-relaxed text-muted">
              {FREE_ANALYSES} analyses offertes à l’inscription, sans carte bancaire.
            </p>
            <Link to="/analyser" className={`${SECONDARY_BUTTON} mt-auto`}>
              Essayer
            </Link>
          </article>

          <article className="flex flex-col rounded-card border-2 border-accent bg-surface p-6">
            <h3 className="m-0 font-display text-xl font-semibold">Abonnement</h3>
            <p className="mt-2 mb-0 font-display text-5xl font-semibold tracking-tight">
              {PRICE_MONTHLY}
              <span className="text-lg font-normal tracking-normal text-muted"> par mois</span>
            </p>
            <Dots count={DAILY_ANALYSES} label={`${DAILY_ANALYSES} analyses par jour`} />
            <p className="mt-4 mb-6 text-base leading-relaxed text-muted">
              {DAILY_ANALYSES} analyses par jour. Sans engagement, résiliable à tout moment.
            </p>
            <Link to="/connexion" className={`${PRIMARY_BUTTON} mt-auto`}>
              {SUBSCRIBE_LABEL}
            </Link>
          </article>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-4 rounded-card border border-border bg-accentSoft p-6">
          <p className="m-0 text-lg font-semibold">Gratuit pour les enseignants, sur demande.</p>
          <Link to="/enseignants" className={SECONDARY_BUTTON}>
            Offre enseignants
          </Link>
        </div>
      </Section>

      <Section id="faq" index="06 · Questions" title="Questions fréquentes">
        <div className="grid items-start gap-3 lg:grid-cols-2">
          {FAQ.map(([question, answer]) => (
            <details key={question} className="group rounded-card border border-border bg-surface">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 font-display text-lg font-medium [&::-webkit-details-marker]:hidden">
                {frenchSpacing(question)}
                <span
                  aria-hidden="true"
                  className="font-mono text-xl text-accentInk transition-transform duration-160 ease-out group-open:rotate-45 motion-reduce:transition-none"
                >
                  +
                </span>
              </summary>
              <p className="m-0 px-5 pb-5 text-base leading-relaxed text-muted">
                {typeof answer === 'string' ? frenchSpacing(answer) : answer}
              </p>
            </details>
          ))}
        </div>
        <p className="mt-6 mb-0">
          <a href={CONTACT_URL} className={QUIET_LINK}>
            Une autre question ? Écrivez-nous
          </a>
        </p>
      </Section>

      <section aria-labelledby="a-vous-titre" className="border-t border-lineSoft">
        <div className={`${PAGE} grid items-center gap-8 py-16 md:grid-cols-[minmax(0,1fr)_16rem] md:py-24`}>
          <div>
            <h2 id="a-vous-titre" className="m-0 font-display text-4xl font-semibold tracking-tight md:text-6xl">
              À votre tour.
            </h2>
            <p className="mt-4 mb-0 text-lg text-muted md:text-xl">Collez un article, lisez son deuxième avis.</p>
            <Link to="/analyser" className={`${PRIMARY_BUTTON} mt-8 max-sm:w-full`}>
              Analyser un article
            </Link>
          </div>
          <div className="h-48 max-md:hidden">
            <ReadFigure />
          </div>
        </div>
      </section>
    </LandingShell>
  );
}
