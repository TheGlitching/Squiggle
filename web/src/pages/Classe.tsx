/**
 * The classroom mode (/classe), in three states of one page:
 *
 * - no session yet: open a session file, the way in on a classroom computer,
 *   with no account and nothing to type; and how a lesson goes, step by step;
 * - the preparation: the article with every answer, for the teacher alone, the
 *   order the board will reveal the findings in, the sheets to print and the
 *   session file to carry to class;
 * - the lesson: this window becomes the teacher's desk and opens the board in
 *   a second window, for the projector. The desk holds the lesson's state and
 *   the board shows what it is told.
 */
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';

import type { Finding } from '../../../shared/src/engine/types';
import { Board, categoryOf, Sentences } from '../components/Board';
import { ModeEmploi } from '../components/ModeEmploi';
import { PAGE, PRIMARY_BUTTON, QUIET_LINK, SECONDARY_BUTTON, TITLE } from '../components/Landing';
import {
  CHANNEL,
  deckOf,
  fileName,
  keyOf,
  layoutOf,
  loadSeance,
  MAX_FILE_BYTES,
  parseSeance,
  PHASES,
  placeOf,
  questionFor,
  saveSeance,
  SeanceError,
  seanceFile,
  startState,
  step,
  tally,
  type ClassState,
  type Key,
  type Layout,
  type Message,
  type Seance,
} from '../classe';
import { SCORE_BANDS, SEVERITY_LABELS, VERIFICATION_STATES, type SeverityLevel } from '../demo';
import { frenchDate } from '../format';
import { passageTone } from '../report';
import { Link } from '../router';
import { tone } from '../components/Exemple';

const VERIFICATION = Object.fromEntries(VERIFICATION_STATES.map((v) => [v.state, v.label]));
const BOARD_WINDOW = 'squiggle-tableau';

export function Classe() {
  const [seance, setSeance] = useState<Seance | null>(loadSeance);
  const [live, setLive] = useState(false);

  const update = (next: Seance | null) => {
    saveSeance(next);
    setSeance(next);
  };

  useEffect(() => {
    window.scrollTo?.({ top: 0 });
  }, [live, seance === null]);

  if (!seance) return <Accueil onOpen={update} />;
  if (live) return <Pupitre seance={seance} onEnd={() => setLive(false)} />;
  return <Preparation seance={seance} onChange={update} onLaunch={() => setLive(true)} />;
}

/* ---------- No session yet ---------- */

function Accueil({ onOpen }: { onOpen: (seance: Seance) => void }) {
  return (
    <>
      <div className={`${PAGE} pt-10 pb-12 md:pt-16`}>
        <h1 className={TITLE}>Le mode classe</h1>
        <p className="mt-4 mb-0 max-w-[55ch] text-xl leading-relaxed text-muted">
          Vous préparez un article chez vous et voyez tout le corrigé, seul. En classe, le tableau ne montre que ce que
          vous révélez, constat par constat. Les élèves n’utilisent pas d’IA : ils lisent, soulignent et débattent.
        </p>
        <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <OpenSeance onOpen={onOpen} />
          <div className="grid content-start gap-4 rounded-card border border-border bg-surface p-6 md:p-8">
            <h2 className="m-0 font-display text-2xl leading-tight font-semibold">Pas encore de séance ?</h2>
            <ol className="m-0 grid list-none gap-3 p-0 text-lg leading-snug">
              <li className="flex items-baseline gap-3">
                <StepNumber n={1} />
                Analysez un article sur le site.
              </li>
              <li className="flex items-baseline gap-3">
                <StepNumber n={2} />
                Sous le rapport, cliquez sur « Préparer pour la classe ».
              </li>
            </ol>
            <Link to="/analyser" className={`${SECONDARY_BUTTON} justify-self-start max-sm:w-full`}>
              Analyser un article
            </Link>
            <p className="m-0 text-base text-muted">
              Il faut un compte pour analyser un article. Pour ouvrir une séance, non.
            </p>
          </div>
        </div>
      </div>
      <section aria-labelledby="pas-a-pas-titre" className="border-t border-lineSoft py-14 md:py-20">
        <div className={PAGE}>
          <h2 id="pas-a-pas-titre" className="m-0 font-display text-3xl leading-tight font-semibold tracking-tight md:text-4xl">
            Une séance, pas à pas
          </h2>
          <div className="mt-8">
            <ModeEmploi />
          </div>
        </div>
      </section>
    </>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-base font-bold text-accentForeground"
    >
      {n}
    </span>
  );
}

