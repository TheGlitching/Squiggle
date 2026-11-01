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
 * (`captures.ts`). A PDF, imported or shared, is read the same way, on the
 * device (`pdf.ts`); one too long for an analysis is read a range of pages at a time.
 * (`captures.ts`). A recording (a saved video, a voice message, an episode)
 * is transcribed, fifteen minutes per analysis, and its text lands in the
 * field the same way, with the time of each passage (`media.ts`).
 */
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent, type DragEvent, type FormEvent } from 'react';

import { screenshotsCounter, type AudienceMetricName } from '@squiggle/shared/src/hosted/audience';
import { pagesThatFit, pdfText, type PdfBlock } from '@squiggle/shared/src/extract/pdf';

import type { AnalysisReport, TextBlock } from '../../../shared/src/engine/types';
import { youtubeVideoId } from '../../../shared/src/engine/video';
import {
  analysisFailure,
  analyzePasted,
  cachedReport,
  reportByFingerprint,
  isXLink,
  readXPost,
  reportByLink,
  type AnalysisFailure,
  type Progress,
} from '../analysis';
import { ApiError, getAccount, messageForError, transcribe, type Account } from '../api';
import { MAX_CAPTURES, readCaptures, takeSharedCaptures } from '../captures';
import {
  isMedia,
  MAX_MEDIA_BYTES,
  MAX_MEDIA_SECONDS,
  mediaDuration,
  partsOf,
  partSpan,
  soundPart,
  takeSharedMedia,
  transcriptText,
} from '../media';
import { useBrowserValue } from '../client';
import { count } from '../count';
import { Abonnement } from '../components/Abonnement';
import { RunScene, type RunStep } from '../components/Iso';
import { FIELD, PAGE, PRIMARY_BUTTON, QUIET_LINK, SECONDARY_BUTTON, TITLE } from '../components/Landing';
import { Rapport } from '../components/Rapport';
import { useInstall } from '../install';
import { readPdfFile } from '../pdf';
import { FREE_ANALYSES, OFFER_LINE } from '../offer';
import {
  appendPaste,
  articleFromShare,
  EMPTY_ARTICLE,
  loadDraft,
  MAX_MESSAGE_CHARS,
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
import { isSocialHost } from '../../../shared/src/extract/socialPlatform';
import { carriesPage, readFavori, type PostProblem } from '../favori/article';
import { APP_VALUE, FAVORI_PARAM, FAVORI_VALUE, SHORTCUT_VALUE } from '../favori/payload';
import { browserLink, currentPhoneOs, type PhoneOs } from '../phone';
import { newSeance, saveSeance } from '../classe';
import { Link, navigate } from '../router';
import { readTranscript, type Start } from '../../../shared/src/extract/transcript';
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
      /** The report of an e-mail the reader forwarded: its text is in their mailbox, not here. */
      mailed?: boolean;
    };

/** Back from the sign-in a visitor's report offered. Read before the address bar is wiped. */
function backFromVisit(): boolean {
  if (typeof window === 'undefined') return false;
  const after = new URLSearchParams(window.location.search).get('apres');
  return after === 'essai' || after === 'flou';
}

/**
 * The report a forwarded e-mail's reply links to, named by the fingerprint of
 * the e-mail's text (`server/src/mail/inbound.ts`). Read before the address bar is wiped.
 */
function mailedReport(): string | null {
  if (typeof window === 'undefined') return null;
  const fingerprint = new URLSearchParams(window.location.search).get('rapport');
  return fingerprint && /^[0-9a-f]{64}$/.test(fingerprint) ? fingerprint : null;
}

const OPENING_MAILED = 'Ouverture du rapport de votre e-mail…';
const MAILED_GONE =
  'Ce rapport n’est plus disponible. Transférez de nouveau l’e-mail à verifier@squiggle.fr, ou collez son texte ici.';

const ADDRESS_ONLY = 'Adresse reçue. Collez maintenant le texte de l’article : Squiggle ne va pas le chercher.';
const READING_X = 'Lien X reçu. Lecture de la publication…';
const X_PARTIAL = 'Le fil n’a pas pu être lu en entier : l’analyse porte sur ce qui a été lu jusqu’à cette publication.';
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

