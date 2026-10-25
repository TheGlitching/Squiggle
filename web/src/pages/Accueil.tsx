import type { ReactNode } from 'react';

import { Essai } from '../components/Essai';
import { FigPartout } from '../components/FigPartout';
import { FigRelecture } from '../components/FigRelecture';
import { Trajet } from '../components/Trajet';
import {
  LandingShell,
  MEASURE,
  PAGE,
  PRIMARY_BUTTON,
  QUIET_LINK,
  SECONDARY_BUTTON,
  Section,
} from '../components/Landing';
import { CONTACT_URL } from '../components/Layout';
import { DOMAIN_TONES, DOMAINS, VERIFICATION_STATES, type DemoVerification } from '../demo';
import { CHROME_URL, FIREFOX_URL, installUrlFor, isMobile, useInstall } from '../install';
import { DAILY_ANALYSES, FREE_ANALYSES, GITHUB_URL, PRICE_MONTHLY, SUBSCRIBE_LABEL, TAGLINE } from '../offer';
import { Link } from '../router';

const STEPS = [
  ['Vous collez l’article.', 'Sur le site, dans l’appli, ou d’un clic sur la page ouverte.'],
  [
    'Squiggle le relit.',
    'Faits, logique, cadrage : la même grille pour tous. S’il met un fait en question, il consulte d’abord les sources.',
  ],
  ['Vous voyez où ça cloche.', 'Chaque passage surligné dit pourquoi. Les points forts aussi.'],
] as const;

/** The four states, in a line each; the full wording is in the report's badges. */
const STATE_LINES: Record<DemoVerification, string> = {
  verifiee: 'Les sources le confirment.',
  'non-sourcee': 'L’article ne cite rien à l’appui.',
  douteuse: 'Les sources le mettent en doute.',
  'non-verifiable': 'Trop flou pour être vérifié.',
};

const NEUTRALITY = [
  ['Une seule grille pour tous les articles', 'Mêmes critères, quels que soient le média, le sujet ou le bord.'],
  ['Une méthode publique', 'La grille, les consignes et le calcul de la note sont publiés.'],
  ['Aucun verdict sur les personnes', 'Squiggle juge un texte, jamais son auteur ni son média.'],
] as const;

const FAQ: Array<[string, ReactNode]> = [
  [
    'Faut-il installer quelque chose ?',
    'Non. Le site suffit : collez le texte d’un article. L’appli et le bouton pour navigateur sont en option.',
  ],
  [
    'Et sur mon téléphone ?',
    'Ouvrez le site et collez le texte. Vous pouvez aussi l’installer comme une appli ; sur Android, partagez ensuite un article vers Squiggle.',
  ],
  [
    'Que se passe-t-il après les analyses offertes ?',
    `Vous pouvez vous abonner (${PRICE_MONTHLY} par mois, ${DAILY_ANALYSES} analyses par jour) ou utiliser votre propre clé d’API.`,
  ],
  [
    'Une analyse peut-elle se tromper ?',
    'Oui. C’est pourquoi chaque constat cite la phrase exacte et donne sa raison : vous jugez sur pièces. Ce qui ne peut pas être vérifié est dit tel quel.',
  ],
  [
    'Mon article est-il envoyé quelque part ?',
    <>
      Oui, à notre serveur et au modèle, le temps de l’analyse ; il n’est pas conservé ensuite.{' '}
      <Link to="/transparence" className={QUIET_LINK}>
        Le détail
      </Link>
    </>,
  ],
  ['Et les articles payants ?', 'Squiggle lit ce que vous pouvez lire, et signale quand l’analyse est partielle.'],
  ['Comment résilier mon abonnement ?', 'À tout moment, depuis « Mon compte ».'],
  [
    'Puis-je l’utiliser en classe ?',
    <>
      Oui, et c’est gratuit pour les enseignants.{' '}
      <Link to="/enseignants" className={QUIET_LINK}>
        La page Enseignants
      </Link>
    </>,
  ],
];

