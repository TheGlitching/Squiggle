/**
 * The site's own analysis: paste an article, read the report over it.
 *
 * It runs in hosted mode on the reader's account, so it spends the same trial
 * and subscription as the extension, and nothing here judges the text: the
 * stages, the prompts and the score are the server's (`shared/`). A visitor
 * without an account runs one analysis in all the same way, and is shown its
 * first finding with the others kept back by the server; an account opens the
 * whole report: back from that sign-in, it is served from the shared cache, at
 * no cost. The paste is kept in this browser
 * until the reader clears it, so signing in halfway loses nothing. "Partager vers Squiggle" (the installed app's share target)
 * lands here with the shared text or address in the query string, which is
 * read once and wiped from the address bar. Where the share menu does not
 * list the app, "Coller le texte copié" reads the clipboard and starts the
 * analysis in the same tap, and "Ajouter la suite" adds a further passage to
 * it, for an app that only lets a reader copy one screen at a time. A link
 * received alone opens in the phone's browser rather than the publisher's app,
 * where the bookmark "Analyser avec Squiggle" (`/favori`) takes the page
 * and brings it back here in the address's fragment, where the article is read out of it (`favori/article.ts`), which is read once and
 * wiped like a share; it is then analysed at once, as a copied text is. A
 * video's transcript pasted here is analysed
 * without its timestamps, which come back beside each passage in the report
 * (`transcript.ts`). Where nothing can be copied, the reader imports
 * screenshots, or shares them to the installed app: their text is read on the
 * device and lands in the form to be checked before anything is analysed
 * (`captures.ts`).
 */
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent, type FormEvent } from 'react';

import { screenshotsCounter, type AudienceMetricName } from '@squiggle/shared/src/hosted/audience';

import type { AnalysisReport, TextBlock } from '../../../shared/src/engine/types';
import { youtubeVideoId } from '../../../shared/src/engine/video';
import {
  analysisFailure,
  analyzePasted,
  cachedReport,
  reportByLink,
  type AnalysisFailure,
  type Progress,
} from '../analysis';
import { getAccount, type Account } from '../api';
import { MAX_CAPTURES, readCaptures, takeSharedCaptures } from '../captures';
import { count } from '../count';
import { Abonnement } from '../components/Abonnement';
import { RunScene, type RunStep } from '../components/Iso';
import { FIELD, PAGE, PRIMARY_BUTTON, QUIET_LINK, SECONDARY_BUTTON, TITLE } from '../components/Landing';
import { Rapport } from '../components/Rapport';
import { useInstall } from '../install';
import { FREE_ANALYSES, OFFER_LINE } from '../offer';
import {
  appendPaste,
  articleFromShare,
  EMPTY_ARTICLE,
  loadDraft,
  MAX_TITLE_CHARS,
  MIN_TEXT_CHARS,
  PASTE_PROBLEMS,
  pastedChars,
  pasteProblem,
  readCopied,
  saveDraft,
  sharedParams,
  textFromHtml,
  type PastedArticle,
  webAddress,
} from '../paste';
import { carriesPage, readFavori } from '../favori/article';
import { APP_VALUE, FAVORI_PARAM, FAVORI_VALUE, SHORTCUT_VALUE } from '../favori/payload';
import { browserLink, currentPhoneOs, type PhoneOs } from '../phone';
import { newSeance, saveSeance } from '../classe';
import { Link, navigate } from '../router';
import { readTranscript, type Start } from '../transcript';
import { describeAccount, type AccountView } from '../usage';

const SIGN_IN = '/connexion?next=/analyser';
/** The sign-in a visitor's report offers; the server counts an account opened through it. */
const SIGN_UP_AFTER_VISIT = `/connexion?next=${encodeURIComponent('/analyser?apres=essai')}`;
/** The same, from a report with findings kept back, counted apart. */
const SIGN_UP_AFTER_WITHHELD = `/connexion?next=${encodeURIComponent('/analyser?apres=flou')}`;

type Phase =
  | { kind: 'edit' }
  | { kind: 'running'; progress: Progress }
  /** `visitor`: run without an account, so the page offers one to keep the report. */
  | {
      kind: 'done';
      report: AnalysisReport;
      blocks: TextBlock[];
      times: Record<string, Start[]> | null;
      visitor: boolean;
      /** Found by this link alone: the report of a reader who used the extension, without the text. */
      link?: string;
    };

/** Back from the sign-in a visitor's report offered. Read before the address bar is wiped. */
function backFromVisit(): boolean {
  if (typeof window === 'undefined') return false;
  const after = new URLSearchParams(window.location.search).get('apres');
  return after === 'essai' || after === 'flou';
}

const ADDRESS_ONLY = 'Adresse reçue. Collez maintenant le texte de l’article : Squiggle ne va pas le chercher.';
const LOOKING_UP = 'Adresse reçue. Recherche d’un rapport déjà fait pour ce lien…';

/** What to do with a link nobody has analysed with the extension yet, in one sentence. */
function noReportFor(link: string): string {
  // A phone's YouTube app shows the transcript but does not let it be copied: the next step is a computer.
  if (youtubeVideoId(link) && currentPhoneOs())
    return 'Cette vidéo n’a pas encore de rapport, et Squiggle ne lit pas encore les vidéos sur téléphone. Envoyez-vous ce lien par e-mail, puis ouvrez-le sur un ordinateur avec l’extension Squiggle : elle lit les sous-titres de la vidéo.';
  return youtubeVideoId(link)
    ? 'Cette vidéo n’a pas encore de rapport : collez ici sa transcription (« Afficher la transcription », sous la description), ou ouvrez-la avec l’extension Squiggle.'
    : 'Cet article n’a pas encore de rapport. Collez maintenant le texte de l’article : Squiggle ne va pas le chercher.';
}