/** What to do with a social page that brought no text, in its own case. YouTube is looked up by its link instead. */
const POST_UNREAD: Record<Exclude<PostProblem, 'video'>, (network: string) => string> = {
  cut: (network) =>
    `${network} ne montre que le début de cette publication sans connexion, et Squiggle n’en analyse pas une moitié. Connectez-vous à ${network} sur la page de la publication, puis relancez Squiggle (dans l’application Squiggle, touchez Vérifier ; Squiggle ne voit pas votre mot de passe). Ou faites une capture d’écran de la publication et partagez-la vers Squiggle, ou copiez son texte et collez-le ici.`,
  no_text: (network) =>
    `Cette publication ${network} n’a presque pas de texte à lire. Pour le texte affiché sur l’image ou la vidéo, faites une capture d’écran et partagez-la vers Squiggle. Pour ce qui est dit dans la vidéo, enregistrez-la, puis partagez la vidéo vers Squiggle : il en transcrit le son. Ou collez le texte ici.`,
  not_a_post: () =>
    'Squiggle lit une publication à la fois, pas un profil ni un fil. Ouvrez la publication elle-même (touchez sa date ou son texte), puis relancez Squiggle. Si un bandeau de cookies ou de connexion la cache, fermez-le d’abord. Ou copiez son texte et collez-le ici.',
};
const CAPTURES_LOST = 'Les fichiers partagés n’ont pas été retrouvés. Importez-les ici.';
const TOO_MANY_CAPTURES = `${MAX_CAPTURES} captures au plus à la fois : un article tient d’ordinaire en moins de dix.`;

const PDF_READ = (pages: number) =>
  `Texte lu dans le PDF (${plural(pages, 'page')}), sur cet appareil : le fichier n’a pas été envoyé. Relisez-le avant de lancer l’analyse : une légende de figure ou un reste de tableau s’efface ici.`;
const PDF_PART_READ = (from: number, to: number, pages: number) =>
  `Ce PDF de ${pages} pages est trop long pour une seule analyse : le champ en garde les pages ${from} à ${to}. Pour en analyser une autre partie, choisissez ses pages ci-dessous. Le fichier n’a pas été envoyé.`;
const PDF_SCAN_READ = (read: number, pages: number) =>
  `Ce PDF est un document scanné : ${read < pages ? `ses ${read} premières pages ont été lues` : pages === 1 ? 'sa page a été lue' : `ses ${pages} pages ont été lues`} comme des captures, sur cet appareil. Relisez le texte avant de lancer l’analyse : une ligne peut être mal lue.`;
const PDF_EMPTY = 'Aucun texte n’a été trouvé dans ce PDF, même en lisant ses pages comme des images.';
const PDF_LOCKED = 'Ce PDF est protégé par un mot de passe. Ouvrez-le, copiez son texte, puis collez-le ici.';
const PDF_INVALID = 'Ce fichier n’est pas un PDF lisible. Importez le PDF de l’article ou du rapport lui-même.';
const PDF_FAILED =
  'La lecture du PDF n’a pas pu démarrer. Vérifiez la connexion : le lecteur de PDF se télécharge la première fois.';

/** Some systems name a shared or picked PDF by its extension only. */
const isPdf = (file: Blob) => file.type === 'application/pdf' || (file instanceof File && /\.pdf$/i.test(file.name));

/** What the reader is reading: screenshots, a PDF's text, or a scanned PDF's pages. */
type Reading = { done: number | null; total: number; what: 'captures' | 'pdf' | 'scan' };

/** A PDF too long for one analysis, whose pages the reader picks. */
type LongPdf = { blocks: PdfBlock[]; pages: number; from: number; to: number };

/** A text shared without a link and too short to claim anything ("ok", "Merci !"). */
const SHORT_MESSAGE = `Ce message est trop court pour être analysé : il faut au moins ${MIN_TEXT_CHARS} caractères. S’il accompagnait un article ou un autre message, partagez plutôt celui-ci vers Squiggle.`;

/** The entries that bring a whole text and start its analysis without a tap, by their `via`, with their counter. */
const AUTO_ENTRIES = new Map<string | null, AudienceMetricName>([
  [FAVORI_VALUE, 'entry_bookmarklet'],
  [SHORTCUT_VALUE, 'entry_shortcut'],
  [APP_VALUE, 'entry_app_text'],
]);

const MEDIA_NEEDS_ACCOUNT =
  'La transcription d’un enregistrement demande un compte : connectez-vous, puis importez-le à nouveau.';
const MEDIA_NO_ANALYSIS = 'Il ne vous reste pas d’analyse : la transcription attendra la prochaine.';
const MEDIA_NOT_MEDIA = 'Ce fichier n’est ni un son ni une vidéo. Importez un message vocal, une vidéo ou un épisode.';
const MEDIA_TOO_HEAVY = `Ce fichier dépasse ${MAX_MEDIA_BYTES / 1024 / 1024} Mo : ce navigateur ne pourrait pas en lire le son.`;
const MEDIA_TOO_LONG = `Cet enregistrement dure plus de ${MAX_MEDIA_SECONDS / 3600} heures : Squiggle ne lit pas aussi long.`;
const NOT_IMPORTABLE = 'Ce fichier n’est ni une image, ni un PDF, ni un son ou une vidéo.';
const MEDIA_UNREADABLE =
  'Le son de ce fichier n’a pas pu être lu sur cet appareil. Essayez un autre format, ou un navigateur récent.';