/** The 100 points of the grid, as one bar cut in five. */
function Grille() {
  return (
    <div>
      <div aria-hidden="true" className="flex h-4 overflow-hidden rounded-full md:h-5">
        {DOMAINS.map(([label, weight], index) => (
          <span
            key={label}
            className="h-full border-r-2 border-background last:border-r-0"
            style={{ width: `${weight}%`, background: DOMAIN_TONES[index] }}
          />
        ))}
      </div>
      <ol aria-label="Les cinq domaines" className="m-0 mt-8 grid list-none gap-x-10 gap-y-6 p-0 md:grid-cols-2 lg:grid-cols-3">
        {DOMAINS.map(([label, weight, question], index) => (
          <li key={label} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3">
            <span aria-hidden="true" className="mt-1.5 h-3 w-3 rounded-full" style={{ background: DOMAIN_TONES[index] }} />
            <div>
              <h3 className="m-0 text-lg leading-snug font-semibold">
                {label}{' '}<span className="font-normal whitespace-nowrap text-muted tabular-nums">· {weight} pts</span>
              </h3>
              <p className="mt-1 mb-0 text-base leading-relaxed text-muted">{question}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Where one reads, and how to have Squiggle there: the site, the phone, the computer. */
function Partout() {
  const install = useInstall();
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const store = installUrlFor(userAgent);
  const phone = isMobile(userAgent);
  return (
    <ul className="m-0 grid list-none gap-8 p-0">
      <li>
        <h3 className="m-0 text-xl font-semibold">Sur le site</h3>
        <p className="mt-1 mb-3 text-base leading-relaxed text-muted">Collez le texte d’un article. Rien à installer.</p>
        <Link to="/analyser" className={QUIET_LINK}>
          Analyser un texte
        </Link>
      </li>
      <li>
        <h3 className="m-0 text-xl font-semibold">Sur téléphone</h3>
        <p className="mt-1 mb-3 text-base leading-relaxed text-muted">
          Installez l’appli sur l’écran d’accueil. Sur Android, partagez un article vers Squiggle.
        </p>
        {install?.kind === 'prompt' ? (
          <button type="button" onClick={install.prompt} className={SECONDARY_BUTTON}>
            Installer l’appli
          </button>
        ) : install?.kind === 'ios' ? (
          <p className="m-0 text-base">Touchez Partager, puis « Sur l’écran d’accueil ».</p>
        ) : phone ? (
          <p className="m-0 text-base">Dans le menu du navigateur : « Ajouter à l’écran d’accueil ».</p>
        ) : (
          <p className="m-0 text-base">Ouvrez squiggle.fr sur votre téléphone.</p>
        )}
      </li>
      <li>
        <h3 className="m-0 text-xl font-semibold">Sur ordinateur</h3>
        <p className="mt-1 mb-3 text-base leading-relaxed text-muted">
          Ajoutez le bouton Squiggle à votre navigateur : un clic sur l’article ouvert, sans copier-coller.
        </p>
        {/* A phone installs no browser button: the stores are offered where they work. */}
        {phone ? (
          <p className="m-0 text-base">Pour Chrome et Firefox, sur ordinateur.</p>
        ) : (
          <p className="m-0 flex flex-wrap gap-x-5 gap-y-2">
            <a href={CHROME_URL} className={store === CHROME_URL ? SECONDARY_BUTTON : QUIET_LINK}>
              Ajouter à Chrome
            </a>
            <a href={FIREFOX_URL} className={store === FIREFOX_URL ? SECONDARY_BUTTON : QUIET_LINK}>
              Ajouter à Firefox
            </a>
          </p>
        )}
      </li>
    </ul>
  );
}

export function Accueil() {
  return (
    <LandingShell>
      <section aria-labelledby="accroche" className={`${PAGE} pt-6 pb-16 sm:pt-12 md:pb-24`}>
        <h1
          id="accroche"
          className="m-0 font-display text-[2.6rem] leading-[1.02] font-semibold tracking-[-0.035em] text-balance sm:text-6xl xl:text-7xl"
        >
          {TAGLINE}
        </h1>
        <p className={`mt-5 mb-8 text-lg leading-relaxed text-pretty sm:mt-6 sm:mb-10 md:text-xl ${MEASURE}`}>
          Squiggle surligne ce qui est fragile dans un article, dit pourquoi, et montre ce qui est solide.
        </p>
        <Essai />
      </section>

      <Section id="comment" title="Comment ça marche" tone="raised">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
          <ol className="m-0 grid list-none gap-8 p-0">
            {STEPS.map(([title, text]) => (
              <li key={title}>
                <h3 className="m-0 text-2xl leading-snug font-semibold tracking-tight">{title}</h3>
                <p className="mt-2 mb-0 text-lg leading-relaxed text-pretty text-muted">{text}</p>
              </li>
            ))}
          </ol>
          <FigRelecture />
        </div>
      </Section>

      <Section id="grille" title="Une note sur 100, cinq questions">
        <Grille />
        <h3 className="mt-16 mb-0 text-2xl font-semibold tracking-tight">Jamais « vrai » ou « faux »</h3>
        <p className={`mt-2 mb-0 text-lg leading-relaxed text-muted ${MEASURE}`}>Un fait relevé reçoit l’un de ces états.</p>
        <dl className="m-0 mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
          {VERIFICATION_STATES.map(({ state, label, chip }) => (
            <div key={state}>
              <dt>
                <span className={`inline-block rounded-md border px-2.5 py-1 text-sm font-medium ${chip}`}>{label}</span>
              </dt>
              <dd className="m-0 mt-2 text-base leading-relaxed text-muted">{STATE_LINES[state]}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="partout" title="Partout où vous lisez" tone="raised">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-16">
          <FigPartout />
          <Partout />
        </div>
      </Section>

      <Section id="neutralite" title="Neutre par construction">
        <ul className="m-0 grid list-none gap-8 p-0 md:grid-cols-3 md:gap-10">
          {NEUTRALITY.map(([title, text]) => (
            <li key={title}>
              <h3 className="m-0 text-xl leading-snug font-semibold">{title}</h3>
              <p className="mt-2 mb-0 text-base leading-relaxed text-muted">{text}</p>
            </li>
          ))}
        </ul>
        <p className="mt-8 mb-0">
          <a href={GITHUB_URL} target="_blank" rel="noreferrer noopener" className={QUIET_LINK}>
            Lire la méthode et le code sur GitHub <span aria-hidden="true">↗</span>
          </a>
        </p>
      </Section>

      <Section
        id="confidentialite"
        title="Vos données"
        tone="raised"
        layout="split"
        aside={
          <div className="mt-6 grid gap-4">
            <p className="m-0 text-xl leading-relaxed font-semibold">Votre article n’est pas conservé.</p>
            <p className={`m-0 text-lg leading-relaxed text-muted ${MEASURE}`}>
              Il transite par notre serveur le temps de l’analyse. Aucune publicité, aucun traceur.
            </p>
            <p className="m-0">
              <Link to="/transparence" className={QUIET_LINK}>
                Voir le trajet exact des données
              </Link>
            </p>
          </div>
        }
      >
        <div className="rounded-card bg-background p-6 sm:p-8">
          <Trajet vertical />
        </div>
      </Section>

      <Section id="tarifs" title="Tarifs" intro="Essayez d’abord. Payez seulement si l’outil vous sert.">
        <div className="grid gap-4 md:grid-cols-3">
          <article className="flex flex-col rounded-card bg-surface p-6">
            <h3 className="m-0 text-lg font-semibold text-muted">Essai</h3>
            <p className="mt-2 mb-0 font-display text-4xl font-semibold tracking-tight">Gratuit</p>
            <p className="mt-3 mb-0 text-base leading-relaxed text-muted">
              {FREE_ANALYSES} analyses offertes à l’inscription, sans carte bancaire.
            </p>
          </article>
          <article className="flex flex-col rounded-card bg-accentSoft p-6 ring-2 ring-accent">
            <h3 className="m-0 text-lg font-semibold text-accentInk">Abonnement</h3>
            <p className="mt-2 mb-0 font-display text-4xl font-semibold tracking-tight">
              {PRICE_MONTHLY}
              <span className="text-lg font-normal text-muted"> par mois</span>
            </p>
            <p className="mt-3 mb-6 text-base leading-relaxed text-muted">{DAILY_ANALYSES} analyses par jour. Sans engagement.</p>
            <Link to="/connexion" className={`${PRIMARY_BUTTON} mt-auto`}>
              {SUBSCRIBE_LABEL}
            </Link>
          </article>
          <article className="flex flex-col rounded-card bg-surface p-6">
            <h3 className="m-0 text-lg font-semibold text-muted">Votre propre clé</h3>
            <p className="mt-2 mb-0 font-display text-4xl font-semibold tracking-tight">Gratuit</p>
            <p className="mt-3 mb-0 text-base leading-relaxed text-muted">
              Avec votre clé d’API, le bouton pour navigateur ne coûte rien.
            </p>
          </article>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-4 rounded-card bg-surface p-6">
          <p className="m-0 text-lg font-semibold">Gratuit pour les enseignants, sur demande.</p>
          <Link to="/enseignants" className={SECONDARY_BUTTON}>
            Offre enseignants
          </Link>
        </div>
      </Section>

      <Section
        id="faq"
        title="Questions fréquentes"
        tone="raised"
        layout="split"
        aside={
          <p className="mt-6 mb-0">
            <a href={CONTACT_URL} className={QUIET_LINK}>
              Une autre question ? Écrivez-nous
            </a>
          </p>
        }
      >
        <div className="grid gap-3">
          {FAQ.map(([question, answer]) => (
            <details key={question} className="group rounded-card bg-background">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 text-lg font-medium [&::-webkit-details-marker]:hidden">
                {question}
                <span
                  aria-hidden="true"
                  className="text-xl text-accentInk transition-transform duration-160 ease-out group-open:rotate-45 motion-reduce:transition-none"
                >
                  +
                </span>
              </summary>
              <p className="m-0 px-5 pb-5 text-base leading-relaxed text-muted">{answer}</p>
            </details>
          ))}
        </div>
      </Section>
    </LandingShell>
  );
}
