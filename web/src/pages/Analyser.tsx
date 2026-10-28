/**
 * The site's own analysis: paste an article, read the report over it.
 *
 * It runs in hosted mode on the reader's account, so it spends the same trial
 * and subscription as the extension, and nothing here judges the text: the
 * stages, the prompts and the score are the server's (`shared/`). A visitor
 * without an account runs one analysis a day the same way, then is offered an
 * account to keep the report: back from that sign-in, the report is served
 * again from the shared cache, at no cost. The paste is kept in this browser
 * until the reader clears it, so signing in halfway loses nothing. "Partager vers Squiggle" (the installed app's share target)
 * lands here with the shared text or address in the query string, which is
 * read once and wiped from the address bar. Where the share menu does not
 * list the app, "Coller le texte copié" reads the clipboard and starts the
 * analysis in the same tap, and "Ajouter la suite" adds a further passage to
 * it, for an app that only lets a reader copy one screen at a time. A link
 * received alone opens in the phone's browser rather than the publisher's app,
 * where the bookmark "Analyser avec Squiggle" (`/favori`) reads the article
 * and brings it back here in the address's fragment, which is read once and
 * wiped like a share; it is then analysed at once, as a copied text is. A
 * video's transcript pasted here is analysed
 * without its timestamps, which come back beside each passage in the report
 * (`transcript.ts`).
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

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
import { count } from '../count';
import { Abonnement } from '../components/Abonnement';
import { StepFigure, type Step } from '../components/Iso';
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
  saveDraft,
  sharedParams,
  type PastedArticle,
  webAddress,
} from '../paste';
import { FAVORI_PARAM, FAVORI_VALUE } from '../favori/payload';
import { browserLink, currentPhoneOs, type PhoneOs } from '../phone';
import { newSeance, saveSeance } from '../classe';
import { Link, navigate } from '../router';
import { readTranscript, type Start } from '../transcript';
import { describeAccount, type AccountView } from '../usage';

const SIGN_IN = '/connexion?next=/analyser';
/** The sign-in a visitor's report offers; the server counts an account opened through it. */
const SIGN_UP_AFTER_VISIT = `/connexion?next=${encodeURIComponent('/analyser?apres=essai')}`;

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
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('apres') === 'essai';
}

const ADDRESS_ONLY = 'Adresse reçue. Collez maintenant le texte de l’article : Squiggle ne va pas le chercher.';
const LOOKING_UP = 'Adresse reçue. Recherche d’un rapport déjà fait pour ce lien…';

