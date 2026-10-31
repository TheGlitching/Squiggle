/**
 * The teacher kit: the activity sheet (/enseignants/fiche-activite), two A4 pages
 * that walk a teacher through a 55-minute lesson, and the reading grid
 * (/enseignants/grille-lecture), one page for each student, usable with any
 * article, with or without the tool. Unlike the classroom mode's sheets, neither
 * needs a session: both are public pages, at a stable address a teacher can share.
 */
import type { ReactNode } from 'react';

import { PAGE, PRIMARY_BUTTON, SECONDARY_BUTTON, TITLE } from '../components/Landing';
import { CONTACT_EMAIL } from '../components/Layout';
import { Link } from '../router';
import { REASONS } from './Feuilles';

/** The violet of Squiggle's reading, dark enough to read as text on white paper. */
const INK = 'text-[#5b2fc0]';
const SOFT = 'rounded-md bg-[#f3effc] print:[print-color-adjust:exact]';
const KICKER = `m-0 font-display text-[11px] font-semibold tracking-[0.06em] uppercase ${INK}`;
const H2 = 'm-0 border-b-2 border-paperInk pb-1 font-display text-[16px] font-semibold';
const CELL = 'border-b border-paperEdge px-2 py-1.5 text-left align-top';
const HEAD_CELL = `${CELL} font-display text-[11px] font-semibold tracking-[0.04em] text-paperMuted uppercase`;

/** Each A4 page of a sheet: paper on screen, its own printed page once printed. */
function Sheet({ name, foot, children }: { name: string; foot: [string, string]; children: ReactNode }) {
  return (
    <section
      aria-label={name}
      className="sheet mx-auto grid w-full grid-cols-[minmax(0,1fr)] max-w-[210mm] content-start gap-3 rounded-sm bg-white px-5 py-8 font-serif text-[13.5px] leading-snug text-paperInk shadow-[0_1px_0_#c9c6bf,0_20px_50px_rgb(0_0_0/0.45)] sm:min-h-[297mm] sm:grid-rows-[auto_1fr] sm:px-[15mm] sm:py-[13mm] print:min-h-0 print:max-w-none print:break-after-page print:rounded-none print:p-0 print:shadow-none print:last:break-after-auto"
    >
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-3">{children}</div>
      <p className="m-0 flex flex-wrap justify-between gap-x-4 self-end border-t border-paperEdge pt-1.5 font-display text-[11px] text-paperMuted">
        <span>{foot[0]}</span>
        <span>{foot[1]}</span>
      </p>
    </section>
  );
}

/** The page around the sheets: what it is, a print button, and the way back. */
function Kit({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <div className={`${PAGE} py-8 sm:py-12 print:max-w-none print:p-0`}>
      <div className="mb-8 grid gap-4 print:hidden">
        <h1 className={TITLE}>{title}</h1>
        <p className="m-0 max-w-[60ch] text-lg leading-relaxed text-muted">{hint}</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => window.print()} className={`${PRIMARY_BUTTON} max-sm:w-full`}>
            Imprimer
          </button>
          <Link to="/enseignants" className={`${SECONDARY_BUTTON} max-sm:w-full`}>
            Squiggle pour les enseignants
          </Link>
        </div>
      </div>
      <div className="grid gap-8 print:block">{children}</div>
    </div>
  );
}

const QUESTIONS: Record<(typeof REASONS)[number], string> = {
  'Chiffre ou fait sans source': 'Qui l’affirme ? Où pourrait-on le vérifier ?',
  'Raisonnement qui cloche': 'Le raisonnement tient-il ? Trouvez un contre-exemple.',
  'Mot qui juge à la place des faits': 'Quel mot oriente le jugement ? Que dit-il de plus que les faits ?',
  'On ne sait pas qui parle': 'Qui est cité ? « Selon des experts » : lesquels ?',
  'Langue imprécise': 'Ce mot pourrait-il vouloir dire deux choses ? Lesquelles ?',
};