/** Where the publisher's link sends the reader, named in the button. */
function publisherAction(link: string): string {
  if (youtubeVideoId(link)) return 'Regarder la vidéo sur YouTube';
  try {
    // The site, not the edition the link came from: m.lemonde.fr is lemonde.fr.
    return `Lire l’article sur ${new URL(link).hostname.replace(/^(?:www|m|mobile|amp)\.(?=.+\.)/, '')}`;
  } catch {
    return 'Lire l’article chez l’éditeur';
  }
}
/** Checkout started from this page comes back here; the query is read once, as a share is. */
const PAYMENT_NOTICES: Record<string, string> = {
  ok: 'Merci ! Votre abonnement s’active : vous pouvez lancer votre analyse.',
  annule: 'Le paiement a été annulé. Votre texte est toujours là.',
};

function paymentNotice(): string | null {
  if (typeof window === 'undefined') return null;
  return PAYMENT_NOTICES[new URLSearchParams(window.location.search).get('paiement') ?? ''] ?? null;
}

const MANUAL_PASTE = 'Ce navigateur ne laisse pas lire le presse-papiers : appuyez longuement dans le champ, puis Coller.';
const MANUAL_APPEND =
  'Ce navigateur ne laisse pas lire le presse-papiers : appuyez longuement à la fin du texte, puis Coller.';
/** The clipboard read as empty. On a phone the system can hide a copy from the page, so the field's paste comes first. */
const NOTHING_READ =
  'Squiggle ne trouve pas de texte copié. Si vous venez de copier l’article, appuyez longuement dans le champ, puis Coller. Sinon, copiez d’abord son texte.';
const NOTHING_TO_APPEND =
  'Squiggle ne trouve pas de texte copié. Si vous venez de copier la suite, appuyez longuement à la fin du texte, puis Coller. Sinon, copiez d’abord le passage suivant.';