const MEDIA_SILENT = 'Aucune parole n’a été reconnue dans cet enregistrement.';
const MEDIA_LOST = 'L’enregistrement partagé n’a pas été retrouvé. Importez-le ici.';

function minutes(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m ? `${m} min${s ? ` ${s} s` : ''}` : `${s} s`;
}

const MEDIA_READ = (seconds: number, part: number, total: number) =>
  `Transcription de ${minutes(seconds)}${
    total > 1 ? `, partie ${part + 1} sur ${total}` : ''
  }. Relisez-la avant de lancer l’analyse : un nom propre peut être mal entendu. Le fichier n’a été gardé nulle part.`;

/** A recording kept on this device while it has parts left to analyse. */
type Recording = { file: Blob; seconds: number; part: number };

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
 * Whether this reader's first render of the page differs from the build's: a draft
 * kept from a last visit, or anything the address brought (a share, the bookmark, a
 * return from sign-in or checkout, a mailed report). Each of `AnalyserPage`'s
 * first-render reads of the browser is here; `src/main.tsx` hydrates the page otherwise.
 */
export function analyserReadsReader(): boolean {
  const { article, shared, favori } = initialArticle();
  return Boolean(
    article.title ||
      article.source ||
      article.text ||
      shared ||
      favori ||
      sharedCaptures() ||
      backFromVisit() ||
      mailedReport() ||
      paymentNotice() ||
      new URLSearchParams(window.location.search).get('media') === '1',
  );
}

/**
 * The Android app opens a share on /analyser#text=… in the app's tab, which
 * may already show this page: then only the fragment changes. The page starts
 * over, and reads it as it reads any share.
 */
export function Analyser() {
  const [visit, setVisit] = useState(0);
  // The fragment a new page is about to read: a second event for it, before
  // that page has opened and wiped it, would start over once more and find the
  // address bare, losing the share.
  const opening = useRef<string | null>(null);
  useEffect(() => {
    const reread = () => {
      const params = sharedParams(window.location);
      if (window.location.hash === opening.current) return;
      if (carriesPage(params) || articleFromShare(params)) {
        opening.current = window.location.hash;
        setVisit((n) => n + 1);
      }
    };
    window.addEventListener('hashchange', reread);
    return () => window.removeEventListener('hashchange', reread);
  }, []);
  // The new page has read its fragment: the same share sent again is a new one.
  useEffect(() => {
    opening.current = null;
  }, [visit]);
  return <AnalyserPage key={visit} />;
}