const FACTS: Array<[string, string]> = [
  ['Niveaux', 'De la 4e à la terminale'],
  ['Durée', '55 minutes'],
  ['Matériel', 'Un vidéoprojecteur, la fiche élève'],
  ['Comptes', 'Le vôtre seulement'],
];

const SKILLS = [
  'Évaluer la fiabilité d’une information : repérer un chiffre ou un fait donné sans source.',
  'Distinguer un fait d’un jugement, et voir quel mot fait pencher la lecture.',
  'Reconnaître un raisonnement qui ne tient pas, et dire pourquoi avec ses propres mots.',
  'Discuter une analyse automatisée au lieu de la croire : elle peut se tromper, et chaque constat montre la phrase qu’il vise.',
];

const BEFORE: Array<[string, string]> = [
  [
    'Choisissez un article',
    'que vous avez lu et qui se lit en dix minutes. Pendant la campagne présidentielle, préférez un sujet sans enjeu électoral. Jamais un texte d’élève.',
  ],
  [
    'Analysez-le sur squiggle.fr',
    'avec votre compte, puis cliquez sur « Préparer pour la classe ». Vous voyez tout le corrigé, seul. Retirez ce qui ne vous convainc pas, choisissez l’ordre, ajoutez une remarque si l’analyse a manqué un passage.',
  ],
  [
    'Téléchargez le fichier de séance',
    '(il finit par .squiggle) sur une clé USB. Il s’ouvre en classe sans compte ni mot de passe, et Squiggle ne le reçoit jamais.',
  ],
  ['Imprimez la fiche élève', ': elle numérote les phrases comme au tableau et ne montre rien de l’analyse.'],
];

const STEPS: Array<[string, string, string, string]> = [
  [
    'Lecture',
    '10 min',
    'Lisent l’article sur la fiche, seuls, sans rien marquer.',
    'L’article est au tableau. Vous ne commentez pas encore.',
  ],
  [
    'Repérage',
    '15 min',
    'Soulignent les phrases fragiles, notent leur numéro et cochent une des cinq raisons. Puis comparent avec leur voisin.',
    'Vous passez dans les rangs. Au pupitre, vous notez les mains levées phrase par phrase.',
  ],
  [
    'Révélation',
    '20 min',
    'Pour chaque constat, répondent d’abord à la question posée, puis découvrent la raison donnée par l’analyse.',
    'Une touche (→) révèle le constat suivant, quand vous le décidez. Votre écran garde le corrigé, la classe ne voit que le tableau.',
  ],
  [
    'Bilan',
    '10 min',
    'Comptent ce qu’ils ont vu, manqué ou marqué en trop. Défendent une phrase marquée que l’analyse n’a pas retenue.',
    'Vous choisissez d’afficher la note sur 100, ou non. Elle se discute : ce n’est pas un verdict sur le média.',
  ],
];

const VARIANTS: Array<[string, string]> = [
  ['Sans vidéoprojecteur.', 'Imprimez la fiche élève et le corrigé, et révélez à l’oral, dans l’ordre du corrigé.'],
  [
    'Pour découvrir, sans compte.',
    'L’exercice de la page squiggle.fr/enseignants porte sur un article fictif : vous pouvez le faire vous-même en cinq minutes, ou le projeter.',
  ],
  [
    'Prolongement.',
    'Par deux, les élèves réécrivent une phrase fragile pour qu’elle devienne vérifiable : qui, quand, d’où vient le chiffre.',
  ],
  ['En documentation.', 'Comparez deux articles sur le même fait : où l’un donne-t-il la source que l’autre tait ?'],
];

