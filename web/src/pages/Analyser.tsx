/**
 * The site's own analysis: paste an article, read the report over it.
 *
 * It runs in hosted mode on the reader's account, so it spends the same trial
 * and subscription as the extension, and nothing here judges the text: the
 * stages, the prompts and the score are the server's (`shared/`). The paste
 * is kept in this browser until the reader clears it, so signing in halfway
 * loses nothing. "Partager vers Squiggle" (the installed app's share target)
 * lands here with the shared text or address in the query string, which is
 * read once and wiped from the address bar.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';

import type { AnalysisReport, TextBlock } from '../../../shared/src/engine/types';
import { analysisFailure, analyzePasted, type AnalysisFailure, type Progress } from '../analysis';
import { getAccount, type Account } from '../api';
import { PRIMARY_BUTTON, QUIET_LINK, SECONDARY_BUTTON } from '../components/Landing';
import { Rapport } from '../components/Rapport';
import { SignIn } from '../components/SignIn';
import { EXAMPLE_ARTICLE, EXAMPLE_BLOCKS, EXAMPLE_REPORT } from '../example';
import { useInstall } from '../install';
import { FREE_ANALYSES } from '../offer';
import {
  articleFromShare,
  EMPTY_ARTICLE,
  loadDraft,
  MAX_TITLE_CHARS,
  MIN_TEXT_CHARS,
  PASTE_PROBLEMS,
  pasteProblem,
  saveDraft,
  type PastedArticle,
} from '../paste';
import { Link } from '../router';
import { describeAccount } from '../usage';

type Phase =
  | { kind: 'edit' }
  | { kind: 'running'; progress: Progress }
  | { kind: 'done'; report: AnalysisReport; blocks: TextBlock[] }
  /** The report written in advance on the sample article: no account, no request. */
  | { kind: 'example' };

/** `/analyser?exemple` opens the example report straight away. */
function wantsExample(): boolean {
  return new URLSearchParams(window.location.search).has('exemple');
}

/** The draft, with whatever a share just brought on top of it. */
function initialArticle(): { article: PastedArticle; shared: Partial<PastedArticle> | null } {
  const draft = loadDraft();
  const shared = articleFromShare(new URLSearchParams(window.location.search));
  if (!shared) return { article: draft, shared: null };
  // A shared text replaces the draft; a shared address alone keeps the draft's text.
  const article = shared.text
    ? { ...EMPTY_ARTICLE, ...shared }
    : { ...draft, title: shared.title || draft.title, source: shared.source || draft.source };
  return { article: article as PastedArticle, shared };
}

const FIELD_BASE =
  'mt-2 block w-full rounded-control border px-4 py-3 outline-hidden transition-colors duration-160 ease-out focus:border-accentHover disabled:opacity-70';
const FIELD = `${FIELD_BASE} border-borderControl bg-surface text-base text-foreground placeholder:text-muted`;
/** The paste area is the article's sheet: the same paper as the report's text. */
const SHEET_FIELD = `${FIELD_BASE} border-paperMuted bg-paper font-serif text-lg leading-relaxed text-paperInk placeholder:text-paperMuted`;

