/**
 * Installing the bookmark "Analyser avec Squiggle" on a phone.
 *
 * A phone browser has no extension, and a news app blocks copying, but the
 * site of the same paper lets the subscriber read the whole article. The
 * bookmark is a `javascript:` address (`virtual:favori`, built from
 * `src/favori/`): saved once, it reads the article in the page and opens it
 * on /analyser, with no selection and no copy.
 *
 * No browser lets a page add a bookmark, so the page does the rest: the tab
 * title is already the bookmark's name, one button copies the address and
 * moves on, and only the reader's own browser is shown, one gesture a screen,
 * each with the screen it shows.
 */
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { BOOKMARKLET, FAVORI_ORIGIN } from 'virtual:favori';

import { PRIMARY_BUTTON, QUIET_LINK, SECONDARY_BUTTON } from '../components/Landing';
import { Page } from '../components/Layout';
import { Label, Lines, Phone, Tap, W } from '../components/PhoneDrawing';
import { currentPhoneOs, type PhoneOs } from '../phone';
import { Link } from '../router';
import { ORIGIN } from '../seo';

/** The bookmark's name, and this page's title, so that a new bookmark is named already. */
export const NAME = 'Analyser avec Squiggle';

/** The bookmark that opens this very site: production, staging, or a local build. */
export function bookmarkletFor(origin: string): string {
  return BOOKMARKLET.replace(FAVORI_ORIGIN, encodeURIComponent(origin));
}

type Device = PhoneOs | 'ordinateur';

const DEVICES: Array<{ id: Device; label: string }> = [
  { id: 'android', label: 'Android' },
  { id: 'ios', label: 'iPhone' },
  { id: 'ordinateur', label: 'Ordinateur' },
];

interface Step {
  title: string;
  text: ReactNode;
  screen: ReactNode;
}

/** After the copy, each phone's gestures to save it, then the one that uses it. */
const STEPS: Record<PhoneOs, Step[]> = {
  android: [
    {
      title: 'Mettez cette page en favori',
      text: <>Touchez ⋮ en haut à droite, puis l’étoile ☆.</>,
      screen: <ChromeMenu />,
    },
    {
      title: 'Touchez « Modifier »',
      text: <>Dans le bandeau qui apparaît en bas.</>,
      screen: <ChromeSnackbar />,
    },
    {
      title: 'Collez le favori dans « URL »',
      text: <>Effacez l’adresse, appuyez longuement, puis Coller. Revenez en arrière : c’est enregistré.</>,
      screen: <ChromeEdit />,
    },
    {
      title: 'C’est prêt',
      text: (
        <>
          Sur un article, touchez la barre d’adresse, tapez « Analyser », puis touchez « {NAME} ». Chrome n’ouvre pas
          un favori de ce genre depuis la liste des favoris : passez par la barre d’adresse.
        </>
      ),
      screen: <ChromeUse />,
    },
  ],
  ios: [
    {
      title: 'Ajoutez un signet',
      text: <>Touchez Partager, puis « Ajouter un signet », puis Enregistrer.</>,
      screen: <SafariShare />,
    },
    {
      title: 'Ouvrez-le pour le modifier',
      text: <>Touchez Signets (le livre), puis Modifier, puis « {NAME} ».</>,
      screen: <SafariBookmarks editing />,
    },
    {
      title: 'Collez le favori dans l’adresse',
      text: <>Effacez l’adresse, touchez le champ, puis Coller. Revenez en arrière : c’est enregistré.</>,
      screen: <SafariEdit />,
    },
    {
      title: 'C’est prêt',
      text: <>Sur un article, touchez Signets (le livre), puis « {NAME} ».</>,
      screen: <SafariBookmarks />,
    },
  ],
};