const LIMITS = [
  'Squiggle s’appuie sur un modèle d’intelligence artificielle pour relire l’article. Seul l’enseignant s’en sert : les élèves n’utilisent pas d’IA.',
  'Chaque constat cite la phrase exacte qu’il vise. On peut toujours vérifier, et contester.',
  'Il peut se tromper. Un constat discutable fait un très bon moment de classe.',
  'Il ne dit pas si l’article est vrai ou faux. Le texte est jugé, jamais son auteur ni le média.',
];

const LINKS: Array<[string, string]> = [
  ['squiggle.fr/enseignants', 'l’offre, l’accès gratuit et l’exercice de démonstration'],
  ['squiggle.fr/enseignants/grille-lecture', 'la grille de lecture, à photocopier pour chaque élève'],
  ['squiggle.fr/classe', 'le mode classe, à ouvrir sur l’ordinateur de la salle'],
  ['squiggle.fr/classe/mode-emploi', 'le mode d’emploi illustré, sur une page'],
  ['squiggle.fr/transparence', 'où va l’article analysé, et qui le traite'],
];

function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="m-0 grid list-disc gap-1 pl-5">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

function Num({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#5b2fc0] font-display text-[11px] font-bold text-white print:[print-color-adjust:exact]"
    >
      {children}
    </span>
  );
}

