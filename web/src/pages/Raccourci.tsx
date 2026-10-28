/**
 * The iPhone shortcut "Analyser avec Squiggle", for a reader who has never
 * opened the Raccourcis app: how to add it, the one setting it needs, and the
 * two places it is used from, each step with the screen it shows.
 *
 * The file is built and signed by `web/shortcut/build.mjs`. It reads the page
 * or the screenshots on the phone and opens /analyser with the text after the
 * `#`, which no server ever receives.
 */
import type { ReactNode } from 'react';

import { LEAD, PAGE, PRIMARY_BUTTON, QUIET_LINK, TITLE } from '../components/Landing';
import { Label, Lines, Phone, H, W } from '../components/PhoneDrawing';
import { Link } from '../router';

export const SHORTCUT_NAME = 'Analyser avec Squiggle';
export const SHORTCUT_FILE = `/raccourci/${encodeURIComponent(SHORTCUT_NAME)}.shortcut`;

type Screen = 'ajouter' | 'scripts' | 'safari' | 'photos' | 'analyser';

const STEPS: Array<{ screen: Screen; title: string; text: ReactNode }> = [
  {
    screen: 'ajouter',
    title: 'Ajoutez le raccourci',
    text: (
      <>
        Sur l’iPhone, dans Safari, touchez « Ajouter le raccourci » ci-dessus, puis « Télécharger ». Touchez la flèche
        bleue dans la barre d’adresse, puis le fichier : l’app Raccourcis s’ouvre. Touchez « Ajouter le raccourci ».
      </>
    ),
  },
  {
    screen: 'scripts',
    title: 'Autorisez-le à lire la page',
    text: (
      <>
        Une seule fois : ouvrez Réglages, puis Apps, Raccourcis, Avancé, et activez « Autoriser l’exécution de
        scripts ». C’est ce qui lui permet de lire l’article dans Safari. Jusqu’à iOS 17, Raccourcis est directement dans
        Réglages.
      </>
    ),
  },
  {
    screen: 'safari',
    title: 'Dans Safari : Partager',
    text: (
      <>
        Sur un article, touchez Partager, faites défiler et touchez « {SHORTCUT_NAME} ». La première fois, l’iPhone
        demande s’il peut lire ce site : touchez « Autoriser ». Abonné et connecté, c’est l’article entier qu’il lit.
      </>
    ),
  },
  {
    screen: 'photos',
    title: 'Ou des captures, depuis Photos',
    text: (
      <>
        Une appli de presse qui bloque la copie : faites des captures de l’article, du haut vers le bas. Dans Photos,
        touchez Sélectionner, choisissez-les, puis Partager et « {SHORTCUT_NAME} ». Le texte est lu sur l’iPhone.
      </>
    ),
  },
  {
    screen: 'analyser',
    title: 'Squiggle s’ouvre avec le texte',
    text: <>L’article est déjà dans le champ. Relisez-le si vous voulez, puis touchez « Analyser ».</>,
  },
];