export function Analyser() {
  const [{ article: start, shared }] = useState(initialArticle);
  const [article, setArticle] = useState<PastedArticle>(start);
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const [accountFailed, setAccountFailed] = useState(false);
  const [phase, setPhase] = useState<Phase>(() => (wantsExample() ? { kind: 'example' } : { kind: 'edit' }));
  const [askSignIn, setAskSignIn] = useState(false);
  const [failure, setFailure] = useState<AnalysisFailure | null>(null);
  const [notice, setNotice] = useState<string | null>(
    shared && !shared.text
      ? 'Adresse reçue. Collez maintenant le texte de l’article : Squiggle ne va pas le chercher.'
      : null,
  );
  const [showProblem, setShowProblem] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const textArea = useRef<HTMLTextAreaElement>(null);
  const reportTop = useRef<HTMLHeadingElement>(null);

  // The shared text is in the form now; it does not stay in the address bar or the history.
  useEffect(() => {
    if (shared) window.history.replaceState(window.history.state, '', '/analyser');
  }, [shared]);

  useEffect(() => saveDraft(article), [article]);

  function loadAccount() {
    setAccountFailed(false);
    getAccount()
      .then(setAccount)
      .catch(() => setAccountFailed(true));
  }
  useEffect(loadAccount, []);

  useEffect(() => {
    if (phase.kind === 'done' || phase.kind === 'example') reportTop.current?.focus();
  }, [phase.kind]);

  const problem = pasteProblem(article);
  const view = account ? describeAccount(account) : null;
  const running = phase.kind === 'running';
  const chars = article.text.trim().length;

  function edit<K extends keyof PastedArticle>(key: K, value: PastedArticle[K]) {
    setArticle((current) => ({ ...current, [key]: value }));
    setFailure(null);
    if (key === 'text') setNotice(null);
  }

  async function analyse(event: FormEvent) {
    event.preventDefault();
    if (problem) {
      setShowProblem(true);
      textArea.current?.focus();
      return;
    }
    // Signed out: the sign-in opens here, under the text, which stays where it is.
    if (account === null) {
      setAskSignIn(true);
      return;
    }
    await run();
  }

  /** Once signed in from this page, the analysis the reader asked for starts on its own. */
  async function signedIn() {
    setAskSignIn(false);
    try {
      const fresh = await getAccount();
      setAccount(fresh);
      if (fresh && describeAccount(fresh).canAnalyse) await run();
    } catch {
      setAccountFailed(true);
    }
  }

  async function run() {
    setFailure(null);
    setNotice(null);
    const abort = new AbortController();
    controller.current = abort;
    setPhase({ kind: 'running', progress: { message: 'Préparation de l’analyse…', percent: 2 } });
    try {
      const { report, blocks } = await analyzePasted(
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
      );
      setPhase({ kind: 'done', report, blocks });
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

  function leaveExample() {
    setPhase({ kind: 'edit' });
    if (window.location.search) window.history.replaceState(window.history.state, '', '/analyser');
  }

  function startOver() {
    setArticle(EMPTY_ARTICLE);
    setPhase({ kind: 'edit' });
    setShowProblem(false);
  }

  if (phase.kind === 'example') {
    return (
      <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:py-12">
        <p className="m-0 mb-6 rounded-card bg-accentSoft px-5 py-4 text-base leading-relaxed">
          <strong className="font-semibold">Rapport d’exemple.</strong> Un article fictif, analysé à l’avance : rien
          n’est décompté.
        </p>
        <h1
          ref={reportTop}
          tabIndex={-1}
          className="m-0 font-display text-3xl leading-tight font-semibold tracking-tight outline-hidden focus-visible:ring-0 sm:text-4xl"
        >
          {EXAMPLE_ARTICLE.title}
        </h1>
        <div className="mt-5 mb-10 flex flex-wrap items-center gap-x-6 gap-y-3">
          <button type="button" onClick={leaveExample} className={PRIMARY_BUTTON}>
            Analyser votre article
          </button>
          <Link to="/" className={QUIET_LINK}>
            Retour à l’accueil
          </Link>
        </div>
        <Rapport report={EXAMPLE_REPORT} blocks={EXAMPLE_BLOCKS} example />
      </div>
    );
  }

  if (phase.kind === 'done') {
    return (
      <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:py-12">
        <h1
          ref={reportTop}
          tabIndex={-1}
          className="m-0 font-display text-3xl leading-tight font-semibold tracking-tight outline-hidden focus-visible:ring-0 sm:text-4xl"
        >
          {article.title.trim() || 'Rapport d’analyse'}
        </h1>
        <div className="mt-3 mb-10 flex flex-wrap items-center gap-x-6 gap-y-1">
          <button type="button" onClick={() => setPhase({ kind: 'edit' })} className={QUIET_LINK}>
            Modifier le texte
          </button>
          <button type="button" onClick={startOver} className={QUIET_LINK}>
            Analyser un autre article
          </button>
          {view ? <p className="m-0 basis-full text-sm text-muted sm:basis-auto">{view.detail}</p> : null}
        </div>
        <Rapport report={phase.report} blocks={phase.blocks} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-5 pt-8 sm:py-12">
      <h1 className="m-0 font-display text-4xl leading-[1.1] font-semibold tracking-tight sm:text-5xl">Analyser un texte</h1>
      <p className="mt-3 mb-0 max-w-[62ch] text-lg leading-relaxed text-muted">
        Collez le texte d’un article : Squiggle surligne les passages fragiles et dit pourquoi.
      </p>
      <p className="mt-2 mb-0">
        <button type="button" onClick={() => setPhase({ kind: 'example' })} className={`${QUIET_LINK} text-left`}>
          Pas d’article sous la main ? Voir un rapport d’exemple
        </button>
      </p>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-16">
        <form onSubmit={analyse} noValidate>
          <fieldset disabled={running} className="m-0 grid gap-6 border-0 p-0">
            <div>
              <div className="flex items-baseline justify-between gap-4">
                <label htmlFor="texte" className="text-base font-medium">
                  Texte de l’article
                </label>
                {!running && (article.text || article.title || article.source) ? (
                  <button
                    type="button"
                    onClick={startOver}
                    className="-my-2 -mr-2 px-2 py-3 text-sm text-muted underline underline-offset-4 hover:text-foreground"
                  >
                    Effacer
                  </button>
                ) : null}
              </div>
              {notice ? (
                <p role="status" className="mt-2 mb-0 rounded-control bg-accentSoft px-4 py-3 text-sm">
                  {notice}
                </p>
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
                className={`${SHEET_FIELD} min-h-64 resize-y`}
              />
              <p
                id="texte-aide"
                className={`mt-2 mb-0 text-sm ${showProblem && problem === 'too_short' ? 'text-warningInk' : 'text-muted'}`}
              >
                {chars === 0
                  ? 'Copiez le texte dans la page de l’article, puis collez-le ici.'
                  : chars < MIN_TEXT_CHARS
                    ? `${chars} caractères : il en faut au moins ${MIN_TEXT_CHARS}.`
                    : `${chars.toLocaleString('fr-FR')} caractères.`}
              </p>
            </div>

            <details className="group" open={Boolean(article.title || article.source) || undefined}>
              <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 text-base text-muted hover:text-foreground [&::-webkit-details-marker]:hidden">
                <span aria-hidden="true" className="text-accentInk transition-transform duration-160 group-open:rotate-45">
                  +
                </span>
                Titre et adresse (facultatif)
              </summary>
              <div className="mt-3 grid gap-6 sm:grid-cols-2">
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
            </details>
          </fieldset>

          <div
            className={`mt-6 ${
              askSignIn
                ? ''
                : 'sticky bottom-0 z-10 -mx-5 border-t border-border bg-background px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0'
            }`}
          >
            {showProblem && problem ? (
              <p role="alert" className="mt-0 mb-3 text-sm text-warningInk">
                {PASTE_PROBLEMS[problem]}
              </p>
            ) : null}
            {failure ? <FailureNotice failure={failure} /> : null}
            {running ? (
              <RunningPanel progress={phase.progress} onCancel={() => controller.current?.abort()} />
            ) : askSignIn && account === null ? (
              <section aria-labelledby="connexion-titre" className="rounded-card bg-surface p-5 sm:p-8">
                <h2 id="connexion-titre" className="m-0 text-2xl font-semibold tracking-tight">
                  Connectez-vous pour lancer l’analyse
                </h2>
                <p className="mt-2 mb-6 text-base leading-relaxed text-muted">
                  {FREE_ANALYSES} analyses offertes, sans carte bancaire. Votre texte reste ici.
                </p>
                <SignIn next="/analyser" onSignedIn={() => void signedIn()} />
              </section>
            ) : (
              <Action account={account} accountFailed={accountFailed} onRetry={loadAccount} />
            )}
            {view && !running && view.canAnalyse ? <p className="mt-3 mb-0 text-sm text-muted">{view.detail}</p> : null}
            {account === null && !askSignIn && !running ? (
              <p className="mt-3 mb-0 text-sm text-muted">{FREE_ANALYSES} analyses offertes à l’inscription.</p>
            ) : null}
          </div>
        </form>
        <Aside />
      </div>
    </div>
  );
}

/** What a first paste asks: where the text goes, what it costs, how to have it on a phone. */
function Aside() {
  const install = useInstall();
  return (
    <aside aria-label="Bon à savoir" className="grid content-start gap-5 text-base leading-relaxed text-muted lg:pt-9">
      <p className="m-0">
        <strong className="font-semibold text-foreground">Votre texte n’est pas conservé.</strong> Il ne quitte ce
        navigateur que pour l’analyse.{' '}
        <Link to="/transparence" className="text-accentInk underline decoration-borderControl underline-offset-4">
          Le trajet
        </Link>
      </p>
      <p className="m-0">
        <strong className="font-semibold text-foreground">Le même compte partout.</strong> Un texte déjà analysé par un
        autre lecteur ne vous coûte rien.
      </p>
      {install ? (
        <div className="m-0">
          <p className="m-0">
            <strong className="font-semibold text-foreground">Sur votre téléphone.</strong>{' '}
            {install.kind === 'prompt'
              ? 'Installez l’appli : un article partagé vers Squiggle arrive ici.'
              : 'Touchez Partager puis « Sur l’écran d’accueil » : Squiggle s’ouvre comme une appli.'}
          </p>
          {install.kind === 'prompt' ? (
            <button type="button" onClick={install.prompt} className={`${SECONDARY_BUTTON} mt-3`}>
              Installer Squiggle
            </button>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}

function Action({
  account,
  accountFailed,
  onRetry,
}: {
  account: Account | null | undefined;
  accountFailed: boolean;
  onRetry: () => void;
}) {
  if (accountFailed) {
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <p className="m-0 text-sm text-muted">Votre compte n’a pas pu être vérifié.</p>
        <button type="button" onClick={onRetry} className={SECONDARY_BUTTON}>
          Réessayer
        </button>
      </div>
    );
  }

  const view = account ? describeAccount(account) : null;
  if (view && !view.canAnalyse) {
    return (
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div>
          <p className="m-0 text-base font-semibold">{view.title}</p>
          <p className="m-0 text-sm text-muted">{view.detail}</p>
        </div>
        <Link to="/compte" className={view.needsSubscription ? `${PRIMARY_BUTTON} max-sm:w-full` : SECONDARY_BUTTON}>
          {view.needsSubscription ? 'S’abonner' : 'Mon compte'}
        </Link>
      </div>
    );
  }

  return (
    <button
      type="submit"
      disabled={account === undefined}
      className={`${PRIMARY_BUTTON} max-sm:w-full disabled:opacity-70`}
    >
      Analyser le texte
    </button>
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