function AnalyserPage() {
  const [{ article: start, shared, favori, entry, page }] = useState(initialArticle);
  /** The bookmark's article is analysed as soon as it is read and the account says it can be. */
  const [autoRun, setAutoRun] = useState(favori && !page);
  /** Cleared by a cancel that comes while the bookmark's page is still being read. */
  const readingPage = useRef(Boolean(page));
  const [sharedCount] = useState(sharedCaptures);
  const [returning] = useState(backFromVisit);
  const [mailed] = useState(mailedReport);
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
    mailed
      ? OPENING_MAILED
      : entry === 'entry_short_message'
        ? SHORT_MESSAGE
        : shared && !shared.text && !sharedCount
          ? shared.source
            ? LOOKING_UP
            : ADDRESS_ONLY
          : paymentNotice(),
  );
  const [showProblem, setShowProblem] = useState(false);
  const [reading, setReading] = useState<Reading | null>(null);
  const [longPdf, setLongPdf] = useState<LongPdf | null>(null);
  const controller = useRef<AbortController | null>(null);
  const textArea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  /** A file is being dragged over the empty field. */
  const [dragging, setDragging] = useState(false);
  /** What the transcription of a recording is doing, while it does it. */
  const [transcribing, setTranscribing] = useState<string | null>(null);
  /** A recording longer than one part, waiting for the reader to pick one. */
  const [choosing, setChoosing] = useState<Omit<Recording, 'part'> | null>(null);
  /** The recording whose part was just transcribed, while it has more. */
  const [recording, setRecording] = useState<Recording | null>(null);
  const [sharedMedia, setSharedMedia] = useState<Blob | null | undefined>(() =>
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('media') === '1' ? undefined : null,
  );
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
        if (read.problem === 'video') return void findByLink(read.url);
        setNotice(read.problem ? POST_UNREAD[read.problem](read.network ?? 'Le réseau') : FAVORI_UNREAD);
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

  // Screenshots or a PDF shared to the installed app: read at once, as imported ones are.
  useEffect(() => {
    if (!sharedCount) return;
    takeSharedCaptures().then((files) => {
      const pdf = files.find(isPdf);
      if (pdf) void importPdf(pdf, 'share_pdf');
      else if (files.length) void importCaptures(files, 'share_screenshots');
      else setNotice(CAPTURES_LOST);
    });
    // Once, for the share the page opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A recording shared to the installed app, taken at once; transcribed once the account is known.
  useEffect(() => {
    if (sharedMedia !== undefined) return;
    takeSharedMedia().then((file) => {
      if (!file) setNotice(MEDIA_LOST);
      setSharedMedia(file);
    });
    // Once, for the share the page opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!sharedMedia || account === undefined) return;
    setSharedMedia(null);
    void importMedia(sharedMedia);
    // Once, when both the recording and the account are there.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedMedia, account]);

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

  // Once the account is known, for the report a forwarded e-mail's reply links
  // to: it opens on the reader's own account, from the shared cache, at no credit.
  useEffect(() => {
    if (!mailed || account === undefined) return;
    if (account === null) {
      navigate(`/connexion?next=${encodeURIComponent(`/analyser?rapport=${mailed}`)}`, { replace: true });
      return;
    }
    let live = true;
    reportByFingerprint(mailed).then(
      (report) => {
        if (!live) return;
        if (!report) return void setNotice(MAILED_GONE);
        setNotice(null);
        setPhase((current) =>
          current.kind === 'edit' ? { kind: 'done', report, blocks: [], times: null, visitor: false, mailed: true } : current,
        );
      },
      () => live && setNotice(MAILED_GONE),
    );
    return () => {
      live = false;
    };
  }, [mailed, account]);

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
  const chars = pastedChars(article.text);
  const transcript = useMemo(() => readTranscript(article.text), [article.text]);

  /**
   * The report a reader using the extension already made for this link. Only
   * the link is sent, and nothing fetches the page: a miss says, in one
   * sentence, how to have it analysed.
   */
  async function findByLink(link: string) {
    // A publication on X is read by the server from X itself, then analysed like a paste.
    if (isXLink(link)) {
      setNotice(READING_X);
      const read = await readXPost(link, !!account);
      if (read.kind === 'error') return setNotice((current) => (current === READING_X ? read.message : current));
      setArticle(read.article);
      setNotice(read.partial ? X_PARTIAL : null);
      if (!pasteProblem(read.article) && (account === null || (account && describeAccount(account).canAnalyse))) {
        await run(read.article);
      }
      return;
    }
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
    setLongPdf(null);
    const abort = new AbortController();
    controller.current = abort;
    setReading({ done: null, total: images.length, what: 'captures' });
    try {
      const text = await readCaptures(images, (done, total) => setReading({ done, total, what: 'captures' }), abort.signal);
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

  /**
   * A PDF, read on this device, into the text field, as screenshots are: its
   * text, or for a scan the OCR's reading of its pages. One too long for an
   * analysis lands as the first pages that fit, with the choice of others.
   */
  async function importPdf(file: Blob, via: 'import_pdf' | 'share_pdf') {
    setFailure(null);
    setShowProblem(false);
    setNotice(null);
    setLongPdf(null);
    const abort = new AbortController();
    controller.current = abort;
    setReading({ done: null, total: 1, what: 'pdf' });
    try {
      const read = await readPdfFile(file, MAX_CAPTURES, abort.signal);
      count(via);
      let text: string;
      let said: string;
      if (read.scanned) {
        count('pdf_scanned');
        const scans = read.scans;
        setReading({ done: null, total: scans.length, what: 'scan' });
        text = await readCaptures(scans, (done, total) => setReading({ done, total, what: 'scan' }), abort.signal);
        said = PDF_SCAN_READ(scans.length, read.pages);
      } else {
        const to = pagesThatFit(read.blocks, 1, read.pages);
        text = pdfText(read.blocks, 1, to);
        if (to < read.pages) setLongPdf({ blocks: read.blocks, pages: read.pages, from: 1, to });
        said = to < read.pages ? PDF_PART_READ(1, to, read.pages) : PDF_READ(read.pages);
      }
      if (!text.trim()) return setNotice(PDF_EMPTY);
      setArticle((current) => ({ ...current, title: current.title.trim() || read.title.slice(0, MAX_TITLE_CHARS), text }));
      setNotice(said);
      textArea.current?.focus();
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      setNotice(
        abort.signal.aborted
          ? 'Lecture annulée.'
          : name === 'PasswordException'
            ? PDF_LOCKED
            : name === 'InvalidPDFException'
              ? PDF_INVALID
              : PDF_FAILED,
      );
    } finally {
      controller.current = null;
      setReading(null);
    }
  }

  /** Another range of a long PDF's pages, in place of the text. */
  function keepPages(from: number, to: number) {
    if (!longPdf) return;
    const text = pdfText(longPdf.blocks, from, to);
    setLongPdf({ ...longPdf, from, to });
    setArticle((current) => ({ ...current, text }));
    setFailure(null);
    setNotice(`Pages ${from} à ${to} du PDF : ${pastedChars(text).toLocaleString('fr-FR')} caractères.`);
  }

  /** A file picked or dropped, whatever it is, to the reading that suits it: a PDF, a recording, or screenshots. */
  function importFiles(files: readonly File[]) {
    if (!files.length) return;
    const pdf = files.find(isPdf);
    if (pdf) return void importPdf(pdf, 'import_pdf');
    const media = files.find(isMedia);
    if (media) return void importMedia(media);
    if (files.some((file) => file.type.startsWith('image/'))) return void importCaptures(files, 'import_screenshots');
    setNotice(NOT_IMPORTABLE);
  }

  function pickFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    // The same files picked again are a new choice.
    event.target.value = '';
    importFiles(files);
  }

  function dropFiles(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    importFiles([...event.dataTransfer.files]);
  }

  /**
   * A recording, into the text field: its sound is read on this device, one
   * part of fifteen minutes at most is sent for transcription, and the text
   * comes back with its times for the reader to check. A longer recording
   * asks which part first; the next ones are offered under the report.
   */
  async function importMedia(file: Blob) {
    setFailure(null);
    setShowProblem(false);
    setChoosing(null);
    setRecording(null);
    if (!isMedia(file)) return setNotice(MEDIA_NOT_MEDIA);
    if (account === null) return setNotice(MEDIA_NEEDS_ACCOUNT);
    if (view && !view.canAnalyse) return setNotice(MEDIA_NO_ANALYSIS);
    if (file.size > MAX_MEDIA_BYTES) return setNotice(MEDIA_TOO_HEAVY);
    setNotice(null);
    const seconds = await mediaDuration(file);
    if (seconds !== null && seconds > MAX_MEDIA_SECONDS) return setNotice(MEDIA_TOO_LONG);
    if (seconds !== null && partsOf(seconds) > 1) return setChoosing({ file, seconds });
    await transcribePart(file, 0);
  }

  async function transcribePart(file: Blob, part: number) {
    setChoosing(null);
    setNotice(null);
    const abort = new AbortController();
    controller.current = abort;
    setTranscribing('Lecture du son, sur cet appareil…');
    try {
      let sound: Awaited<ReturnType<typeof soundPart>>;
      try {
        sound = await soundPart(file, part);
      } catch {
        return setNotice(MEDIA_UNREADABLE);
      }
      if (abort.signal.aborted) return setNotice('Transcription annulée.');
      const total = partsOf(sound.seconds);
      setTranscribing(
        `Transcription${total > 1 ? ` de la partie ${part + 1} sur ${total}` : ''}… Comptez une minute environ.`,
      );
      const result = await transcribe(sound.wav, abort.signal);
      setRecording(part + 1 < total ? { file, seconds: sound.seconds, part } : null);
      const text = transcriptText(result.text, result.segments, part);
      if (!text.trim()) return setNotice(MEDIA_SILENT);
      setArticle((current) => ({ ...current, text }));
      setNotice(MEDIA_READ(result.seconds, part, total));
      textArea.current?.focus();
    } catch (err) {
      setNotice(abort.signal.aborted ? 'Transcription annulée.' : err instanceof ApiError ? messageForError(err) : MEDIA_UNREADABLE);
    } finally {
      controller.current = null;
      setTranscribing(null);
    }
  }

  /** Under a part's report: the next part of the same recording, in place of this text. */
  function nextPart() {
    if (!recording) return;
    const { file, part } = recording;
    setArticle(EMPTY_ARTICLE);
    setPhase({ kind: 'edit' });
    void transcribePart(file, part + 1);
  }

  async function run(article: PastedArticle, progress: Progress = { message: 'Préparation de l’analyse…', percent: 2 }) {
    // One analysis per page: a second start would only race the first.
    if (controller.current) return;
    setFailure(null);
    setNotice(null);
    const abort = new AbortController();
    controller.current = abort;
    if (readTranscript(article.text)) count('paste_transcript');
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
    setLongPdf(null);
    setPhase({ kind: 'edit' });
    setShowProblem(false);
    setRecording(null);
    setChoosing(null);
  }

  if (phase.kind === 'done' && phase.mailed) {
    return (
      <div className={`${PAGE} py-8 sm:py-14`}>
        <h1 ref={reportTop} tabIndex={-1} className={`${TITLE} outline-hidden focus-visible:ring-0`}>
          Rapport de votre e-mail
        </h1>
        <p className="mt-3 mb-10 max-w-[55ch] text-lg leading-relaxed text-muted">
          Le texte que vous avez transféré est resté dans votre messagerie : chaque constat en cite le passage.
        </p>
        <Rapport report={phase.report} blocks={[]} textElsewhere="mail" />
        <p className="mt-10 mb-0">
          <button type="button" onClick={startOver} className={QUIET_LINK}>
            Analyser un autre article
          </button>
        </p>
      </div>
    );
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
        <Rapport report={phase.report} blocks={[]} textElsewhere="link" />
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
          {recording ? (
            <button type="button" onClick={nextPart} className={QUIET_LINK}>
              Transcrire la suite ({partSpan(recording.part + 1, recording.seconds)})
            </button>
          ) : null}
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

  // While the analysis runs, the form has nothing left to offer: the page is
  // the run itself, and its one action is to stop it. The text stays in state
  // and comes back with the form if the reader cancels.
  if (phase.kind === 'running') {
    return (
      <div className={`${PAGE} py-8 sm:py-14`}>
        <h1 className={TITLE}>Analyser un article</h1>
        <p className="mt-3 mb-0 max-w-[55ch] text-lg leading-relaxed text-muted">
          Le rapport arrive en une à deux minutes.
        </p>
        <Stages progress={phase.progress} onCancel={cancel} />
      </div>
    );
  }

  return (
    <div className={`${PAGE} pt-8 sm:py-14`}>
      <h1 className={TITLE}>Analyser un article ou un message</h1>
      <p className="mt-3 mb-0 max-w-[55ch] text-lg leading-relaxed text-muted">
        Collez le texte. Le rapport arrive en une à deux minutes.
      </p>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-16">
        <form onSubmit={analyse} noValidate>
          <fieldset className="m-0 grid gap-6 border-0 p-0">
            <div>
              <div className="flex items-baseline justify-between gap-4">
                <label htmlFor="texte" className="text-base font-medium">
                  Texte de l’article ou du message
                </label>
                {!reading && !transcribing && (article.text || article.title || article.source) ? (
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
                accept="image/*,application/pdf,.pdf,audio/*,video/*"
                multiple
                hidden
                onChange={pickFiles}
                data-testid="fichier"
              />
              {/* First, before the drop zone: on a phone, what to do next is the one thing on screen. */}
              {notice ? (
                <p
                  role="status"
                  className="mt-2 mb-0 rounded-control border border-border bg-accentSoft px-4 py-3 text-sm"
                >
                  {notice}
                </p>
              ) : null}
              {reading ? (
                <ReadingPanel reading={reading} onCancel={() => controller.current?.abort()} />
              ) : transcribing ? (
                <TranscribingPanel message={transcribing} onCancel={() => controller.current?.abort()} />
              ) : choosing ? (
                <PartChooser
                  seconds={choosing.seconds}
                  onPick={(part) => void transcribePart(choosing.file, part)}
                  onCancel={() => setChoosing(null)}
                />
              ) : !article.text ? (
                // The drop is a shortcut for a mouse: the button opens the same choice from a keyboard or a phone.
                <div
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
                  }}
                  onDrop={dropFiles}
                  data-testid="depot"
                  className={`mt-3 grid gap-4 rounded-card border border-dashed px-4 py-5 transition-colors duration-150 sm:px-6 sm:py-6 ${
                    dragging ? 'border-accent bg-accentSoft' : 'border-borderControl bg-surface'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <ImportGlyph />
                    <p className="m-0 text-base font-medium">
                      Collez le texte, ou <span className="pointer-coarse:hidden">déposez un fichier ici</span>
                      <span className="hidden pointer-coarse:inline">importez un fichier</span>
                    </p>
                  </div>
                  <div className="grid gap-4 sm:pl-16">
                    <ul className="m-0 grid list-none gap-1 p-0 text-sm text-muted">
                      <li>
                        <span className="text-foreground">Captures, PDF :</span> lus sur cet appareil, rien n’est envoyé.
                      </li>
                      <li>
                        <span className="text-foreground">Son, vidéo :</span> transcrits, 15 min par analyse, avec un
                        compte.
                      </li>
                    </ul>
                    <div className="flex flex-wrap gap-3">
                      <button type="button" onClick={pasteCopied} className={`${PRIMARY_BUTTON} w-full sm:w-auto sm:whitespace-nowrap`}>
                        Coller le texte copié
                      </button>
                      <button
                        type="button"
                        onClick={() => fileInput.current?.click()}
                        className={`${SECONDARY_BUTTON} w-full sm:w-auto sm:whitespace-nowrap`}
                      >
                        Importer un fichier
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
              {longPdf && !reading ? <PdfPages pdf={longPdf} onKeep={keepPages} /> : null}
              {/* A social post was opened from where it is read: opening it again would only loop. */}
              {!article.text && webAddress(article.source) && !isSocialHost(new URL(article.source).hostname) ? (
                <OpenInBrowser address={webAddress(article.source)!} />
              ) : null}
              <textarea
                id="texte"
                ref={textArea}
                value={article.text}
                onChange={(event) => edit('text', event.target.value)}
                onPaste={pasteMarkup}
                readOnly={reading !== null || transcribing !== null}
                rows={12}
                spellCheck={false}
                aria-describedby="texte-aide"
                aria-invalid={
                  showProblem && problem !== null && problem !== 'bad_source' && problem !== 'title_too_long'
                }
                placeholder="Le texte de l’article, du chapô à la dernière phrase, ou le message reçu."
                className={`${FIELD} min-h-64 resize-y leading-relaxed`}
              />
              {chars === 0 ? (
                <ul id="texte-aide" className="mt-3 mb-0 grid list-none gap-1.5 p-0 text-sm text-muted">
                  <li>
                    <span className="text-foreground">Copie bloquée :</span> des captures d’écran qui se chevauchent un
                    peu.
                  </li>
                  <li>
                    <span className="text-foreground">WhatsApp, Facebook :</span> collez le message tel quel, un texte
                    court est analysé comme un message.
                  </li>
                  <li>
                    <span className="text-foreground">YouTube :</span> collez sa transcription (« Afficher la
                    transcription », sous la description).
                  </li>
                </ul>
              ) : (
                <p
                  id="texte-aide"
                  className={`mt-2 mb-0 text-sm ${showProblem && problem === 'too_short' ? 'text-warningInk' : 'text-muted'}`}
                >
                  {chars < MIN_TEXT_CHARS
                    ? `${chars} caractères : il en faut au moins ${MIN_TEXT_CHARS}.`
                    : chars <= MAX_MESSAGE_CHARS && !transcript
                      ? `${chars.toLocaleString('fr-FR')} caractères : analysé comme un message (de quoi il parle, qui l’affirme, ce qu’on en sait, ce qui manque).`
                      : `${chars.toLocaleString('fr-FR')} caractères.`}
                  {transcript
                    ? ' Transcription reconnue : les horodatages sont retirés du texte analysé, et chaque passage garde le sien dans le rapport.'
                    : null}
                </p>
              )}
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
            <Action account={account} empty={!article.text} refused={failure?.kind === 'signup'} />
            {view && view.canAnalyse ? <p className="mt-3 mb-0 text-sm text-muted">{view.detail}</p> : null}
          </div>
        </form>
        <Aside />
      </div>
    </div>
  );
}

const TEXT_BUTTON = 'whitespace-nowrap px-2 py-3 text-sm text-muted underline underline-offset-4 hover:text-foreground';

/** The empty field's picture: a file going up into the form. */
function ImportGlyph() {
  return (
    <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-full bg-accentSoft text-accentInk">
      <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 15V4" />
        <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
        <path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
      </svg>
    </span>
  );
}

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
        en descendant, puis « Importer un fichier »
        {os === 'android' ? ', ou partagez-les depuis Photos vers Squiggle' : ''}. Leur texte est lu sur ce
        téléphone.
      </p>
    </div>
  );
}

/** The questions a first paste raises: what it costs, where the text goes, how to have it on a phone. */
function Aside() {
  const install = useInstall();
  const os = useBrowserValue(currentPhoneOs, null);
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
 * The stages the server really runs, in order: the same three, under the same
 * names, as the extension's panel (`src/ui/components/RunScene.tsx`). A stage
 * the text does not need (no fact to look up) passes as quickly as it runs:
 * the page follows the server, it never paces itself.
 */
const STAGES: Array<[RunStep, string]> = [
  ['lecture', 'Lecture'],
  ['recherche', 'Recherche des sources'],
  ['verification', 'Vérification et note'],
];

/** The server's stage, as one of the three. The cache lookup before the reading counts as the reading's start. */
function stepOf(stage: Progress['stage']): number {
  if (stage === 'parsing_response' || stage === 'researching') return 1;
  if (stage === 'scoring' || stage === 'storing' || stage === 'success') return 2;
  return 0;
}

/**
 * The analysis running, and all the page shows while it does: the scene for
 * the stage under way, the three stages with the server's own live message
 * under the current one, and the one thing left to do, stopping it.
 */
function Stages({ progress, onCancel }: { progress: Progress; onCancel: () => void }) {
  const current = stepOf(progress.stage);
  return (
    <div className="mt-8 grid max-w-3xl items-center gap-6 rounded-card border border-border bg-surface p-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-8 sm:p-7">
      {/* Remounted on each stage, so the new loop starts from its beginning. */}
      <div key={STAGES[current][0]} className="run-scene mx-auto w-full max-w-80">
        <RunScene step={STAGES[current][0]} />
      </div>
      <div className="grid gap-5">
        <ol className="m-0 grid list-none gap-3 p-0">
          {STAGES.map(([step, label], index) => (
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
                {index === current ? (
                  <span aria-hidden="true" className="text-sm text-muted">
                    {progress.message}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
        {/* One live region for the whole run: the visible line moves from stage to stage. */}
        <p role="status" aria-live="polite" className="sr-only">
          {progress.message}
        </p>
        <button type="button" onClick={onCancel} className={`${QUIET_LINK} justify-self-start`}>
          Annuler
        </button>
      </div>
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

/** Screenshots, or a PDF, being read on the device. */
function ReadingPanel({ reading, onCancel }: { reading: Reading; onCancel: () => void }) {
  const { done, total, what } = reading;
  const item = what === 'captures' ? 'la capture' : 'la page';
  // The reader loads first, then each screenshot counts for an equal part.
  const percent = done === null ? 4 : Math.max(4, Math.round((done / total) * 100));
  return (
    <div className="mt-3 grid gap-3 rounded-control border border-border bg-surface px-4 py-4">
      <div className="flex items-baseline justify-between gap-4">
        <p role="status" aria-live="polite" className="m-0 text-base font-medium">
          {what === 'pdf'
            ? 'Lecture du PDF…'
            : done === null
              ? what === 'scan'
                ? 'Document scanné : préparation de la lecture de ses pages…'
                : 'Préparation de la lecture…'
              : `Lecture de ${item} ${Math.min(done + 1, total)} sur ${total}…`}
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
        aria-label={what === 'captures' ? 'Lecture des captures' : 'Lecture du PDF'}
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

const PAGE_FIELD = FIELD.replace('mt-2 block w-full', 'block w-24');

/** The range of a long PDF's pages to analyse: changing the first page suggests the last that fits. */
function PdfPages({ pdf, onKeep }: { pdf: LongPdf; onKeep: (from: number, to: number) => void }) {
  const [from, setFrom] = useState(pdf.from);
  const [to, setTo] = useState(pdf.to);
  const page = (value: string) => Math.min(pdf.pages, Math.max(1, Math.round(Number(value)) || 1));
  const changed = from !== pdf.from || to !== pdf.to;
  return (
    <div className="mt-3 flex flex-wrap items-end gap-3 rounded-control border border-border bg-surface px-4 py-3">
      <label className="grid gap-1 text-sm">
        De la page
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={pdf.pages}
          value={from}
          onChange={(event) => {
            const first = page(event.target.value);
            setFrom(first);
            setTo(pagesThatFit(pdf.blocks, first, pdf.pages));
          }}
          className={PAGE_FIELD}
        />
      </label>
      <label className="grid gap-1 text-sm">
        à la page
        <input
          type="number"
          inputMode="numeric"
          min={from}
          max={pdf.pages}
          value={to}
          onChange={(event) => setTo(Math.max(from, page(event.target.value)))}
          className={PAGE_FIELD}
        />
      </label>
      <button type="button" onClick={() => onKeep(from, to)} disabled={!changed} className={SECONDARY_BUTTON}>
        Garder ces pages
      </button>
    </div>
  );
}

function TranscribingPanel({ message, onCancel }: { message: string; onCancel: () => void }) {
  return (
    <div role="status" className="mt-3 grid gap-3 rounded-control border border-border bg-surface p-4">
      <p className="m-0 text-base">{message}</p>
      <p className="m-0 text-sm text-muted">
        Seul le son part, vers Mistral AI qui le transcrit ; ni le fichier ni le texte ne sont gardés.
      </p>
      <button type="button" onClick={onCancel} className={`${SECONDARY_BUTTON} justify-self-start`}>
        Annuler
      </button>
    </div>
  );
}

/** A recording longer than one analysis: which fifteen minutes first. */
function PartChooser({
  seconds,
  onPick,
  onCancel,
}: {
  seconds: number;
  onPick: (part: number) => void;
  onCancel: () => void;
}) {
  const [part, setPart] = useState(0);
  const total = partsOf(seconds);
  return (
    <div className="mt-3 grid gap-3 rounded-control border border-border bg-surface p-4">
      <label htmlFor="partie" className="m-0 text-base">
        Cet enregistrement dure {minutes(seconds)} : une analyse en couvre quinze minutes. Quelle partie d’abord ?
      </label>
      <select id="partie" value={part} onChange={(event) => setPart(Number(event.target.value))} className={FIELD}>
        {Array.from({ length: total }, (_, i) => (
          <option key={i} value={i}>
            Partie {i + 1} sur {total} : {partSpan(i, seconds)}
          </option>
        ))}
      </select>
      <p className="m-0 text-sm text-muted">Les suivantes vous seront proposées sous le rapport, une analyse chacune.</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => onPick(part)} className={`${PRIMARY_BUTTON} max-sm:w-full`}>
          Transcrire cette partie
        </button>
        <button type="button" onClick={onCancel} className={`${SECONDARY_BUTTON} max-sm:w-full`}>
          Annuler
        </button>
      </div>
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