export function Raccourci() {
  return (
    <div className={`${PAGE} py-12 md:py-20`}>
      <p className="m-0 text-base font-medium text-accentInk">Sur iPhone</p>
      <h1 className={`${TITLE} mt-3`}>{SHORTCUT_NAME}</h1>
      <p className={`${LEAD} mt-4 max-w-[55ch]`}>
        Un article dans Safari, ou des captures d’une appli de presse : partagez-les vers Squiggle, et l’analyse
        s’ouvre avec le texte. Rien à copier, rien à coller.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 max-sm:flex-col max-sm:items-stretch">
        <a href={SHORTCUT_FILE} download={`${SHORTCUT_NAME}.shortcut`} className={PRIMARY_BUTTON}>
          Ajouter le raccourci
        </a>
        <p className="m-0 text-base text-muted">Gratuit, pour iPhone sous iOS 15 ou plus récent.</p>
      </div>

      <ol className="mt-14 grid list-none gap-12 p-0 md:mt-20 md:gap-16">
        {STEPS.map((step, index) => (
          <li
            key={step.screen}
            className="grid items-center gap-6 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] sm:gap-10 md:grid-cols-[15rem_minmax(0,1fr)]"
          >
            <div className="mx-auto w-full max-w-[11rem] max-sm:order-last sm:max-w-none">
              <PhoneScreen screen={step.screen} />
            </div>
            <div className="grid content-start gap-3">
              <p className="m-0 text-lg font-medium text-accentInk tabular-nums">Étape {index + 1}</p>
              <h2 className="m-0 font-display text-2xl leading-tight font-semibold tracking-[-0.01em]">{step.title}</h2>
              <p className="m-0 max-w-[55ch] text-lg leading-relaxed text-muted">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-16 grid max-w-[55ch] gap-3 border-t border-lineSoft pt-10 md:mt-24">
        <h2 className="m-0 font-display text-xl font-semibold">Où va le texte</h2>
        <p className="m-0 text-lg leading-relaxed text-muted">
          Le raccourci lit la page ou les captures sur votre iPhone, puis ouvre Squiggle dans Safari avec le texte.
          Il ne passe par aucun serveur avant d’arriver dans la page ; la suite est celle d’un texte collé.{' '}
          <Link to="/transparence" className={QUIET_LINK}>
            Le trajet des données
          </Link>
        </p>
        <p className="m-0 text-lg leading-relaxed text-muted">
          Sur Android, ou sans raccourci :{' '}
          <Link to="/analyser" className={QUIET_LINK}>
            collez le texte dans Squiggle
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

/* The drawings: an iPhone seen from the front, the screen each step shows, with what to touch in the accent. */

/** The share sheet's list of actions, the shortcut's row in the accent. */
function ShareSheet({ top }: { top: number }) {
  const rows = ['Copier', 'Ajouter aux favoris', SHORTCUT_NAME, 'Imprimer'];
  return (
    <>
      <rect x={10} y={top} width={W - 20} height={H - top - 12} rx={14} className="fill-background stroke-border" />
      {rows.map((row, i) => {
        const y = top + 12 + i * 30;
        const ours = row === SHORTCUT_NAME;
        return (
          <g key={row}>
            <rect x={18} y={y} width={W - 36} height={24} rx={7} className={ours ? 'fill-accent' : 'fill-surface'} />
            <Label x={28} y={y + 15.5} accent={ours}>
              {row}
            </Label>
          </g>
        );
      })}
    </>
  );
}

function PhoneScreen({ screen }: { screen: Screen }) {
  switch (screen) {
    case 'ajouter':
      return (
        <Phone label="Raccourcis propose « Ajouter le raccourci »">
          <rect x={58} y={70} width={64} height={64} rx={16} className="fill-accentSoft stroke-accent" />
          <path d="M76 110c8-14 14 4 22-10s10 2 8 4" fill="none" className="stroke-accentInk" strokeWidth={3} strokeLinecap="round" />
          <Label x={W / 2} y={160} size={11} anchor="middle">
            {SHORTCUT_NAME}
          </Label>
          <Lines x={40} y={180} widths={[100, 80]} />
          <rect x={22} y={286} width={W - 44} height={32} rx={10} className="fill-accent" />
          <Label x={W / 2} y={306} accent anchor="middle" size={10}>
            Ajouter le raccourci
          </Label>
        </Phone>
      );
    case 'scripts':
      return (
        <Phone label="Réglages, Raccourcis, Avancé : « Autoriser l’exécution de scripts » activé">
          <Label x={20} y={58} size={11}>
            Avancé
          </Label>
          {[0, 1, 2].map((i) => {
            const y = 76 + i * 40;
            const ours = i === 1;
            return (
              <g key={i}>
                <rect x={14} y={y} width={W - 28} height={32} rx={8} className={ours ? 'fill-background stroke-accent' : 'fill-background'} />
                {ours ? (
                  <>
                    <Label x={22} y={y + 13} size={8}>
                      Autoriser l’exécution
                    </Label>
                    <Label x={22} y={y + 24} size={8}>
                      de scripts
                    </Label>
                  </>
                ) : (
                  <Lines x={22} y={y + 14} widths={[86]} />
                )}
                <rect x={W - 50} y={y + 8} width={28} height={16} rx={8} className={ours ? 'fill-accent' : 'fill-border'} />
                <circle cx={ours ? W - 30 : W - 42} cy={y + 16} r={6} className="fill-foreground" />
              </g>
            );
          })}
        </Phone>
      );
    case 'safari':
      return (
        <Phone label="Dans Safari, le menu Partager, avec « Analyser avec Squiggle »">
          <rect x={14} y={40} width={W - 28} height={18} rx={9} className="fill-background" />
          <Lines x={20} y={74} widths={[130, 110]} gap={12} />
          <Lines x={20} y={110} widths={[140, 136, 120, 140, 90]} />
          <ShareSheet top={196} />
        </Phone>
      );
    case 'photos':
      return (
        <Phone label="Dans Photos, trois captures sélectionnées et le menu Partager">
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const x = 14 + (i % 3) * 52;
            const y = 44 + Math.floor(i / 3) * 74;
            const chosen = i < 3;
            return (
              <g key={i}>
                <rect x={x} y={y} width={48} height={70} rx={4} className={chosen ? 'fill-background stroke-accent' : 'fill-background'} strokeWidth={chosen ? 2 : 1} />
                <Lines x={x + 6} y={y + 12} widths={[34, 30, 36, 24]} gap={9} />
                {chosen ? (
                  <g>
                    <circle cx={x + 40} cy={y + 62} r={6} className="fill-accent" />
                    <path d={`M${x + 37} ${y + 62}l2 2 4-4`} fill="none" className="stroke-accentForeground" strokeWidth={1.6} />
                  </g>
                ) : null}
              </g>
            );
          })}
          <ShareSheet top={206} />
        </Phone>
      );
    case 'analyser':
      return (
        <Phone label="Squiggle ouvert avec le texte de l’article, prêt à analyser">
          <Label x={20} y={58} size={12}>
            Analyser un article
          </Label>
          <rect x={14} y={72} width={W - 28} height={190} rx={8} className="fill-background stroke-border" />
          <Lines x={24} y={86} widths={[120, 132, 126, 110, 132, 128, 96, 132, 118, 124, 104, 130, 120, 90, 128, 116, 70]} />
          <rect x={14} y={284} width={W - 28} height={32} rx={10} className="fill-accent" />
          <Label x={W / 2} y={304} accent anchor="middle" size={10}>
            Analyser
          </Label>
        </Phone>
      );
  }
}