export function FicheActivite() {
  return (
    <Kit
      title="La fiche d’activité"
      hint="Une séance de 55 minutes, de la préparation au bilan, sur deux pages A4. À imprimer pour vous, ou à transmettre à un collègue."
    >
      <Sheet name="Fiche d’activité, page 1" foot={['Fiche proposée par Squiggle, outil indépendant. Ce n’est pas une ressource du CLEMI.', '1 / 2']}>
        <p className={KICKER}>
          Semaines de la presse et des médias dans l’École · 15-28 mars 2027 · « S’informer en confiance »
        </p>
        <h2 className="m-0 font-display text-[26px] leading-[1.08] font-semibold tracking-[-0.01em] text-balance">
          Ce qui fragilise un article : une séance de 55 minutes
        </h2>
        <p className="m-0 text-[15px]">
          Les élèves lisent un article d’actualité et marquent ce qui leur paraît fragile. Ensuite seulement, vous révélez
          au tableau ce qu’une analyse a relevé, constat par constat. La classe compare : ce qu’elle a vu, ce qu’elle a
          manqué, ce qu’elle a marqué en trop.
        </p>
        <dl className="m-0 grid rounded-md border border-paperEdge sm:grid-cols-4">
          {FACTS.map(([term, detail]) => (
            <div key={term} className="border-paperEdge px-3 py-2 not-last:max-sm:border-b sm:not-last:border-r">
              <dt className="font-display text-[10.5px] font-semibold tracking-[0.05em] text-paperMuted uppercase">{term}</dt>
              <dd className="m-0 mt-0.5 font-display text-[13px] font-semibold">{detail}</dd>
            </div>
          ))}
        </dl>

        <h3 className={`${H2} mt-2`}>Ce que les élèves travaillent</h3>
        <Bullets items={SKILLS} />

        <h3 className={`${H2} mt-2`}>Avant la séance, chez vous (15 minutes)</h3>
        <ol className="m-0 grid list-decimal gap-1 pl-5">
          {BEFORE.map(([lead, rest]) => (
            <li key={lead}>
              <b>{lead}</b> {rest}
            </li>
          ))}
        </ol>

        <h3 className={`${H2} mt-2`}>Le déroulé</h3>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={`${HEAD_CELL} w-[31mm]`}>Temps</th>
              <th className={HEAD_CELL}>Les élèves</th>
              <th className={HEAD_CELL}>Vous</th>
            </tr>
          </thead>
          <tbody>
            {STEPS.map(([name, time, students, teacher], index) => (
              <tr key={name} className="break-inside-avoid">
                <td className={CELL}>
                  <span className="flex items-center gap-1.5 font-display font-bold">
                    <Num>{index + 1}</Num>
                    {name}
                  </span>
                  <span className="ml-[26px] block font-display text-[12px] text-paperMuted">{time}</span>
                </td>
                <td className={CELL}>{students}</td>
                <td className={CELL}>{teacher}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Sheet>

      <Sheet
        name="Fiche d’activité, page 2"
        foot={[`Squiggle · squiggle.fr · ${CONTACT_EMAIL} · code source public sous licence AGPL-3.0`, '2 / 2']}
      >
        <h3 className={H2}>Les cinq raisons de la fiche élève, et la question à poser</h3>
        <table className="w-full border-collapse">
          <tbody>
            {REASONS.map((reason) => (
              <tr key={reason}>
                <td className={`${CELL} w-[52mm] font-display font-semibold`}>{reason}</td>
                <td className={`${CELL} italic`}>{QUESTIONS[reason]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="m-0">
          L’analyse relève aussi ce qui est solide : une source précise, une nuance honnête. Montrez-le, pour que la séance
          n’apprenne pas à se méfier de tout.
        </p>

        <div className="mt-2 grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <div className="grid content-start gap-2">
            <h3 className={H2}>Variantes</h3>
            <Bullets
              items={VARIANTS.map(([lead, rest]) => (
                <>
                  <b>{lead}</b> {rest}
                </>
              ))}
            />
          </div>
          <div className="grid content-start gap-2">
            <h3 className={H2}>Ce que fait l’outil, ce qu’il ne fait pas</h3>
            <Bullets items={LIMITS} />
          </div>
        </div>

        <div className={`${SOFT} mt-1 grid gap-1 px-4 py-3`}>
          <h3 className={`m-0 font-display text-[13.5px] font-semibold ${INK}`}>Les données</h3>
          <p className="m-0">
            Aucun compte élève, aucune publicité, aucun traceur. Pendant l’analyse, le texte de l’article est envoyé sans
            votre identité et n’est pas conservé ; le rapport, qui cite de courts extraits, est gardé 30 jours. Le fichier
            de séance reste sur votre clé. Le détail est sur squiggle.fr/transparence.
          </p>
        </div>
        <div className={`${SOFT} grid gap-1 px-4 py-3`}>
          <h3 className={`m-0 font-display text-[13.5px] font-semibold ${INK}`}>Un accès gratuit pour les enseignants</h3>
          <p className="m-0">
            L’abonnement complet est offert aux enseignants et aux professeurs documentalistes, sans carte bancaire, donc
            sans aucun prélèvement possible. Comment l’obtenir : squiggle.fr/enseignants, rubrique « Obtenir l’accès
            gratuit ».
          </p>
        </div>

        <h3 className={`${H2} mt-2`}>Liens</h3>
        <ul className="m-0 grid list-none gap-0.5 p-0 font-display text-[12.5px]">
          {LINKS.map(([address, what]) => (
            <li key={address}>
              <b className="font-semibold">{address}</b> : {what}
            </li>
          ))}
        </ul>
      </Sheet>
    </Kit>
  );
}

const BEFORE_READING: Array<[string, string]> = [
  ['Qui écrit, et pour qui ?', 'Le média, l’auteur, la rubrique : actualité, opinion, publicité ?'],
  ['De quand date-t-il ?', 'Un chiffre juste en 2020 peut être faux aujourd’hui.'],
  ['Que promet le titre ?', 'Relisez-le à la fin : l’article tient-il cette promesse ?'],
];

const GRID: Record<(typeof REASONS)[number], [string, string]> = {
  'Chiffre ou fait sans source': ['Qui l’affirme ? Où pourrait-on le vérifier ?', '« Un jeune sur deux ne lit plus la presse. »'],
  'Raisonnement qui cloche': [
    'La conclusion découle-t-elle vraiment des faits ? Existe-t-il un contre-exemple ?',
    '« Les ventes de glaces et les noyades montent ensemble : les glaces sont dangereuses. »',
  ],
  'Mot qui juge à la place des faits': [
    'Quel mot fait pencher la lecture ? Que dit-il de plus que les faits ?',
    '« Le maire s’est enfin décidé à agir. »',
  ],
  'On ne sait pas qui parle': [
    'Qui est cité ? Peut-on retrouver cette personne ou ce document ?',
    '« Selon des spécialistes, la mesure est inutile. »',
  ],
  'Langue imprécise': ['Ce mot peut-il vouloir dire deux choses ? Combien, exactement ?', '« De nombreux habitants se plaignent. »'],
};

const BOX = 'border border-paperEdge px-2 py-1.5 text-left align-top';

export function GrilleLecture() {
  return (
    <Kit
      title="La grille de lecture"
      hint="Une page à photocopier pour chaque élève. Elle sert avec n’importe quel article, avec ou sans Squiggle."
    >
      <Sheet
        name="Grille de lecture"
        foot={['Grille libre de droits pour la classe, proposée par Squiggle (squiggle.fr).', '1 / 1']}
      >
        <p className={KICKER}>Grille de lecture · S’informer en confiance</p>
        <h2 className="m-0 font-display text-[25px] leading-[1.1] font-semibold">Ce qui fragilise un article</h2>
        <p className="m-0 flex gap-6 font-display text-[12px] text-paperMuted">
          {['Nom', 'Classe', 'Article lu'].map((field) => (
            <span key={field} className="flex-1 border-b border-paperEdge pb-3">
              {field}
            </span>
          ))}
        </p>

        <h3 className={H2}>Avant de lire</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {BEFORE_READING.map(([question, detail]) => (
            <p key={question} className={`${SOFT} m-0 px-3 py-2 text-[13px]`}>
              <b className="block font-display font-semibold">{question}</b>
              {detail}
            </p>
          ))}
        </div>

        <h3 className={H2}>Pendant la lecture : cinq raisons de douter</h3>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={`${HEAD_CELL} w-[9mm]`}>
                <span className="sr-only">N°</span>
              </th>
              <th className={`${HEAD_CELL} w-[46mm]`}>La raison</th>
              <th className={HEAD_CELL}>Je me demande</th>
              <th className={HEAD_CELL}>Exemple inventé</th>
            </tr>
          </thead>
          <tbody>
            {REASONS.map((reason, index) => (
              <tr key={reason}>
                <td className={`${CELL} font-display text-[15px] font-bold ${INK}`}>{index + 1}</td>
                <td className={`${CELL} font-display font-semibold`}>{reason}</td>
                <td className={CELL}>{GRID[reason][0]}</td>
                <td className={`${CELL} text-paperMuted italic`}>{GRID[reason][1]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="m-0">
          Notez aussi ce qui est <b>solide</b> : une source précise, un chiffre daté, un avis contraire cité. Un bon article
          se reconnaît aussi.
        </p>

        <h3 className={H2}>Mes phrases fragiles</h3>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {['Phrase n°', 'Raison (1 à 5)', 'Pourquoi je doute', 'Ce qui me convaincrait'].map((label, index) => (
                <th
                  key={label}
                  className={`${BOX} bg-paper font-display text-[11px] font-semibold tracking-[0.04em] text-paperMuted uppercase print:[print-color-adjust:exact] ${
                    index === 0 ? 'w-[16mm]' : index === 1 ? 'w-[20mm]' : ''
                  }`}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5].map((row) => (
              <tr key={row} className="h-[8.5mm]">
                {[1, 2, 3, 4].map((cell) => (
                  <td key={cell} className={BOX} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <h3 className={H2}>Après la correction</h3>
        <p className="m-0 leading-loose [overflow-wrap:anywhere]">
          J’avais vu ____ constats sur ____. J’en ai manqué ____. Une phrase que j’ai marquée et que je défends quand même :
          n° ____, parce que ________________________________________________
        </p>
      </Sheet>
    </Kit>
  );
}