/** The way in on a classroom computer: a file from a USB key or the downloads, chosen or dropped. */
export function OpenSeance({ onOpen }: { onOpen: (seance: Seance) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  async function read(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (file.size > MAX_FILE_BYTES) {
      setError('Ce fichier est trop gros pour être une séance Squiggle.');
      return;
    }
    try {
      onOpen(parseSeance(await file.text()));
    } catch (err) {
      setError(err instanceof SeanceError ? err.message : 'Ce fichier n’a pas pu être lu. Réessayez.');
    }
  }

  const drop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    void read(event.dataTransfer.files[0]);
  };

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
      className={`grid content-start justify-items-start gap-4 rounded-card border-2 border-dashed p-6 transition-colors duration-160 ease-out md:p-8 ${
        over ? 'border-accent bg-accentSoft' : 'border-borderControl'
      }`}
    >
      <h2 className="m-0 font-display text-2xl leading-tight font-semibold">Vous avez un fichier de séance ?</h2>
      <p className="m-0 max-w-[48ch] text-lg leading-relaxed text-muted">
        Son nom se termine par <span className="font-semibold text-foreground">.squiggle</span>. Il est sur votre clé
        USB, ou dans le dossier Téléchargements de l’ordinateur.
      </p>
      <label className={`${PRIMARY_BUTTON} cursor-pointer text-lg focus-within:ring-2 focus-within:ring-accentHover focus-within:ring-offset-2 focus-within:ring-offset-background max-sm:w-full`}>
        <input
          type="file"
          accept=".squiggle,.json"
          className="sr-only"
          onChange={(event) => {
            void read(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        Ouvrir le fichier de séance
      </label>
      <p className="m-0 text-base text-muted">Vous pouvez aussi le faire glisser dans ce cadre.</p>
      {error ? (
        <p
          role="alert"
          className="m-0 rounded-control border border-critical bg-criticalSoft px-4 py-3 text-base text-criticalInk"
        >
          {error}
        </p>
      ) : null}
      <p className="m-0 text-base text-muted">
        Rien n’est envoyé : le fichier s’ouvre dans ce navigateur, sans compte, et s’oublie quand vous fermez l’onglet.
      </p>
    </div>
  );
}

/* ---------- The preparation ---------- */

function PrivateBadge({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 inline-flex w-fit items-center gap-2 rounded-full border border-[#3a2a66] bg-accentSoft px-3 py-1.5 text-base font-medium text-accentInk">
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
        <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
        <path d="M1 1l22 22" />
      </svg>
      {children}
    </p>
  );
}

function analysedOn(seance: Seance): string | null {
  const at = Date.parse(seance.report.meta.analyzedAt);
  return frenchDate(Number.isNaN(at) ? null : at);
}

function Preparation({
  seance,
  onChange,
  onLaunch,
}: {
  seance: Seance;
  onChange: (seance: Seance | null) => void;
  onLaunch: () => void;
}) {
  const layout = useMemo(() => layoutOf(seance.blocks, seance.report.findings), [seance.blocks, seance.report]);
  const [open, setOpen] = useState<string | null>(null);
  const deck = deckOf(seance);
  const all = new Set(seance.report.findings.map((f) => f.id));
  const band = SCORE_BANDS[seance.report.scoreBand];
  const date = analysedOn(seance);

  const move = (index: number, by: number) => {
    const order = [...seance.order];
    const to = index + by;
    if (to < 0 || to >= order.length) return;
    [order[index], order[to]] = [order[to], order[index]];
    onChange({ ...seance, order });
  };
  const toggle = (id: string) =>
    onChange({ ...seance, left: seance.left.includes(id) ? seance.left.filter((x) => x !== id) : [...seance.left, id] });

  return (
    <div className={`${PAGE} pt-8 pb-16 sm:pt-12`}>
      <div className="grid gap-4">
        <PrivateBadge>Vue enseignant · vos élèves ne voient pas cet écran</PrivateBadge>
        <h1 className={TITLE}>Préparer la séance</h1>
        <p className="m-0 max-w-[65ch] text-lg leading-relaxed text-muted">
          {seance.title ? `« ${seance.title} »` : 'Article sans titre'}
          {date ? ` · analysé le ${date}` : ''} ·{' '}
          <span className="text-(--sev-text)" style={tone(band.tone)}>
            {band.title}, {Math.round(seance.report.score)}/100
          </span>
          , {seance.hideScore ? 'note masquée en classe' : 'note affichée en classe'}
        </p>
        {seance.fromFile ? (
          <p className="m-0 max-w-[65ch] rounded-control border border-border bg-surface px-4 py-3 text-base">
            Séance ouverte depuis un fichier. Le tableau l’indiquera : un fichier a pu être modifié depuis l’analyse.
          </p>
        ) : null}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start lg:gap-12">
        <div className="grid gap-6 lg:order-2">
          <Actions seance={seance} deckSize={deck.length} onLaunch={onLaunch} onClose={() => onChange(null)} />

          <section aria-labelledby="ordre-titre" className="rounded-card border border-border bg-surface p-5">
            <h2 id="ordre-titre" className="m-0 font-display text-xl font-semibold">
              Ordre de révélation
            </h2>
            <p className="mt-1 mb-0 text-base text-muted">
              Le tableau les montrera un par un, dans cet ordre. Retirez ceux que vous ne voulez pas traiter.
            </p>
            {seance.order.length === 0 ? (
              <p className="mt-4 mb-0 text-base text-muted">
                L’analyse n’a relevé aucun passage : la séance portera sur la lecture et le débat.
              </p>
            ) : (
              <ol className="mt-4 mb-0 grid list-none gap-2 p-0">
                {seance.order
                  .filter((id) => all.has(id))
                  .map((id, index) => {
                    const finding = seance.report.findings.find((f) => f.id === id) as Finding;
                    return (
                      <OrderItem
                        key={id}
                        finding={finding}
                        place={placeOf(layout, finding)}
                        position={seance.left.includes(id) ? null : deck.indexOf(finding) + 1}
                        open={open === id}
                        first={index === 0}
                        last={index === seance.order.length - 1}
                        onOpen={() => setOpen(open === id ? null : id)}
                        onUp={() => move(index, -1)}
                        onDown={() => move(index, 1)}
                        onToggle={() => toggle(id)}
                      />
                    );
                  })}
              </ol>
            )}
          </section>

          <section aria-labelledby="note-titre" className="rounded-card border border-border bg-surface p-5">
            <h2 id="note-titre" className="sr-only">
              La note
            </h2>
            <Switch
              checked={seance.hideScore}
              onChange={(hideScore) => onChange({ ...seance, hideScore })}
              label="Masquer la note en classe"
              hint="Vous pourrez l’afficher à la fin, depuis le pupitre."
            />
          </section>
        </div>

        <article
          aria-label="L’article, avec tout le corrigé"
          className="rounded-card bg-paper px-5 py-7 font-serif text-lg leading-[1.7] text-paperInk sm:px-8 md:px-12 md:py-10 lg:sticky lg:top-6 lg:order-1 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto lg:overscroll-contain"
        >
          <p className="m-0 font-sans text-base font-medium text-paperMuted">Tout le corrigé, pour vous seul</p>
          {layout.blocks.map(({ block, runs }) => {
            const text = (
              <Sentences
                runs={runs}
                shown={all}
                current={open}
                marks={null}
                badge={(finding) => {
                  const at = deck.indexOf(finding);
                  return at >= 0 ? at + 1 : null;
                }}
              />
            );
            return block.type === 'heading' ? (
              <h2 key={block.id} className="mt-2 mb-0 text-3xl leading-tight font-semibold tracking-tight">
                {text}
              </h2>
            ) : (
              <p key={block.id} className="mt-5 mb-0">
                {text}
              </p>
            );
          })}
        </article>
      </div>
    </div>
  );
}

function Switch({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-start justify-between gap-4 rounded-control text-left"
    >
      <span className="grid gap-0.5">
        <span className="text-base font-medium">{label}</span>
        <span className="text-base text-muted">{hint}</span>
      </span>
      <span
        aria-hidden="true"
        className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors duration-160 ease-out ${checked ? 'bg-accent' : 'bg-border'}`}
      >
        <span
          className={`absolute top-1 left-1 h-5 w-5 rounded-full transition-transform duration-160 ease-out ${
            checked ? 'translate-x-5 bg-accentForeground' : 'bg-foreground'
          }`}
        />
      </span>
    </button>
  );
}

const ICON_BUTTON =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-border text-lg text-muted transition-colors duration-160 ease-out hover:border-accent hover:text-accentInk disabled:opacity-35 disabled:hover:border-border disabled:hover:text-muted';

function OrderItem({
  finding,
  place,
  position,
  open,
  first,
  last,
  onOpen,
  onUp,
  onDown,
  onToggle,
}: {
  finding: Finding;
  place: string | null;
  position: number | null;
  open: boolean;
  first: boolean;
  last: boolean;
  onOpen: () => void;
  onUp: () => void;
  onDown: () => void;
  onToggle: () => void;
}) {
  const verification = finding.verification ? VERIFICATION[finding.verification] : null;
  return (
    <li
      style={tone(passageTone(finding))}
      className={`grid gap-2 rounded-control border p-3 transition-colors duration-160 ease-out ${
        open ? 'border-accent bg-accentSoft' : 'border-border bg-background'
      } ${position === null ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
            position === null ? 'border border-borderControl text-muted' : 'bg-accent text-accentForeground'
          }`}
        >
          {position ?? '–'}
        </span>
        <button
          type="button"
          aria-expanded={open}
          onClick={onOpen}
          className="min-h-11 grow text-left text-base leading-snug font-semibold"
        >
          {finding.label}
          {position === null ? <span className="font-normal text-muted"> · retiré</span> : null}
        </button>
        <button type="button" onClick={onUp} disabled={first} aria-label={`Monter « ${finding.label} »`} className={ICON_BUTTON}>
          ↑
        </button>
        <button type="button" onClick={onDown} disabled={last} aria-label={`Descendre « ${finding.label} »`} className={ICON_BUTTON}>
          ↓
        </button>
      </div>
      <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
        <span className="flex items-center gap-1.5 text-(--sev-text)">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-(--sev-color)" />
          {categoryOf(finding)}
        </span>
        {finding.category === 'point-fort' ? null : <span>{SEVERITY_LABELS[finding.severity as SeverityLevel]}</span>}
        {verification ? <span>{verification}</span> : null}
        <span>{place ?? 'passage introuvable dans le texte'}</span>
      </p>
      {open ? (
        <div className="grid gap-2">
          <p className="m-0 text-base leading-relaxed">{finding.explanation}</p>
          <p className="m-0 text-base leading-relaxed text-accentInk">
            <span className="text-muted">À poser : </span>
            {questionFor(finding)}
          </p>
        </div>
      ) : null}
      <button type="button" onClick={onToggle} className={`${QUIET_LINK} justify-self-start text-sm`}>
        {position === null ? 'Remettre dans la séance' : 'Retirer de la séance'}
      </button>
    </li>
  );
}

function Actions({
  seance,
  deckSize,
  onLaunch,
  onClose,
}: {
  seance: Seance;
  deckSize: number;
  onLaunch: () => void;
  onClose: () => void;
}) {
  const [saved, setSaved] = useState<string | null>(null);

  function download() {
    const name = fileName(seance);
    const url = URL.createObjectURL(seanceFile(seance));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setSaved(name);
  }

  return (
    <section aria-label="La séance" className="grid gap-3 rounded-card border border-border bg-surface p-5">
      <button type="button" onClick={onLaunch} className={`${PRIMARY_BUTTON} w-full text-lg`}>
        Lancer en classe
      </button>
      <p className="m-0 text-sm text-muted">
        {deckSize} constat{deckSize > 1 ? 's' : ''} à révéler. Le tableau s’ouvre dans une seconde fenêtre, pour le
        projecteur.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Link to="/classe/fiche" className={SECONDARY_BUTTON}>
          Fiche élève
        </Link>
        <Link to="/classe/corrige" className={SECONDARY_BUTTON}>
          Corrigé
        </Link>
      </div>
      <div className="mt-2 grid gap-2 border-t border-border pt-4">
        <button type="button" onClick={download} className={`${SECONDARY_BUTTON} w-full`}>
          Télécharger la séance
        </button>
        {saved ? (
          <p role="status" className="m-0 rounded-control bg-accentSoft px-4 py-3 text-base leading-relaxed">
            C’est fait. Le fichier « {saved} » est en général dans votre dossier Téléchargements. Copiez-le sur une clé
            USB, ou envoyez-le-vous par e-mail.
          </p>
        ) : (
          <p className="m-0 text-base leading-relaxed text-muted">
            Pour rouvrir la séance sur l’ordinateur de la classe, sans vous connecter : un seul fichier, l’article et
            votre préparation dedans.
          </p>
        )}
        <Link to="/classe/mode-emploi" className={`${QUIET_LINK} justify-self-start text-base`}>
          Le mode d’emploi, à imprimer
        </Link>
      </div>
      <button type="button" onClick={onClose} className={`${QUIET_LINK} mt-2 justify-self-start text-sm`}>
        Fermer cette séance
      </button>
    </section>
  );
}

/* ---------- The lesson: the teacher's desk ---------- */

function Pupitre({ seance, onEnd }: { seance: Seance; onEnd: () => void }) {
  const layout = useMemo(() => layoutOf(seance.blocks, seance.report.findings), [seance]);
  const deck = useMemo(() => deckOf(seance), [seance]);
  const [state, setState] = useState<ClassState>(() => startState(seance));
  const [board, setBoard] = useState<'opening' | 'open' | 'closed' | 'blocked'>('opening');
  const boardWindow = useRef<Window | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const latest = useRef({ seance, state });
  latest.current = { seance, state };

  const press = (key: Key) => setState((current) => step(current, key, deck.length));

  function openBoard() {
    const opened = window.open('/classe/tableau', BOARD_WINDOW, 'popup,width=1280,height=800');
    boardWindow.current = opened;
    setBoard(opened ? 'opening' : 'blocked');
  }

  // The board window: opened on launch, and watched so the desk can say when it is closed.
  useEffect(() => {
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel(CHANNEL);
      ch.onmessage = (event: MessageEvent<Message>) => {
        if (event.data.type === 'hello') {
          setBoard('open');
          ch.postMessage({ type: 'state', ...latest.current } satisfies Message);
        }
        if (event.data.type === 'key') press(event.data.key);
      };
      channel.current = ch;
    }
    openBoard();
    const watch = setInterval(() => {
      if (boardWindow.current?.closed) setBoard('closed');
    }, 1000);
    return () => {
      clearInterval(watch);
      channel.current?.postMessage({ type: 'end' } satisfies Message);
      channel.current?.close();
      channel.current = null;
    };
    // The desk opens the board once, when the lesson starts.
  }, []);

  useEffect(() => {
    channel.current?.postMessage({ type: 'state', seance, state } satisfies Message);
  }, [seance, state]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const key = keyOf(event);
      // Space on a focused button is that button's own click.
      if (!key || (event.key === ' ' && (event.target as HTMLElement).closest('button, input, a'))) return;
      event.preventDefault();
      press(key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const mark = (n: number, change: 'toggle' | 1 | -1) =>
    setState((current) => {
      const marks = { ...current.marks };
      if (change === 'toggle') {
        if (n in marks) delete marks[n];
        else marks[n] = 0;
      } else {
        const hands = Math.max(0, (marks[n] ?? 0) + change);
        if (change === -1 && hands === 0 && !(n in current.marks)) return current;
        marks[n] = hands;
      }
      return { ...current, marks };
    });

  return (
    <div className={`${PAGE} pt-6 pb-12`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PrivateBadge>Vous seul voyez cet écran</PrivateBadge>
        <p className="m-0 text-base text-muted">
          <Kbd>→</Kbd> suivant · <Kbd>←</Kbd> retour · <Kbd>N</Kbd> écran noir
        </p>
      </div>
      <h1 className="sr-only">Le pupitre</h1>

      <BoardStatus status={board} onOpen={openBoard} />

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start">
        <div className="grid min-w-0 gap-5 [&>*]:min-w-0">
          <ol aria-label="Les quatre temps" className="m-0 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-4">
            {PHASES.map(([phase, label], index) => (
              <li key={phase}>
                <button
                  type="button"
                  aria-current={state.phase === phase ? 'step' : undefined}
                  onClick={() =>
                    setState((current) => ({
                      ...current,
                      phase,
                      revealed: phase === 'bilan' ? deck.length : phase === 'revelation' ? current.revealed : 0,
                    }))
                  }
                  className={`grid w-full justify-items-start gap-0.5 rounded-control border px-3 py-2.5 text-left text-base transition-colors duration-160 ease-out ${
                    state.phase === phase ? 'border-accent bg-accentSoft text-foreground' : 'border-border text-muted hover:border-borderControl'
                  }`}
                >
                  <span className="text-sm font-semibold tabular-nums">{index + 1}</span>
                  {label}
                </button>
              </li>
            ))}
          </ol>
          <PhaseControls
            seance={seance}
            layout={layout}
            state={state}
            deck={deck}
            onPress={press}
            onMark={mark}
            onPhase={(phase) => setState((current) => ({ ...current, phase }))}
            onReplay={() => setState(startState(seance))}
          />
        </div>

        <div className="grid gap-3 lg:sticky lg:top-6">
          <p className="m-0 text-base font-medium">Ce que voit la classe</p>
          <div className="board-frame relative aspect-[16/10] w-full overflow-hidden rounded-card border border-border">
            <Board seance={seance} layout={layout} state={state} label="Aperçu du tableau" />
            {/* The board itself shows nothing at all; the teacher is told why. */}
            {state.black ? (
              <p className="absolute inset-0 m-0 grid place-items-center text-base text-muted">
                Écran noir : la classe ne voit rien
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              aria-pressed={state.black}
              onClick={() => press('black')}
              className={SECONDARY_BUTTON}
            >
              {state.black ? 'Rallumer le tableau' : 'Écran noir'}
            </button>
            <button
              type="button"
              aria-pressed={state.showScore}
              onClick={() => setState((current) => ({ ...current, showScore: !current.showScore }))}
              className={SECONDARY_BUTTON}
            >
              {state.showScore ? 'Masquer la note' : 'Afficher la note'}
            </button>
            <button type="button" onClick={onEnd} className={SECONDARY_BUTTON}>
              Terminer la séance
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-md border border-borderControl px-1.5 py-0.5 font-mono text-sm text-foreground">
      {children}
    </kbd>
  );
}

function BoardStatus({ status, onOpen }: { status: 'opening' | 'open' | 'closed' | 'blocked'; onOpen: () => void }) {
  if (status === 'open') {
    return (
      <p className="mt-4 mb-0 max-w-[75ch] text-base leading-relaxed text-muted" role="status">
        Le tableau est ouvert dans une autre fenêtre. Faites-la glisser sur l’écran du projecteur, puis cliquez sur
        « Plein écran » dans cette fenêtre.
      </p>
    );
  }
  return (
    <div
      role="status"
      className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-control border border-warning/60 bg-warningSoft px-4 py-3"
    >
      <p className="m-0 max-w-[65ch] text-base leading-relaxed">
        {status === 'blocked'
          ? 'Le navigateur a bloqué la fenêtre du tableau. Autorisez les fenêtres pour ce site (icône dans la barre d’adresse), ou ouvrez-la avec ce bouton.'
          : status === 'closed'
            ? 'La fenêtre du tableau est fermée.'
            : 'Ouverture du tableau…'}
      </p>
      {status === 'opening' ? null : (
        <button type="button" onClick={onOpen} className={PRIMARY_BUTTON}>
          Ouvrir le tableau
        </button>
      )}
    </div>
  );
}

function PhaseControls({
  seance,
  layout,
  state,
  deck,
  onPress,
  onMark,
  onPhase,
  onReplay,
}: {
  seance: Seance;
  layout: Layout;
  state: ClassState;
  deck: Finding[];
  onPress: (key: Key) => void;
  onMark: (n: number, change: 'toggle' | 1 | -1) => void;
  onPhase: (phase: ClassState['phase']) => void;
  onReplay: () => void;
}) {
  const card = 'grid gap-4 rounded-card border border-border bg-surface p-5';

  if (state.phase === 'lecture') {
    return (
      <div className={card}>
        <p className="m-0 font-display text-2xl leading-snug font-semibold">Le tableau montre l’article, sans aucune marque.</p>
        <p className="m-0 text-lg leading-relaxed text-muted">
          Laissez lire, fiche papier en main. Puis demandez à la classe quelles phrases elle a soulignées.
        </p>
        <button type="button" onClick={() => onPress('next')} className={`${PRIMARY_BUTTON} justify-self-start`}>
          Passer au repérage →
        </button>
      </div>
    );
  }

  if (state.phase === 'reperage') {
    return (
      <div className="grid min-w-0 gap-4">
        <p className="m-0 text-lg leading-relaxed text-muted">
          Cliquez sur une phrase quand la classe la propose. « Qui a souligné la phrase 4 ? » : comptez les mains avec + et
          −, ou laissez sans nombre.
        </p>
        <ol aria-label="Les phrases de l’article" className="m-0 grid max-h-[60vh] min-w-0 list-none gap-2 overflow-y-auto p-0 pr-1">
          {layout.sentences.map(({ n, text }) => {
            const proposed = n in state.marks;
            const hands = state.marks[n] ?? 0;
            return (
              <li
                key={n}
                className={`flex min-w-0 items-center gap-2 rounded-control border p-1.5 pl-2 transition-colors duration-160 ease-out ${
                  proposed ? 'border-accent bg-accentSoft' : 'border-border'
                }`}
              >
                <button
                  type="button"
                  aria-pressed={proposed}
                  onClick={() => onMark(n, 'toggle')}
                  className="flex min-h-11 min-w-0 grow items-center gap-3 text-left"
                >
                  {/* Proposed, the number is filled: a change of shape, not of hue alone. */}
                  <span
                    className={`inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full px-1.5 font-bold tabular-nums ${
                      proposed ? 'bg-accent text-accentForeground' : 'text-muted'
                    }`}
                  >
                    {n}
                  </span>
                  <span className="line-clamp-2 min-w-0 text-base leading-snug">{text}</span>
                </button>
                <span className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => onMark(n, -1)} aria-label={`Une main de moins, phrase ${n}`} className={ICON_BUTTON}>
                    −
                  </button>
                  <span className="w-7 text-center font-semibold tabular-nums" aria-label={`${hands} main${hands > 1 ? 's' : ''}`}>
                    {proposed && hands ? hands : '·'}
                  </span>
                  <button type="button" onClick={() => onMark(n, 1)} aria-label={`Une main de plus, phrase ${n}`} className={ICON_BUTTON}>
                    +
                  </button>
                </span>
              </li>
            );
          })}
        </ol>
        <button type="button" onClick={() => onPress('next')} className={`${PRIMARY_BUTTON} justify-self-start`}>
          Révéler l’analyse →
        </button>
      </div>
    );
  }

  if (state.phase === 'revelation') {
    const next = deck[state.revealed];
    const n = next ? layout.sentenceOf.get(next.id) : undefined;
    const seen = n !== undefined && n > 0 && n in state.marks;
    return (
      <div className="grid gap-4">
        <div
          role="progressbar"
          aria-label="Constats révélés"
          aria-valuemin={0}
          aria-valuemax={deck.length}
          aria-valuenow={state.revealed}
          className="h-1.5 overflow-hidden rounded-full bg-border"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-200 ease-out motion-reduce:transition-none"
            style={{ width: `${deck.length ? (state.revealed / deck.length) * 100 : 100}%` }}
          />
        </div>
        {next ? (
          <div className="grid gap-2 rounded-card border border-dashed border-accent bg-surface p-5" style={tone(passageTone(next))}>
            <p className="m-0 text-base font-semibold text-accentInk">Prochain · vous seul le voyez</p>
            <p className="m-0 font-display text-2xl leading-snug font-semibold">{next.label}</p>
            <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-base text-muted">
              <span className="flex items-center gap-1.5 text-(--sev-text)">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-(--sev-color)" />
                {categoryOf(next)}
              </span>
              <span>{placeOf(layout, next) ?? 'passage introuvable dans le texte'}</span>
              {n ? <span>{seen ? 'la classe l’avait vu' : 'la classe ne l’avait pas vu'}</span> : null}
            </p>
            <p className="m-0 font-serif text-lg italic leading-relaxed">« {next.quote} »</p>
            <p className="m-0 text-base leading-relaxed">{next.explanation}</p>
            <p className="m-0 text-base leading-relaxed text-accentInk">
              <span className="text-muted">À poser : </span>
              {questionFor(next)}
            </p>
          </div>
        ) : (
          <div className="grid gap-2 rounded-card border border-dashed border-accent bg-surface p-5">
            <p className="m-0 text-base font-semibold text-accentInk">Tout est révélé</p>
            <p className="m-0 text-base text-muted">Passez au bilan pour comparer avec ce que la classe avait vu.</p>
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => onPress('next')} className={PRIMARY_BUTTON}>
            {next ? 'Révéler →' : 'Voir le bilan →'}
          </button>
          <button type="button" onClick={() => onPress('prev')} className={SECONDARY_BUTTON}>
            ← Revenir
          </button>
        </div>
        <ol aria-label="Les constats de la séance" className="m-0 grid list-none gap-1 p-0">
          {deck.map((finding, index) => (
            <li key={finding.id} className="flex items-center gap-3 py-1 text-base" style={tone(passageTone(finding))}>
              <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-(--sev-color)" />
              <span className="min-w-0 grow">
                {index + 1}. {finding.label}
              </span>
              <span
                className={`shrink-0 rounded-full border px-2.5 text-sm ${
                  index < state.revealed
                    ? 'border-accent text-accentInk'
                    : index === state.revealed
                      ? 'border-dashed border-accent text-foreground'
                      : 'border-border text-muted'
                }`}
              >
                {index < state.revealed ? 'au tableau' : index === state.revealed ? 'prochain' : 'à venir'}
              </span>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  const { weak, found, extra } = tally(seance, layout, state);
  return (
    <div className={card}>
      <p className="m-0 font-display text-2xl leading-snug font-semibold">
        La classe a repéré {found} passage{found > 1 ? 's' : ''} fragile{found > 1 ? 's' : ''} sur {weak}.
      </p>
      <p className="m-0 text-lg leading-relaxed text-muted">
        {extra
          ? `${extra} phrase${extra > 1 ? 's' : ''} soulignée${extra > 1 ? 's' : ''} sans constat : un bon départ de débat.`
          : 'Aucune phrase soulignée en trop.'}{' '}
        Le tableau montre le bilan.
      </p>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => onPhase('revelation')} className={SECONDARY_BUTTON}>
          ← Revenir aux constats
        </button>
        <button type="button" onClick={onReplay} className={SECONDARY_BUTTON}>
          Rejouer depuis le début
        </button>
      </div>
    </div>
  );
}