/** Screenshots shared to the installed app wait in its cache; the worker says how many in the query. */
function sharedCaptures(): number {
  if (typeof window === 'undefined') return 0;
  return Number(new URLSearchParams(window.location.search).get('captures')) || 0;
}

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? 's' : ''}`;

const CAPTURES_READ = (count: number) =>
  `Texte lu sur ${plural(count, 'capture')}, sur cet appareil : aucune image n’a été envoyée. Relisez-le avant de lancer l’analyse : une ligne peut être mal lue, et un reste de menu ou de publicité s’efface ici.`;
const CAPTURES_EMPTY = 'Aucun texte n’a été lu sur ces images. Importez des captures d’écran de l’article lui-même.';
const CAPTURES_FAILED =
  'La lecture des captures n’a pas pu démarrer. Vérifiez la connexion : le lecteur de texte se télécharge la première fois.';
const FAVORI_UNREAD = 'Squiggle n’a pas trouvé d’article dans la page que le favori a apportée. Copiez le texte, puis collez-le ici.';
const CAPTURES_LOST = 'Les captures partagées n’ont pas été retrouvées. Importez-les ici.';
const TOO_MANY_CAPTURES = `${MAX_CAPTURES} captures au plus à la fois : un article tient d’ordinaire en moins de dix.`;

/** Where a reading of screenshots stands: `done` is null while the reader itself loads. */
type Reading = { done: number | null; total: number };

/** A text shared without a link and too short for an article: a forwarded message, which Squiggle does not analyse yet. */
const SHORT_MESSAGE = `Ce message est trop court pour être analysé : Squiggle analyse des articles, de ${MIN_TEXT_CHARS} caractères au moins. S’il cite un article, partagez plutôt l’article vers Squiggle.`;

/** The entries that bring a whole text and start its analysis without a tap, by their `via`, with their counter. */
const AUTO_ENTRIES = new Map<string | null, AudienceMetricName>([
  [FAVORI_VALUE, 'entry_bookmarklet'],
  [SHORTCUT_VALUE, 'entry_shortcut'],
  [APP_VALUE, 'entry_app_text'],
]);

/** The bookmark's analysis, from the moment the page opens. */
const AUTO_START: Progress = { message: 'Analyse lancée automatiquement…', percent: 2 };

/**
 * The draft, with whatever a share or the bookmark just brought on top of it.
 * The bookmark brings a page, whose article is read once the page has opened: `page` until then.
 */
function initialArticle(): {
  article: PastedArticle;
  shared: Partial<PastedArticle> | null;
  favori: boolean;
  /** The counter of the entry the page opened with, if it is one that is counted. */
  entry?: AudienceMetricName;
  page?: URLSearchParams;
} {
  const draft = loadDraft();
  if (typeof window === 'undefined') return { article: draft, shared: null, favori: false };
  const params = sharedParams(window.location);
  if (carriesPage(params)) return { article: EMPTY_ARTICLE, shared: null, favori: true, entry: 'entry_bookmarklet', page: params };
  const shared = articleFromShare(params);
  if (!shared) return { article: draft, shared: null, favori: false };
  // A shared text replaces the draft; a shared address alone keeps the draft's text,
  // unless that text is another article's, as it is after a report.
  const otherArticle = Boolean(shared.source && draft.source && shared.source !== draft.source);
  const article =
    shared.text || otherArticle
      ? { ...EMPTY_ARTICLE, ...shared }
      : { ...draft, title: shared.title || draft.title, source: shared.source || draft.source };
  if (shared.text && !shared.source && pasteProblem(article as PastedArticle) === 'too_short') {
    return { article: article as PastedArticle, shared, favori: false, entry: 'entry_short_message' };
  }
  const entry = shared.text ? AUTO_ENTRIES.get(params.get(FAVORI_PARAM)) : undefined;
  return { article: article as PastedArticle, shared, favori: Boolean(entry), entry };
}

/**
 * The Android app opens a share on /analyser#text=… in the app's tab, which
 * may already show this page: then only the fragment changes. The page starts
 * over, and reads it as it reads any share.
 */
export function Analyser() {
  const [visit, setVisit] = useState(0);
  useEffect(() => {
    const reread = () => {
      const params = sharedParams(window.location);
      if (carriesPage(params) || articleFromShare(params)) setVisit((n) => n + 1);
    };
    window.addEventListener('hashchange', reread);
    return () => window.removeEventListener('hashchange', reread);
  }, []);
  return <AnalyserPage key={visit} />;
}

function AnalyserPage() {
  const [{ article: start, shared, favori, entry, page }] = useState(initialArticle);
  /** The bookmark's article is analysed as soon as it is read and the account says it can be. */
  const [autoRun, setAutoRun] = useState(favori && !page);
  /** Cleared by a cancel that comes while the bookmark's page is still being read. */
  const readingPage = useRef(Boolean(page));
  /** The run on screen is the bookmark's, which the reader never asked for with a tap. */
  const [autoStarted, setAutoStarted] = useState(favori);
  const [sharedCount] = useState(sharedCaptures);
  const [returning] = useState(backFromVisit);
  const [article, setArticle] = useState<PastedArticle>(start);
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  // The bookmark's analysis shows as started from the first frame, while the
  // account is still being checked: nothing on screen asks for a tap.
  const [phase, setPhase] = useState<Phase>(() =>
    favori && (page || !pasteProblem(start)) ? { kind: 'running', progress: AUTO_START } : { kind: 'edit' },
  );
  const [failure, setFailure] = useState<AnalysisFailure | null>(null);
  // A link shared alone is looked up first: someone may already have analysed it with the extension.
  const [notice, setNotice] = useState<string | null>(() =>
    // Shared screenshots bring their own text.
    entry === 'entry_short_message'
      ? SHORT_MESSAGE
      : shared && !shared.text && !sharedCount
        ? shared.source
          ? LOOKING_UP
          : ADDRESS_ONLY
        : paymentNotice(),
  );
  const [showProblem, setShowProblem] = useState(false);
  const [reading, setReading] = useState<Reading | null>(null);
  const controller = useRef<AbortController | null>(null);
  const textArea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const reportTop = useRef<HTMLHeadingElement>(null);

  // The shared text is in the form now; it does not stay in the address bar or the history.
  useEffect(() => {
    if (window.location.search || window.location.hash) window.history.replaceState(window.history.state, '', '/analyser');
    if (entry) count(entry);
    // Once, as the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => saveDraft(article), [article]);

  // Once, for the page the bookmark brought.
  useEffect(() => {
    if (!page) return;
    readFavori(page).then(
      (read) => {
        if (!readingPage.current) return;
        readingPage.current = false;
        setArticle({ title: read.title, source: read.url, text: read.text });
        if (read.text) return void setAutoRun(true);
        setPhase({ kind: 'edit' });
        setNotice(FAVORI_UNREAD);
      },
      () => {
        if (!readingPage.current) return;
        readingPage.current = false;
        setPhase({ kind: 'edit' });
        setNotice(FAVORI_UNREAD);
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A page left mid-run stops driving it: opened again, the same text joins the run on the server.
  useEffect(() => () => controller.current?.abort(), []);

  // Once, for the link a share brought without its text.
  useEffect(() => {
    if (shared && !shared.text && shared.source && !sharedCount) void findByLink(shared.source);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Screenshots shared to the installed app: read at once, as imported ones are.
  useEffect(() => {
    if (!sharedCount) return;
    takeSharedCaptures().then((images) => {
      if (images.length) void importCaptures(images, 'share_screenshots');
      else setNotice(CAPTURES_LOST);
    });
    // Once, for the share the page opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // An account that cannot be checked leaves the visitor's analysis, which
  // needs none: the page never ends on a retry with nothing else to do.
  useEffect(() => {
    getAccount()
      .then(setAccount)
      .catch(() => setAccount(null));
  }, []);

  // Back from the sign-in a visitor's report offered: the report is in the
  // shared cache, so it is shown again, whole, without a model call or a credit.
  const signedIn = Boolean(account);
  useEffect(() => {
    if (!returning || !signedIn || pasteProblem(article)) return;
    let live = true;
    cachedReport(article).then(
      (hit) => {
        if (live && hit) setPhase((current) => (current.kind === 'edit' ? { kind: 'done', ...hit, visitor: false } : current));
      },
      () => {},
    );
    return () => {
      live = false;
    };
    // Once, with the paste the reader came back with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returning, signedIn]);

  useEffect(() => {
    if (!autoRun || account === undefined) return;
    setAutoRun(false);
    if (pasteProblem(article)) setShowProblem(true);
    else if (account === null || describeAccount(account).canAnalyse) return void run(article, AUTO_START);
    setPhase({ kind: 'edit' });
    // Once, when the account is known, with the article the bookmark brought.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, account]);

  useEffect(() => {
    if (phase.kind === 'done') reportTop.current?.focus();
  }, [phase.kind]);

  const problem = pasteProblem(article);
  const view = account ? describeAccount(account) : null;
  const running = phase.kind === 'running';
  const chars = pastedChars(article.text);
  const transcript = useMemo(() => readTranscript(article.text), [article.text]);

  /**
   * The report a reader using the extension already made for this link. Only
   * the link is sent, and nothing fetches the page: a miss says, in one
   * sentence, how to have it analysed.
   */
  async function findByLink(link: string) {
    setNotice(LOOKING_UP);
    const found = await reportByLink(link);
    if (!found) {
      setNotice((current) => (current === LOOKING_UP ? noReportFor(link) : current));
      return;
    }
    setNotice(null);
    setPhase((current) =>
      current.kind === 'edit'
        ? { kind: 'done', report: found.report, blocks: [], times: null, visitor: false, link }
        : current,
    );
  }

  function edit<K extends keyof PastedArticle>(key: K, value: PastedArticle[K]) {
    setArticle((current) => ({ ...current, [key]: value }));
    setFailure(null);
    if (key === 'text') setNotice(null);
  }

  /** A copy that is only markup pastes as nothing in a textarea: insert its text instead. */
  function pasteMarkup(event: ClipboardEvent<HTMLTextAreaElement>) {
    const data = event.clipboardData;
    if (!data || data.getData('text/plain').trim()) return;
    const text = textFromHtml(data.getData('text/html'));
    if (!text) return;
    event.preventDefault();
    const field = event.currentTarget;
    edit('text', field.value.slice(0, field.selectionStart) + text + field.value.slice(field.selectionEnd));
  }

  function analyse(event: FormEvent) {
    event.preventDefault();
    if (reading) return;
    if (problem) {
      setShowProblem(true);
      textArea.current?.focus();
      return;
    }
    void run(article);
  }

  /**
   * Copy in the article's page, open Squiggle, one tap: the copied text is read,
   * put in the form, and analysed when the account allows it. A copied address
   * alone goes to the source field, as a shared one does. Anything that stops the
   * analysis leaves the text in the form with the same next step as a paste.
   */
  async function pasteCopied() {
    const copied = await readCopied(navigator.clipboard);
    if (copied.kind !== 'text') {
      // The field's own paste reaches what the button may not: hand over to it.
      setNotice(copied.kind === 'empty' ? NOTHING_READ : MANUAL_PASTE);
      textArea.current?.focus();
      return;
    }
    const { text } = copied;
    setFailure(null);
    const address = /^https?:\/\/\S+$/i.test(text) ? webAddress(text) : null;
    if (address) {
      setArticle({ ...article, source: address });
      textArea.current?.focus();
      await findByLink(address);
      return;
    }
    // The button only shows on an empty text, so a title or a shared address already there stays.
    const next = { ...article, text };
    setArticle(next);
    setNotice(null);
    if (pasteProblem(next)) {
      setShowProblem(true);
      return;
    }
    if (account === null || view?.canAnalyse) await run(next);
  }

  /** "Ajouter la suite": the next passage copied in the article goes after the text, without what it repeats. */
  async function appendCopied() {
    const copied = await readCopied(navigator.clipboard);
    if (copied.kind !== 'text') {
      setNotice(copied.kind === 'empty' ? NOTHING_TO_APPEND : MANUAL_APPEND);
      textArea.current?.focus();
      return;
    }
    const text = appendPaste(article.text, copied.text);
    const added = text.length - article.text.length;
    setFailure(null);
    setArticle({ ...article, text });
    setNotice(
      text === article.text || added <= 0
        ? 'Ce passage est déjà dans le texte : copiez le suivant.'
        : `Suite ajoutée : ${added.toLocaleString('fr-FR')} caractères de plus.`,
    );
  }

  /**
   * Screenshots, read on this device, into the text field: the reader checks
   * the text there and starts the analysis. Nothing leaves the device here.
   */
  async function importCaptures(files: readonly Blob[], via: 'import_screenshots' | 'share_screenshots') {
    const images = files.filter((file) => file.type.startsWith('image/'));
    setFailure(null);
    setShowProblem(false);
    if (!images.length) return setNotice(CAPTURES_EMPTY);
    if (images.length > MAX_CAPTURES) return setNotice(TOO_MANY_CAPTURES);
    setNotice(null);
    const abort = new AbortController();
    controller.current = abort;
    setReading({ done: null, total: images.length });
    try {
      const text = await readCaptures(images, (done, total) => setReading({ done, total }), abort.signal);
      count(via);
      count(screenshotsCounter(images.length));
      if (!text.trim()) return setNotice(CAPTURES_EMPTY);
      setArticle((current) => ({ ...current, text }));
      setNotice(CAPTURES_READ(images.length));
      textArea.current?.focus();
    } catch {
      setNotice(abort.signal.aborted ? 'Lecture annulée.' : CAPTURES_FAILED);
    } finally {
      controller.current = null;
      setReading(null);
    }
  }

  function pickCaptures(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    // The same screenshots picked again are a new choice.
    event.target.value = '';
    if (files.length) void importCaptures(files, 'import_screenshots');
  }

  async function run(article: PastedArticle, progress: Progress = { message: 'Préparation de l’analyse…', percent: 2 }) {
    // One analysis per page: a second start would only race the first.
    if (controller.current) return;
    setFailure(null);
    setNotice(null);
    const abort = new AbortController();
    controller.current = abort;
    if (readTranscript(article.text)) count('paste_transcript');
    setAutoStarted(progress === AUTO_START);
    setPhase({ kind: 'running', progress });
    const visitor = account === null;
    try {
      const { report, blocks, times } = await analyzePasted(
        article,
        (progress) =>
          setPhase((current) =>
            current.kind === 'running'
              ? {
                  kind: 'running',
                  progress: { ...progress, percent: Math.max(current.progress.percent, progress.percent) },
                }
              : current,
          ),
        abort.signal,
        visitor,
      );
      setPhase({ kind: 'done', report, blocks, times, visitor });
      window.scrollTo?.({ top: 0 });
    } catch (err) {
      setPhase({ kind: 'edit' });
      if (abort.signal.aborted) {
        setNotice('Analyse annulée. Votre texte est toujours là.');
        return;
      }
      const outcome = analysisFailure(err);
      if (outcome.kind === 'signin') setAccount(null);
      setFailure(outcome);
    } finally {
      controller.current = null;
      getAccount()
        .then(setAccount)
        .catch(() => {});
    }
  }

  /** The run in flight, or the bookmark's, still waiting on the account. */
  function cancel() {
    if (controller.current) return controller.current.abort();
    readingPage.current = false;
    setAutoRun(false);
    setPhase({ kind: 'edit' });
    setNotice('Analyse annulée. Votre texte est toujours là.');
  }

  function startOver() {
    setArticle(EMPTY_ARTICLE);
    setPhase({ kind: 'edit' });
    setShowProblem(false);
  }

  if (phase.kind === 'done' && phase.link) {
    return (
      <div className={`${PAGE} py-8 sm:py-14`}>
        <h1 ref={reportTop} tabIndex={-1} className={`${TITLE} outline-hidden focus-visible:ring-0`}>
          {article.title.trim() || 'Rapport d’analyse'}
        </h1>
        {/* The publisher first: this report points to the page, it never stands in for reading it. */}
        <div className="mt-5 mb-10 grid max-w-2xl gap-3 rounded-card border border-border bg-surface p-5 sm:p-6">
          <a href={phase.link} target="_blank" rel="noopener noreferrer" className={`${PRIMARY_BUTTON} max-sm:w-full`}>
            {publisherAction(phase.link)}
          </a>
          <p className="m-0 text-sm text-muted">
            {youtubeVideoId(phase.link)
              ? 'Un lecteur l’a analysée avec l’extension Squiggle, à partir de ses sous-titres. Le rapport n’en garde que de courtes citations : la vidéo est sur YouTube.'
              : 'Un lecteur l’a analysé avec l’extension Squiggle, sur la page même. Le rapport n’en garde que de courtes citations : l’article complet est chez l’éditeur.'}
          </p>
        </div>
        <Rapport report={phase.report} blocks={[]} byLink />
        <p className="mt-10 mb-0">
          <button type="button" onClick={startOver} className={QUIET_LINK}>
            Analyser un autre article
          </button>
        </p>
      </div>
    );
  }

  if (phase.kind === 'done') {
    return (
      <div className={`${PAGE} py-8 sm:py-14`}>
        <h1 ref={reportTop} tabIndex={-1} className={`${TITLE} outline-hidden focus-visible:ring-0`}>
          {article.title.trim() || 'Rapport d’analyse'}
        </h1>
        <div className="mt-3 mb-10 flex flex-wrap items-center gap-x-6 gap-y-1">
          <button type="button" onClick={() => setPhase({ kind: 'edit' })} className={QUIET_LINK}>
            Modifier le texte
          </button>
          <button type="button" onClick={startOver} className={QUIET_LINK}>
            Analyser un autre article
          </button>
          {/* A session is prepared from the whole report, which a visitor's is not. */}
          {phase.report.withheld?.length ? null : (
            <button
              type="button"
              onClick={() => {
                const { report, blocks } = phase;
                saveSeance(newSeance({ title: article.title, source: article.source, blocks, report }));
                navigate('/classe');
              }}
              className={QUIET_LINK}
            >
              Préparer pour la classe
            </button>
          )}
        </div>
        <Rapport report={phase.report} blocks={phase.blocks} times={phase.times} signUp={SIGN_UP_AFTER_WITHHELD} />
        {phase.visitor ? <KeepReport withheld={Boolean(phase.report.withheld?.length)} /> : null}
        {account && view ? (
          view.needsSubscription ? (
            <div className="mt-12">
              <Offre account={account} view={view} />
            </div>
          ) : (
            <p className="mt-12 mb-0 border-t border-lineSoft pt-6 text-base text-muted">{view.detail}</p>
          )
        ) : null}
      </div>
    );
  }

  return (
    <div className={`${PAGE} pt-8 sm:py-14`}>
      <h1 className={TITLE}>Analyser un article</h1>
      <p className="mt-3 mb-0 max-w-[55ch] text-lg leading-relaxed text-muted">
        Collez le texte. Le rapport arrive en une à deux minutes.
      </p>

      {phase.kind === 'running' ? <Stages stage={phase.progress.stage} /> : null}

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-16">
        <form onSubmit={analyse} noValidate>
          {/* Not disabled while screenshots are read: the reading's own Annuler is inside. */}
          <fieldset disabled={running} className="m-0 grid gap-6 border-0 p-0">
            <div>
              <div className="flex items-baseline justify-between gap-4">
                <label htmlFor="texte" className="text-base font-medium">
                  Texte de l’article
                </label>
                {!running && !reading && (article.text || article.title || article.source) ? (
                  <div className="-my-2 -mr-2 flex gap-2">
                    {article.text ? (
                      <button type="button" onClick={appendCopied} className={TEXT_BUTTON}>
                        Ajouter la suite
                      </button>
                    ) : null}
                    <button type="button" onClick={startOver} className={TEXT_BUTTON}>
                      Effacer
                    </button>
                  </div>
                ) : null}
              </div>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={pickCaptures}
                data-testid="captures"
              />
              {reading ? (
                <ReadingPanel reading={reading} onCancel={() => controller.current?.abort()} />
              ) : !running && !article.text ? (
                <div className="mt-3">
                  <div className="flex flex-wrap gap-3">
                    <button type="button" onClick={pasteCopied} className={`${PRIMARY_BUTTON} w-full sm:w-auto`}>
                      Coller le texte copié
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInput.current?.click()}
                      className={`${SECONDARY_BUTTON} w-full sm:w-auto`}
                    >
                      Importer des captures
                    </button>
                  </div>
                  <p className="mt-2 mb-0 text-sm text-muted">
                    Une appli qui empêche de copier ? Faites des captures d’écran en descendant dans l’article, en
                    gardant quelques lignes d’une capture à l’autre, puis importez-les : leur texte est lu sur cet
                    appareil, aucune image n’est envoyée.
                  </p>
                </div>
              ) : null}
              {notice ? (
                <p
                  role="status"
                  className="mt-2 mb-0 rounded-control border border-border bg-accentSoft px-4 py-3 text-sm"
                >
                  {notice}
                </p>
              ) : null}
              {!running && !article.text && webAddress(article.source) ? (
                <OpenInBrowser address={webAddress(article.source)!} />
              ) : null}
              <textarea
                id="texte"
                ref={textArea}
                value={article.text}
                onChange={(event) => edit('text', event.target.value)}
                onPaste={pasteMarkup}
                readOnly={reading !== null}
                rows={12}
                spellCheck={false}
                aria-describedby="texte-aide"
                aria-invalid={
                  showProblem && problem !== null && problem !== 'bad_source' && problem !== 'title_too_long'
                }
                placeholder="Le texte de l’article, du chapô à la dernière phrase."
                className={`${FIELD} min-h-64 resize-y leading-relaxed`}
              />
              <p
                id="texte-aide"
                className={`mt-2 mb-0 text-sm ${showProblem && problem === 'too_short' ? 'text-warningInk' : 'text-muted'}`}
              >
                {chars === 0
                  ? 'Sélectionnez le texte dans la page de l’article, copiez-le, puis collez-le ici.'
                  : chars < MIN_TEXT_CHARS
                    ? `${chars} caractères : il en faut au moins ${MIN_TEXT_CHARS}.`
                    : `${chars.toLocaleString('fr-FR')} caractères.`}
                {transcript
                  ? ' Transcription reconnue : les horodatages sont retirés du texte analysé, et chaque passage garde le sien dans le rapport.'
                  : null}
              </p>
              {chars === 0 ? (
                <p className="mt-1 mb-0 text-sm text-muted">
                  Une vidéo YouTube ? Copiez sa transcription (« Afficher la transcription », sous la description)
                  et collez-la ici. Dans l’appli, où elle ne se copie pas, faites-en des captures.
                </p>
              ) : null}
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <label htmlFor="titre" className="text-base font-medium">
                  Titre <span className="font-normal text-muted">(facultatif)</span>
                </label>
                <input
                  id="titre"
                  value={article.title}
                  onChange={(event) => edit('title', event.target.value)}
                  maxLength={MAX_TITLE_CHARS}
                  autoComplete="off"
                  className={FIELD}
                />
              </div>
              <div>
                <label htmlFor="source" className="text-base font-medium">
                  Adresse de l’article <span className="font-normal text-muted">(facultatif)</span>
                </label>
                <input
                  id="source"
                  type="url"
                  inputMode="url"
                  value={article.source}
                  onChange={(event) => edit('source', event.target.value)}
                  placeholder="https://"
                  autoComplete="off"
                  aria-describedby="source-aide"
                  aria-invalid={showProblem && problem === 'bad_source'}
                  className={FIELD}
                />
                <p id="source-aide" className="mt-2 mb-0 text-sm text-muted">
                  Elle accompagne le rapport. Squiggle ne visite jamais cette page.
                </p>
              </div>
            </div>
          </fieldset>

          {/* On a phone the button stays in reach as the text scrolls; the subscription box is too tall to pin. */}
          <div
            className={
              view?.needsSubscription
                ? 'mt-6'
                : 'sticky bottom-[var(--install-hint-height,0px)] z-10 -mx-4 mt-6 border-t border-border bg-background px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0'
            }
          >
            {showProblem && problem ? (
              <p role="alert" className="mt-0 mb-3 text-sm text-warningInk">
                {PASTE_PROBLEMS[problem]}
              </p>
            ) : null}
            {failure ? <FailureNotice failure={failure} /> : null}
            {running ? (
              <RunningPanel progress={phase.progress} onCancel={cancel} auto={autoStarted} />
            ) : (
              <Action
                account={account}
                empty={!article.text}
                refused={failure?.kind === 'signup'}
              />
            )}
            {view && !running && view.canAnalyse ? <p className="mt-3 mb-0 text-sm text-muted">{view.detail}</p> : null}
          </div>
        </form>
        <Aside />
      </div>
    </div>
  );
}

const TEXT_BUTTON = 'px-2 py-3 text-sm text-muted underline underline-offset-4 hover:text-foreground';

/**
 * A link received alone: Squiggle does not fetch it, so the reader opens it in
 * the browser, where the bookmark reads it, rather than in the publisher's app.
 */
function OpenInBrowser({ address }: { address: string }) {
  const [os] = useState(currentPhoneOs);
  const href = browserLink(address, os, typeof navigator === 'undefined' ? '' : navigator.userAgent);
  return (
    <div className="mt-3">
      <a
        href={href}
        {...(os ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
        onClick={() => count('open_in_browser')}
        className={`${SECONDARY_BUTTON} w-full sm:w-auto`}
      >
        {os ? 'Ouvrir dans le navigateur' : 'Ouvrir l’article'}
      </a>
      {os ? (
        <p className="mt-2 mb-0 text-sm text-muted">
          L’article s’ouvre dans {os === 'ios' ? 'Safari' : 'Chrome'}, où votre abonnement marche aussi. Touchez-y le
          favori « Analyser avec Squiggle » : il revient ici avec le texte.{' '}
          <Link to="/favori" className="underline underline-offset-4 hover:text-foreground">
            Installer le favori
          </Link>
        </p>
      ) : null}
    </div>
  );
}

/** The three gestures from a news app to a report, on this phone. */
const PHONE_STEPS: Record<PhoneOs, string[]> = {
  android: [
    'Dans l’appli, touchez Partager, puis Squiggle (ou Copier le lien, puis « Coller le texte copié » ici).',
    'Touchez « Ouvrir dans le navigateur » : l’article s’ouvre dans Chrome, pas dans l’appli.',
    'Touchez la barre d’adresse, tapez « Analyser », puis le favori « Analyser avec Squiggle ».',
  ],
  ios: [
    'Dans l’appli, touchez Partager, puis Copier le lien ; ici, touchez « Coller le texte copié ».',
    'Touchez « Ouvrir dans le navigateur » : l’article s’ouvre dans Safari, pas dans l’appli.',
    'Touchez Signets, puis le favori « Analyser avec Squiggle ».',
  ],
};

function PhoneGuide({ os }: { os: PhoneOs }) {
  return (
    <div>
      <h2 className="m-0 font-display text-lg font-semibold text-foreground">Depuis une appli de presse</h2>
      <ol className="mt-1 mb-0 grid list-decimal gap-1 pl-5">
        {PHONE_STEPS[os].map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p className="mt-2 mb-0">
        Le favori lit tout l’article dans la page : rien à sélectionner.{' '}
        <Link to="/favori" className={QUIET_LINK}>
          Installer le favori
        </Link>
      </p>
      <p className="mt-2 mb-0">
        Sans favori, copiez un passage, collez-le, puis « Ajouter la suite » pour chacun des suivants : les répétitions
        sont retirées.
      </p>
      <p className="mt-2 mb-0">
        Une appli qui bloque tout, ou la transcription d’une vidéo dans l’appli YouTube : faites des captures d’écran
        en descendant, puis « Importer des captures »
        {os === 'android' ? ', ou partagez-les depuis Photos vers Squiggle' : ''}. Leur texte est lu sur ce
        téléphone.
      </p>
    </div>
  );
}

/** The questions a first paste raises: what it costs, where the text goes, how to have it on a phone. */
function Aside() {
  const install = useInstall();
  const [os] = useState(currentPhoneOs);
  return (
    <aside
      aria-label="Bon à savoir"
      className="grid max-w-[55ch] content-start gap-6 text-base leading-relaxed text-muted lg:pt-9"
    >
      {os ? <PhoneGuide os={os} /> : null}
      <div>
        <h2 className="m-0 font-display text-lg font-semibold text-foreground">Un seul compte</h2>
        <p className="mt-1 mb-0">
          Site, appli et extension partagent vos analyses. Un article déjà analysé ne décompte rien.
        </p>
      </div>
      <div>
        <h2 className="m-0 font-display text-lg font-semibold text-foreground">Rien n’est gardé</h2>
        <p className="mt-1 mb-0">
          Votre texte n’est pas conservé ; le rapport l’est 30 jours.{' '}
          <Link to="/transparence" className={QUIET_LINK}>
            Le trajet des données
          </Link>
        </p>
      </div>
      {install ? (
        <div>
          <h2 className="m-0 font-display text-lg font-semibold text-foreground">Sur votre téléphone</h2>
          <p className="mt-1 mb-0">
            {install.kind === 'prompt'
              ? 'Installez l’appli : un article partagé vers Squiggle arrive directement ici.'
              : 'Dans Safari, touchez Partager puis « Sur l’écran d’accueil ».'}
          </p>

          {install.kind === 'prompt' ? (
            <button type="button" onClick={install.prompt} className={`${SECONDARY_BUTTON} mt-3 max-sm:w-full`}>
              Installer l’appli
            </button>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}

/**
 * The stages the server really runs, in order, each with what it does. A
 * stage the text does not need (no fact to look up) passes as quickly as it
 * runs: the page follows the server, it never paces itself.
 */
const STAGES: Array<[RunStep, string, string]> = [
  ['lecture', 'Lecture', 'Le texte est relu en entier, contre les cinq domaines de la grille.'],
  ['recherche', 'Recherche des sources', 'Chaque fait vérifiable est cherché sur le web.'],
  ['verification', 'Vérification', 'Les objections sont confrontées à ce qui a été trouvé, la note recalculée.'],
  ['rapport', 'Rapport', 'Le rapport est mis en forme.'],
];

/** The server's stage, as one of the four. The cache lookup before the reading counts as the reading's start. */
function stepOf(stage: Progress['stage']): number {
  if (stage === 'parsing_response' || stage === 'researching') return 1;
  if (stage === 'scoring') return 2;
  if (stage === 'storing' || stage === 'success') return 3;
  return 0;
}

function Stages({ stage }: { stage: Progress['stage'] }) {
  const current = stepOf(stage);
  return (
    <div className="mt-8 grid max-w-3xl items-center gap-6 rounded-card border border-border bg-surface p-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-8 sm:p-7">
      {/* Remounted on each stage, so the new loop starts from its beginning. */}
      <div key={STAGES[current][0]} className="run-scene mx-auto w-full max-w-80">
        <RunScene step={STAGES[current][0]} />
      </div>
      <ol className="m-0 grid list-none gap-3 p-0">
        {STAGES.map(([step, label, detail], index) => (
          <li key={step} aria-current={index === current ? 'step' : undefined} className="flex gap-3">
            <span
              aria-hidden="true"
              className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs font-semibold tabular-nums ${
                index < current
                  ? 'border-accent bg-accent text-accentForeground'
                  : index === current
                    ? 'border-accent text-accentInk'
                    : 'border-border text-muted'
              }`}
            >
              {index < current ? '✓' : index + 1}
            </span>
            <span className="grid gap-0.5">
              <span className={`text-base ${index === current ? 'font-semibold text-foreground' : index < current ? 'text-foreground' : 'text-muted'}`}>
                {label}
                {index < current ? <span className="sr-only"> : fait</span> : null}
                {index === current ? <span className="sr-only"> : en cours</span> : null}
              </span>
              {index === current ? <span className="text-sm text-muted">{detail}</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * After a visitor's report: the account is what keeps it, and what comes with
 * it. The same card as the offer a signed-in reader meets when the trial runs out.
 */
function KeepReport({ withheld }: { withheld: boolean }) {
  return (
    <div className="mt-12">
      <section
        aria-labelledby="garder-titre"
        className="max-w-2xl rounded-card border border-border bg-surface p-5 sm:p-7"
      >
        <h2 id="garder-titre" className="m-0 font-display text-xl font-semibold tracking-[-0.01em]">
          Gardez ce rapport, et faites-en {FREE_ANALYSES} de plus
        </h2>
        <p className="mt-1 mb-5 text-base text-muted">
          Créez un compte gratuit, sans carte bancaire : ce rapport vous attend au retour, et {FREE_ANALYSES} analyses
          vous sont offertes, ici, dans l’appli et dans l’extension.
        </p>
        <Link to={withheld ? SIGN_UP_AFTER_WITHHELD : SIGN_UP_AFTER_VISIT} className={`${PRIMARY_BUTTON} max-sm:w-full`}>
          Créer un compte gratuit
        </Link>
      </section>
    </div>
  );
}

function Action({
  account,
  empty,
  refused,
}: {
  account: Account | null | undefined;
  /** An empty text leaves the primary look to "Coller le texte copié". */
  empty: boolean;
  /** A visitor whose analysis without an account was refused: an account is the next step. */
  refused: boolean;
}) {
  if (account === null && refused) {
    return (
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <Link to={SIGN_IN} className={`${PRIMARY_BUTTON} max-sm:w-full`}>
          Créer un compte gratuit
        </Link>
        <p className="m-0 text-sm text-muted">
          {FREE_ANALYSES} analyses offertes, sans carte bancaire. Votre texte reste ici, dans ce navigateur.
        </p>
      </div>
    );
  }

  if (account === null) {
    return (
      <>
        <button type="submit" className={`${empty ? SECONDARY_BUTTON : PRIMARY_BUTTON} max-sm:w-full`}>
          Analyser le texte
        </button>
        <p className="mt-3 mb-0 text-sm text-muted">
          Une analyse offerte sans compte.{' '}
          <Link to={SIGN_IN} className="underline underline-offset-4 hover:text-foreground">
            Se connecter
          </Link>
        </p>
      </>
    );
  }

  const view = account ? describeAccount(account) : null;
  if (account && view?.needsSubscription) return <Offre account={account} view={view} />;
  if (view && !view.canAnalyse) {
    return (
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div>
          <p className="m-0 text-base font-semibold">{view.title}</p>
          <p className="m-0 text-sm text-muted">{view.detail}</p>
        </div>
        <Link to="/compte" className={SECONDARY_BUTTON}>
          Mon compte
        </Link>
      </div>
    );
  }

  return (
    <button
      type="submit"
      disabled={account === undefined}
      className={`${empty ? SECONDARY_BUTTON : PRIMARY_BUTTON} max-sm:w-full disabled:opacity-70`}
    >
      Analyser le texte
    </button>
  );
}

/**
 * The moment the trial runs out, under the report that used it or in place of
 * the analyse button: the offer in one line and the payment right here.
 */
function Offre({ account, view }: { account: Account; view: AccountView }) {
  return (
    <section
      aria-labelledby="offre-titre"
      className="max-w-2xl rounded-card border border-border bg-surface p-5 sm:p-7"
    >
      <h2 id="offre-titre" className="m-0 font-display text-xl font-semibold tracking-[-0.01em]">
        {view.title}
      </h2>
      <p className="mt-1 mb-5 text-base text-muted">
        {account.teacherOffer ? view.detail : OFFER_LINE}
      </p>
      <Abonnement account={account} retour="/analyser" />
    </section>
  );
}

/** Screenshots being read, one after the other, on the device. */
function ReadingPanel({ reading, onCancel }: { reading: Reading; onCancel: () => void }) {
  const { done, total } = reading;
  // The reader loads first, then each screenshot counts for an equal part.
  const percent = done === null ? 4 : Math.max(4, Math.round((done / total) * 100));
  return (
    <div className="mt-3 grid gap-3 rounded-control border border-border bg-surface px-4 py-4">
      <div className="flex items-baseline justify-between gap-4">
        <p role="status" aria-live="polite" className="m-0 text-base font-medium">
          {done === null
            ? 'Préparation de la lecture…'
            : `Lecture de la capture ${Math.min(done + 1, total)} sur ${total}…`}
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="-my-2 -mr-2 shrink-0 px-2 py-3 text-sm text-muted underline underline-offset-4 hover:text-foreground"
        >
          Annuler
        </button>
      </div>
      <div
        role="progressbar"
        aria-label="Lecture des captures"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-1.5 overflow-hidden rounded-full bg-border"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-200 ease-out motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="m-0 text-sm text-muted">
        Le texte est lu sur cet appareil, sans rien envoyer. La première fois, le lecteur se télécharge (quelques Mo).
      </p>
    </div>
  );
}

function RunningPanel({ progress, onCancel, auto }: { progress: Progress; onCancel: () => void; auto: boolean }) {
  return (
    <div className="grid gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <p role="status" aria-live="polite" className="m-0 text-base font-medium">
          {progress.message}
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="-my-2 -mr-2 shrink-0 px-2 py-3 text-sm text-muted underline underline-offset-4 hover:text-foreground"
        >
          Annuler
        </button>
      </div>
      <div
        role="progressbar"
        aria-label="Avancement de l’analyse"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress.percent)}
        className="h-1.5 overflow-hidden rounded-full bg-border"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-200 ease-out motion-reduce:transition-none"
          style={{ width: `${progress.percent}%` }}
        />
      </div>
      <p className="m-0 text-sm text-muted">
        {auto ? 'Le favori a lancé l’analyse, rien à toucher. ' : ''}
        Une analyse prend en général une à deux minutes. Gardez cette page ouverte.
      </p>
    </div>
  );
}

function FailureNotice({ failure }: { failure: AnalysisFailure }) {
  // A refusal on billing is the account's state, which the action below now shows with its next step.
  if (failure.kind === 'billing') return null;
  if (failure.kind === 'signup') {
    return (
      <p role="alert" className="mt-0 mb-3 text-sm text-warningInk">
        {failure.message}
      </p>
    );
  }
  if (failure.kind === 'signin') {
    return (
      <p role="alert" className="mt-0 mb-3 text-sm text-warningInk">
        Votre session a expiré. Reconnectez-vous : votre texte reste ici.
      </p>
    );
  }
  return (
    <p
      role="alert"
      className="mt-0 mb-3 rounded-control border border-critical bg-criticalSoft px-4 py-3 text-sm text-criticalInk"
    >
      {failure.message}
    </p>
  );
}