export function Favori() {
  const [device, setDevice] = useState<Device>(() => currentPhoneOs() ?? 'ordinateur');
  // 0 is the copy; 1 and on are the device's steps.
  const [step, setStep] = useState(0);
  const [copied, setCopied] = useState<'ok' | 'manual' | null>(null);
  const code = bookmarkletFor(typeof window === 'undefined' ? ORIGIN : window.location.origin);
  const field = useRef<HTMLTextAreaElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

  // A screen reader hears the new step, and a phone shows it from the top.
  useEffect(() => {
    if (!moved.current) return;
    heading.current?.closest('section')?.scrollIntoView({ block: 'start' });
    heading.current?.focus({ preventScroll: true });
  }, [step, device]);

  function go(next: number) {
    moved.current = true;
    setStep(next);
  }

  function choose(next: Device) {
    moved.current = false;
    setDevice(next);
    setStep(0);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied('ok');
      go(1);
    } catch {
      // No clipboard API: the address is shown, selected, for the reader's own Copy.
      setCopied('manual');
      requestAnimationFrame(() => field.current?.select());
    }
  }

  return (
    <Page
      title={NAME}
      lead="Sur votre téléphone, l’article ouvert dans le navigateur s’analyse d’un geste : le favori lit son texte dans la page et l’ouvre dans Squiggle. Rien à sélectionner, rien à copier."
    >
      <div role="group" aria-label="Votre appareil" className="inline-flex rounded-control border border-borderControl p-1">
        {DEVICES.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={device === item.id}
            onClick={() => choose(item.id)}
            className={`min-h-11 rounded-[calc(var(--radius-control)-4px)] px-4 text-base font-medium transition-colors duration-160 ease-out ${
              device === item.id ? 'bg-accent text-accentForeground' : 'text-muted hover:text-foreground'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {device === 'ordinateur' ? (
        <Computer code={code} />
      ) : (
        <Guide
          os={device}
          step={step}
          copied={copied}
          code={code}
          field={field}
          heading={heading}
          onCopy={copy}
          onGo={go}
        />
      )}

      <section aria-labelledby="favori-trajet" className="mt-16 border-t border-lineSoft pt-10">
        <h2 id="favori-trajet" className="m-0 font-display text-2xl font-semibold tracking-[-0.01em]">
          Ce que fait le favori
        </h2>
        <ul className="mt-4 mb-0 grid list-disc gap-2 pl-6 text-lg leading-relaxed">
          <li>
            Il lit l’article dans la page, comme l’extension, avec ce que vous pouvez y lire : un article payant est lu
            en entier si vous êtes abonné et connecté.
          </li>
          <li>Si le site n’affiche la fin d’un long article qu’au fil de la lecture, il fait défiler la page jusqu’au bout.</li>
          <li>
            Il ouvre Squiggle avec le texte dans la partie de l’adresse qui suit « # », que le navigateur n’envoie à
            aucun serveur. Le texte ne quitte votre téléphone que lorsque l’analyse est lancée, comme un texte collé.
          </li>
          <li>Il ne charge aucun code dans la page : tout ce qu’il fait est écrit dans l’adresse que vous copiez.</li>
        </ul>
        <p className="mt-4 mb-0 text-lg leading-relaxed">
          Le favori ne marche pas sur une page ?{' '}
          <Link to="/analyser" className={QUIET_LINK}>
            Collez le texte sur Squiggle
          </Link>{' '}
          : copiez un passage, puis « Ajouter la suite » pour les suivants.
        </p>
      </section>
    </Page>
  );
}

function Guide({
  os,
  step,
  copied,
  code,
  field,
  heading,
  onCopy,
  onGo,
}: {
  os: PhoneOs;
  step: number;
  copied: 'ok' | 'manual' | null;
  code: string;
  field: RefObject<HTMLTextAreaElement>;
  heading: RefObject<HTMLHeadingElement>;
  onCopy: () => void;
  onGo: (step: number) => void;
}) {
  const steps = STEPS[os];
  const total = steps.length + 1;
  const current = step === 0 ? null : steps[step - 1];
  return (
    <section aria-labelledby="favori-etape" className="mt-8 scroll-mt-4">
      <p className="m-0 text-base font-medium text-accentInk tabular-nums">
        Étape {step + 1} sur {total}
      </p>
      <h2
        id="favori-etape"
        ref={heading}
        tabIndex={-1}
        className="mt-2 mb-0 scroll-mt-4 font-display text-2xl leading-tight font-semibold tracking-[-0.01em] outline-none"
      >
        {current ? current.title : 'Copiez le favori'}
      </h2>

      {current ? (
        <div className="mt-4 grid items-center gap-6 sm:grid-cols-[15rem_minmax(0,1fr)] sm:gap-10">
          <div className="mx-auto w-full max-w-[15rem] sm:order-first">{current.screen}</div>
          <p className="m-0 text-lg leading-relaxed text-pretty max-sm:order-first">{current.text}</p>
        </div>
      ) : (
        <>
          <p className="mt-3 mb-0 text-lg leading-relaxed text-pretty">
            Le favori est une adresse : vous la collerez à l’étape 4. Son nom, « {NAME} », est déjà prêt.
          </p>
          <button type="button" onClick={onCopy} className={`${PRIMARY_BUTTON} mt-6 w-full sm:w-auto`}>
            Copier le favori
          </button>
          {copied === 'manual' ? (
            <>
              <p className="mt-4 mb-0 text-base text-muted">
                Ce navigateur ne laisse pas copier d’ici : le favori est sélectionné ci-dessous, touchez Copier.
              </p>
              <textarea
                ref={field}
                readOnly
                value={code}
                rows={4}
                aria-label="Adresse du favori"
                className="mt-3 w-full rounded-control border border-border bg-surface p-3 font-mono text-sm break-all"
              />
            </>
          ) : null}
          {os === 'ios' ? (
            <p className="mt-6 mb-0 text-base leading-relaxed text-muted">
              Sur iPhone, le raccourci s’utilise depuis Partager, et lit aussi des captures :{' '}
              <Link to="/raccourci" className={QUIET_LINK}>
                ajouter le raccourci
              </Link>
              .
            </p>
          ) : null}
        </>
      )}

      <p role="status" className="mt-4 mb-0 min-h-6 text-base text-muted">
        {copied === 'ok' && step > 0 && step < total - 1 ? 'Favori copié.' : ''}
      </p>
      {step > 0 || copied === 'manual' ? (
        <div className="mt-2 flex gap-3">
          {step > 0 ? (
            <button type="button" onClick={() => onGo(step - 1)} className={`${SECONDARY_BUTTON} flex-1 sm:flex-none`}>
              Précédent
            </button>
          ) : null}
          {step < total - 1 ? (
            <button type="button" onClick={() => onGo(step + 1)} className={`${PRIMARY_BUTTON} flex-1 sm:flex-none`}>
              {step === 0 ? 'C’est copié' : 'Suivant'}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function Computer({ code }: { code: string }) {
  const dragLink = useRef<HTMLAnchorElement>(null);
  // React refuses a `javascript:` href, so the link to drag to the bookmarks bar gets its own here.
  useEffect(() => {
    dragLink.current?.setAttribute('href', code);
  }, [code]);
  return (
    <section aria-labelledby="favori-ordinateur" className="mt-8">
      <h2 id="favori-ordinateur" className="m-0 font-display text-2xl leading-tight font-semibold tracking-[-0.01em]">
        Glissez le bouton dans la barre des favoris
      </h2>
      <div className="mt-4 grid items-center gap-6 sm:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] sm:gap-10">
        <BrowserDrag />
        <div className="grid content-start gap-4">
          <a
            ref={dragLink}
            href="#favori"
            onClick={(event) => event.preventDefault()}
            className={`${PRIMARY_BUTTON} cursor-grab justify-self-start`}
          >
            {NAME}
          </a>
          <p className="m-0 text-lg leading-relaxed text-pretty">
            Barre cachée ? Ctrl+Maj+B, ou ⌘+Maj+B sur Mac. Sur un article, cliquez le favori. L’extension, elle,
            surligne le rapport dans la page.
          </p>
          <p className="m-0 text-base leading-relaxed text-muted">
            Pour votre téléphone, ouvrez squiggle.fr/favori dans son navigateur.
          </p>
        </div>
      </div>
    </section>
  );
}

/* The drawings: the reader's browser, the screen each step shows, with where to touch numbered in the accent. */

const PASTED = 'javascript:(()=>{…';

/** A text field of a settings form, the one to fill in the accent. */
function Field({ y, label, value, accent = false }: { y: number; label: string; value: string; accent?: boolean }) {
  return (
    <>
      <Label x={20} y={y} size={8}>
        {label}
      </Label>
      <rect x={14} y={y + 6} width={W - 28} height={24} rx={6} className={accent ? 'fill-background stroke-accent' : 'fill-background stroke-border'} strokeWidth={accent ? 2 : 1} />
      <Label x={22} y={y + 21.5} size={8.5}>
        {value}
      </Label>
    </>
  );
}

/** The bubble a long press opens on a field. */
function Paste({ x, y }: { x: number; y: number }) {
  return (
    <>
      <rect x={x} y={y} width={44} height={20} rx={6} className="fill-accent" />
      <Label x={x + 22} y={y + 13.5} size={8.5} accent anchor="middle">
        Coller
      </Label>
    </>
  );
}

function Star({ x, y, r = 6, className = 'fill-none stroke-foreground' }: { x: number; y: number; r?: number; className?: string }) {
  const points = Array.from({ length: 10 }, (_, i) => {
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const radius = i % 2 ? r * 0.45 : r;
    return `${(x + radius * Math.cos(angle)).toFixed(1)},${(y + radius * Math.sin(angle)).toFixed(1)}`;
  }).join(' ');
  return <polygon points={points} className={className} strokeWidth={1.2} strokeLinejoin="round" />;
}

function Kebab({ x, y }: { x: number; y: number }) {
  return (
    <>
      {[-5, 0, 5].map((dy) => (
        <circle key={dy} cx={x} cy={y + dy} r={1.5} className="fill-foreground" />
      ))}
    </>
  );
}

/** Chrome's toolbar at the top: home, the address, the tabs and ⋮. */
function ChromeBar({ address = 'presse.example/article' }: { address?: string }) {
  return (
    <>
      <rect x={30} y={36} width={110} height={20} rx={10} className="fill-background" />
      <Label x={40} y={49} size={7.5}>
        {address}
      </Label>
      <path d="M14 48l6-6 6 6v6h-12z" fill="none" className="stroke-foreground" strokeWidth={1.2} strokeLinejoin="round" />
      <rect x={146} y={40} width={12} height={12} rx={3} fill="none" className="stroke-foreground" strokeWidth={1.2} />
      <Kebab x={168} y={46} />
    </>
  );
}

function Article({ y = 70 }: { y?: number }) {
  return (
    <>
      <Lines x={18} y={y} widths={[128, 104]} gap={12} />
      <Lines x={18} y={y + 34} widths={[144, 140, 128, 144, 92, 136, 144, 120]} />
    </>
  );
}

function ChromeMenu() {
  const rows = ['Nouvel onglet', 'Historique', 'Favoris', 'Onglets récents', 'Partager…'];
  return (
    <Phone android label="Chrome : le menu ⋮ ouvert, l’étoile en haut du menu">
      <ChromeBar />
      <Article />
      <circle cx={168} cy={46} r={10} fill="none" className="stroke-accent" strokeWidth={1.5} />
      <rect x={70} y={62} width={102} height={170} rx={10} className="fill-background stroke-border" />
      {[0, 1, 2, 3].map((i) => {
        const x = 84 + i * 24;
        return i === 1 ? (
          <g key={i}>
            <circle cx={x} cy={80} r={9} className="fill-accentSoft stroke-accent" />
            <Star x={x} y={80} r={6} className="fill-none stroke-accentInk" />
          </g>
        ) : (
          <circle key={i} cx={x} cy={80} r={3} className="fill-border" />
        );
      })}
      {rows.map((row, i) => (
        <Label key={row} x={82} y={114 + i * 24} size={8}>
          {row}
        </Label>
      ))}
      <Tap x={150} y={28} n={1} />
      <Tap x={124} y={98} n={2} />
    </Phone>
  );
}

function ChromeSnackbar() {
  return (
    <Phone android label="Chrome : en bas, « Ajouté à Favoris mobiles » et le bouton Modifier">
      <ChromeBar />
      <Article />
      <rect x={10} y={300} width={W - 20} height={32} rx={8} className="fill-background stroke-border" />
      <Label x={20} y={319.5} size={8}>
        Ajouté à Favoris mobiles
      </Label>
      <rect x={118} y={306} width={50} height={20} rx={6} className="fill-accent" />
      <Label x={143} y={319.5} size={8.5} accent anchor="middle">
        Modifier
      </Label>
      <Tap x={143} y={290} n={1} />
    </Phone>
  );
}

function ChromeEdit() {
  return (
    <Phone android label="Chrome, « Modifier le favori » : le nom est prêt, l’adresse collée dans URL">
      <path d="M22 48h-8m0 0l5-5m-5 5l5 5" fill="none" className="stroke-foreground" strokeWidth={1.5} strokeLinecap="round" />
      <Label x={34} y={51} size={10}>
        Modifier le favori
      </Label>
      <Field y={82} label="Nom" value={NAME} />
      <Field y={130} label="URL" value={PASTED} accent />
      <Paste x={30} y={170} />
      <Field y={210} label="Dossier" value="Favoris mobiles" />
      <Tap x={W - 24} y={154} n={1} />
      <Tap x={36} y={34} n={2} />
    </Phone>
  );
}

function ChromeUse() {
  return (
    <Phone android label="Chrome : « Analyser » tapé dans la barre d’adresse, le favori dans les suggestions">
      <rect x={12} y={36} width={W - 24} height={22} rx={11} className="fill-background stroke-accent" />
      <Label x={22} y={50} size={8.5}>
        Analyser
      </Label>
      <rect x={10} y={68} width={W - 20} height={30} rx={8} className="fill-accent" />
      <Star x={24} y={83} r={6} className="fill-none stroke-accentForeground" />
      <Label x={38} y={86.5} size={8.5} accent>
        {NAME}
      </Label>
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <circle cx={24} cy={116 + i * 28} r={5} fill="none" className="stroke-muted" strokeWidth={1.2} />
          <Lines x={38} y={114 + i * 28} widths={[90 - i * 14]} />
        </g>
      ))}
      <Tap x={W - 22} y={83} n={1} />
    </Phone>
  );
}

/** Safari's bar at the bottom: the address, then back, forward, Partager, Signets and the tabs. */
function SafariBar({ mark }: { mark?: 'partager' | 'signets' }) {
  const y = 326;
  return (
    <>
      <rect x={14} y={290} width={W - 28} height={22} rx={11} className="fill-background" />
      <Label x={W / 2} y={304} size={7.5} anchor="middle">
        presse.example
      </Label>
      <path d={`M24 ${y + 5}l-5-5 5-5M54 ${y - 5}l5 5-5 5`} fill="none" className="stroke-muted" strokeWidth={1.4} />
      <g className={mark === 'partager' ? 'stroke-accentInk' : 'stroke-foreground'} fill="none" strokeWidth={1.4}>
        <path d={`M84 ${y - 2}h-3v10h18v-10h-3M90 ${y + 2}v-12m-4 4l4-4 4 4`} strokeLinejoin="round" />
      </g>
      <g className={mark === 'signets' ? 'stroke-accentInk' : 'stroke-foreground'} fill="none" strokeWidth={1.4}>
        <path d={`M114 ${y - 6}q6-2 10 1v12q-4-3-10-1zM134 ${y - 6}q-6-2-10 1v12q4-3 10-1z`} strokeLinejoin="round" />
      </g>
      <rect x={150} y={y - 6} width={11} height={11} rx={2} fill="none" className="stroke-foreground" strokeWidth={1.4} />
      {mark ? <circle cx={mark === 'partager' ? 90 : 124} cy={y} r={12} fill="none" className="stroke-accent" strokeWidth={1.5} /> : null}
    </>
  );
}

function SafariShare() {
  const rows = ['Copier', 'Ajouter à la liste de lecture', 'Ajouter un signet', 'Ajouter aux favoris'];
  return (
    <Phone label="Safari : Partager ouvert, « Ajouter un signet » dans la liste">
      <Article y={40} />
      <rect x={10} y={136} width={W - 20} height={140} rx={14} className="fill-background stroke-border" />
      {rows.map((row, i) => {
        const y = 146 + i * 30;
        const ours = row === 'Ajouter un signet';
        return (
          <g key={row}>
            <rect x={18} y={y} width={W - 36} height={24} rx={7} className={ours ? 'fill-accent' : 'fill-surface'} />
            <Label x={28} y={y + 15.5} size={8.5} accent={ours}>
              {row}
            </Label>
          </g>
        );
      })}
      <SafariBar mark="partager" />
      <Tap x={90} y={348} n={1} />
      <Tap x={W - 22} y={218} n={2} />
    </Phone>
  );
}

function SafariBookmarks({ editing = false }: { editing?: boolean }) {
  const rows = ['Favoris', 'Historique', NAME, 'presse.example'];
  return (
    <Phone
      label={
        editing
          ? 'Safari, Signets : Modifier en bas, puis le signet « Analyser avec Squiggle »'
          : 'Safari, Signets : le signet « Analyser avec Squiggle »'
      }
    >
      <Label x={20} y={58} size={12}>
        Signets
      </Label>
      {rows.map((row, i) => {
        const y = 72 + i * 32;
        const ours = row === NAME;
        return (
          <g key={row}>
            <rect x={14} y={y} width={W - 28} height={26} rx={7} className={ours ? 'fill-accent' : 'fill-background'} />
            {editing && !ours ? <circle cx={26} cy={y + 13} r={5} className="fill-border" /> : null}
            <Label x={editing ? 38 : 24} y={y + 16.5} size={8.5} accent={ours}>
              {row}
            </Label>
          </g>
        );
      })}
      {editing ? (
        <>
          <rect x={W - 62} y={290} width={48} height={22} rx={6} className="fill-accent" />
          <Label x={W - 38} y={304.5} size={8.5} accent anchor="middle">
            Modifier
          </Label>
          <Tap x={W - 38} y={326} n={1} />
          <Tap x={W - 22} y={137} n={2} />
        </>
      ) : (
        <>
          <SafariBar mark="signets" />
          <Tap x={124} y={348} n={1} />
          <Tap x={W - 22} y={137} n={2} />
        </>
      )}
    </Phone>
  );
}

function SafariEdit() {
  return (
    <Phone label="Safari, « Modifier le signet » : le nom est prêt, l’adresse collée">
      <path d="M22 43l-5 5 5 5" fill="none" className="stroke-foreground" strokeWidth={1.5} strokeLinecap="round" />
      <Label x={W / 2} y={51} size={10} anchor="middle">
        Modifier le signet
      </Label>
      <Field y={82} label="Nom" value={NAME} />
      <Field y={130} label="Adresse" value={PASTED} accent />
      <Paste x={30} y={170} />
      <Tap x={W - 24} y={154} n={1} />
      <Tap x={36} y={34} n={2} />
    </Phone>
  );
}

/** A computer's browser: the button dragged from the page onto the bookmarks bar. */
function BrowserDrag() {
  return (
    <svg role="img" aria-label="Le bouton glissé de la page jusqu’à la barre des favoris" viewBox="0 0 320 180" className="block h-auto w-full">
      <rect x={2} y={2} width={316} height={176} rx={12} className="fill-surface stroke-borderControl" strokeWidth={2} />
      {[16, 28, 40].map((x) => (
        <circle key={x} cx={x} cy={16} r={4} className="fill-border" />
      ))}
      <rect x={56} y={8} width={200} height={16} rx={8} className="fill-background" />
      <rect x={2} y={32} width={316} height={22} className="fill-background" />
      <rect x={10} y={35} width={150} height={16} rx={8} className="fill-accentSoft stroke-accent" strokeDasharray="3 2" />
      <text x={85} y={46.5} fontSize={9.5} textAnchor="middle" className="fill-accentInk font-semibold">
        {NAME}
      </text>
      <Lines x={172} y={41} widths={[40]} />
      <Lines x={222} y={41} widths={[50]} />
      <Lines x={24} y={76} widths={[160, 120]} gap={12} />
      <rect x={136} y={116} width={168} height={32} rx={8} className="fill-accent" />
      <text x={220} y={136.5} fontSize={12} textAnchor="middle" className="fill-accentForeground font-semibold">
        {NAME}
      </text>
      <path d="M160 114C142 92 112 76 88 58" fill="none" className="stroke-accentInk" strokeWidth={2} strokeDasharray="5 4" />
      <path d="M86 66l1-9 9 2" fill="none" className="stroke-accentInk" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