/** What to do with a link nobody has analysed with the extension yet, in one sentence. */
function noReportFor(link: string): string {
  return youtubeVideoId(link)
    ? 'Cette vidéo n’a pas encore de rapport : collez ici sa transcription (« Afficher la transcription », sous la description), ou ouvrez-la sur ordinateur avec l’extension Squiggle.'
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

/** The draft, with whatever a share or the bookmark just brought on top of it. */
function initialArticle(): { article: PastedArticle; shared: Partial<PastedArticle> | null; favori: boolean } {
  const draft = loadDraft();
  if (typeof window === 'undefined') return { article: draft, shared: null, favori: false };
  const params = sharedParams(window.location);
  const shared = articleFromShare(params);
  if (!shared) return { article: draft, shared: null, favori: false };
  // A shared text replaces the draft; a shared address alone keeps the draft's text,
  // unless that text is another article's, as it is after a report.
  const otherArticle = Boolean(shared.source && draft.source && shared.source !== draft.source);
  const article =
    shared.text || otherArticle
      ? { ...EMPTY_ARTICLE, ...shared }
      : { ...draft, title: shared.title || draft.title, source: shared.source || draft.source };
  return { article: article as PastedArticle, shared, favori: Boolean(shared.text) && params.get(FAVORI_PARAM) === FAVORI_VALUE };
}

export function Analyser() {
  const [{ article: start, shared, favori }] = useState(initialArticle);
  /** The bookmark's article is analysed as soon as the account says it can be. */
  const [autoRun, setAutoRun] = useState(favori);
  const [returning] = useState(backFromVisit);
  const [article, setArticle] = useState<PastedArticle>(start);
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const [phase, setPhase] = useState<Phase>({ kind: 'edit' });
  const [failure, setFailure] = useState<AnalysisFailure | null>(null);
  // A link shared alone is looked up first: someone may already have analysed it with the extension.
  const [notice, setNotice] = useState<string | null>(() =>
    shared && !shared.text ? (shared.source ? LOOKING_UP : ADDRESS_ONLY) : paymentNotice(),
  );
  const [showProblem, setShowProblem] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const textArea = useRef<HTMLTextAreaElement>(null);
  const reportTop = useRef<HTMLHeadingElement>(null);

  // The shared text is in the form now; it does not stay in the address bar or the history.
  useEffect(() => {
    if (window.location.search || window.location.hash) window.history.replaceState(window.history.state, '', '/analyser');
    if (favori) count('entry_bookmarklet');
    // Once, as the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => saveDraft(article), [article]);

  // Once, for the link a share brought without its text.
  useEffect(() => {
    if (shared && !shared.text && shared.source) void findByLink(shared.source);
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
  // shared cache, so it is shown again without a model call or a credit.
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
    else if (account === null || describeAccount(account).canAnalyse) void run(article);
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

  function analyse(event: FormEvent) {
    event.preventDefault();
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
    let copied: string;
    try {
      copied = await navigator.clipboard.readText();
    } catch {
      // No clipboard API (Firefox, an old browser) or the reader refused it.
      setNotice(MANUAL_PASTE);
      textArea.current?.focus();
      return;
    }
    const text = copied.trim();
    if (!text) {
      setNotice('Rien à coller : copiez d’abord le texte de l’article.');
      return;
    }
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
    let copied: string;
    try {
      copied = await navigator.clipboard.readText();
    } catch {
      setNotice(MANUAL_APPEND);
      textArea.current?.focus();
      return;
    }
    if (!copied.trim()) {
      setNotice('Rien à ajouter : copiez d’abord le passage suivant de l’article.');
      return;
    }
    const text = appendPaste(article.text, copied);
    const added = text.length - article.text.length;
    setFailure(null);
    setArticle({ ...article, text });
    setNotice(
      text === article.text || added <= 0
        ? 'Ce passage est déjà dans le texte : copiez le suivant.'
        : `Suite ajoutée : ${added.toLocaleString('fr-FR')} caractères de plus.`,
    );
  }

  async function run(article: PastedArticle) {
    setFailure(null);
    setNotice(null);
    const abort = new AbortController();
    controller.current = abort;
    if (readTranscript(article.text)) count('paste_transcript');
    setPhase({ kind: 'running', progress: { message: 'Préparation de l’analyse…', percent: 2 } });
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
        </div>
        <Rapport report={phase.report} blocks={phase.blocks} times={phase.times} />
        {phase.visitor ? <KeepReport /> : null}
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
          <fieldset disabled={running} className="m-0 grid gap-6 border-0 p-0">
            <div>
              <div className="flex items-baseline justify-between gap-4">
                <label htmlFor="texte" className="text-base font-medium">
                  Texte de l’article
                </label>
                {!running && (article.text || article.title || article.source) ? (
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
              {!running && !article.text ? (
                <div className="mt-3">
                  <button type="button" onClick={pasteCopied} className={`${PRIMARY_BUTTON} w-full sm:w-auto`}>
                    Coller le texte copié
                  </button>
                  <p className="mt-2 mb-0 text-sm text-muted">
                    Le partage depuis d’autres applis demande Chrome avec les services Google ; sinon, copiez puis
                    Coller.
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
                  et collez-la ici.
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
                : 'sticky bottom-0 z-10 -mx-4 mt-6 border-t border-border bg-background px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0'
            }
          >
            {showProblem && problem ? (
              <p role="alert" className="mt-0 mb-3 text-sm text-warningInk">
                {PASTE_PROBLEMS[problem]}
              </p>
            ) : null}
            {failure ? <FailureNotice failure={failure} /> : null}
            {running ? (
              <RunningPanel progress={phase.progress} onCancel={() => controller.current?.abort()} />
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

/** Where the analysis stands, drawn as the home page explains it. */
const STAGES: Array<[Step, string]> = [
  ['article', 'L’article'],
  ['lecture', 'La relecture'],
  ['sources', 'Les sources'],
  ['rapport', 'Le rapport'],
];

function stepOf(stage: Progress['stage']): number {
  if (stage === 'calling_provider') return 1;
  if (stage === 'parsing_response' || stage === 'researching') return 2;
  if (stage === 'scoring' || stage === 'storing' || stage === 'success') return 3;
  return 0;
}

function Stages({ stage }: { stage: Progress['stage'] }) {
  const current = stepOf(stage);
  return (
    <ol aria-hidden="true" className="mt-8 grid max-w-3xl list-none grid-cols-4 gap-3 p-0 sm:gap-6">
      {STAGES.map(([step, label], index) => (
        <li
          key={step}
          className={`grid content-start gap-2 text-center text-sm sm:text-base ${index === current ? 'font-medium text-accentInk' : 'text-muted'}`}
        >
          {/* Only the drawing of a step still to come fades; its name stays readable. */}
          <div className={`transition-opacity duration-300 ${index > current ? 'opacity-35' : ''}`}>
            <StepFigure step={step} live={index === current} />
          </div>
          {label}
        </li>
      ))}
    </ol>
  );
}

/**
 * After a visitor's report: the account is what keeps it, and what comes with
 * it. The same card as the offer a signed-in reader meets when the trial runs out.
 */
function KeepReport() {
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
        <Link to={SIGN_UP_AFTER_VISIT} className={`${PRIMARY_BUTTON} max-sm:w-full`}>
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
          Une analyse offerte sans compte, chaque jour.{' '}
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

function RunningPanel({ progress, onCancel }: { progress: Progress; onCancel: () => void }) {
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
