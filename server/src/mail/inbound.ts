/**
 * The forwarding address: a reader forwards an e-mail (a newsletter, an
 * article, a chain letter) to `verifier@squiggle.fr` and gets back, by e-mail,
 * the report's summary and its link.
 *
 * Cloudflare Email Routing hands each message to the Worker's `email()`
 * handler, which lands in {@link receiveEmail}. The audit runs there, in one
 * model call, so the article's text never leaves this process: what is queued
 * for later is the run's id, never its text. The research and the reply then
 * run from the queue ({@link runMailJob}), where a Worker has fifteen minutes,
 * which an analysis needs and an e-mail event is not documented to give.
 *
 * An address that receives mail receives spam and forged senders, so a
 * message only spends anything once it has cleared, in this order:
 *
 *  1. its size, refused at the SMTP stage, which says nothing about accounts;
 *  2. no bounce, automatic reply or mailing list, and nothing from our own
 *     domain: that is what keeps two robots from answering each other;
 *  3. a sender Cloudflare authenticated, DMARC, or DKIM or SPF aligned with
 *     the From domain, read from the `Authentication-Results` header Cloudflare
 *     itself prepends: anyone can write a From line, and an unauthenticated one
 *     would let a stranger spend a reader's analyses;
 *  4. a From address that is a verified Squiggle account.
 *
 * A message that fails 2 to 4 is dropped without an answer. Answering it would
 * send mail to an address someone else wrote (backscatter), and refusing it at
 * the SMTP stage would tell any sender which addresses have an account. From
 * there on the sender is our reader, and every outcome gets a reply: the
 * account's own quota and ceilings are the analysis stages' own.
 *
 * The server still never fetches the article: it reads the text the reader
 * sent, attachments are ignored, and a message that is only a link is looked
 * up among the reports already filed. The sender's address is in no log line
 * and no counter (`lib/log.ts`); a line names the account id and the outcome.
 */
import PostalMime, { type Email, type RawEmail } from 'postal-mime';
import {
  MIN_MESSAGE_CHARS,
  plainTextBlocks,
  type BaseLLMClient,
} from '@squiggle/shared';

import {
  analyzeAudit,
  analyzeFinalize,
  analyzeLink,
  analyzeResearch,
  runReport,
  type AnalyzeServices,
} from '../analyze/stages';
import { PastedAuditRequestSchema } from '../analyze/schemas';
import { parseRunState } from '../analyze/runState';
import type { Db, UserRow } from '../db/types';
import type { EmailSender } from '../lib/brevo';
import type { Clock } from '../lib/clock';
import type { ApiError } from '../lib/errors';
import { logEvent, newRequestId } from '../lib/log';
import { parseXLink } from '../x/client';
import { readXThread, type XServices, type XThread } from '../x/thread';
import { domainOf, isAutomatic, senderAuthenticated } from './authenticated';
import { firstLink, forwardedArticle, withoutLinks } from './forwarded';
import { renderMailHtml, renderMailText, type MailContent } from './reply';

/** The address readers forward to. Routed to this Worker in Cloudflare (docs/DEPLOYING.md). */
export const MAIL_IN_ADDRESS = 'verifier@squiggle.fr';

/**
 * Largest message accepted, attachments included. A forwarded newsletter is
 * tens of kilobytes; the cap keeps a parse inside the Worker's CPU budget.
 */
export const MAX_INBOUND_BYTES = 2 * 1024 * 1024;

/** How many times the queue runs a job before the reader is told it failed. */
export const MAIL_JOB_ATTEMPTS = 3;

/** Our own domain: mail from it is our own reply coming back, or a forgery. */
const OWN_DOMAIN = 'squiggle.fr';

/** The part of Cloudflare's `ForwardableEmailMessage` this module reads. */
export interface InboundEmail {
  /** Envelope MAIL FROM. Empty for a bounce. */
  from: string;
  raw: RawEmail;
  rawSize: number;
  setReject(reason: string): void;
}

export { senderAuthenticated };

/** What the queue carries: the run, never its text. */
export interface MailJob {
  runId: string;
  userId: string;
  researchable: string[];
  /** The forwarded message's Message-ID, so the reply lands in its thread. */
  inReplyTo?: string;
}

export interface MailQueue {
  send(job: MailJob): Promise<void>;
}

export interface MailServices {
  db: Db;
  clock: Clock;
  email: EmailSender;
  webAppOrigin: string;
  llm?: () => BaseLLMClient;
  promptVersion: string;
  fetchImpl?: typeof fetch;
  /** Reads publications on X; absent, a link to X is looked up like any other. */
  x?: XServices;
  /** The queue the research runs from. Absent (tests, local), the job runs at once. */
  mailQueue?: MailQueue;
}

/** What became of a message: logged as the line's `code`, and what the tests assert on. */
export type MailOutcome =
  | 'too_large'
  | 'unreadable'
  | 'automatic'
  | 'own_domain'
  | 'unauthenticated'
  | 'unknown_sender'
  | 'unconfigured'
  | 'too_short'
  | 'link_report'
  | 'link_unknown'
  | 'refused'
  | 'queued'
  | 'analysed';

export async function receiveEmail(s: MailServices, message: InboundEmail): Promise<MailOutcome> {
  const requestId = newRequestId();
  const outcome = await receive(s, message, requestId);
  logEvent({ event: 'mail_received', requestId, userId: outcome.userId, code: outcome.code });
  return outcome.code;
}

async function receive(
  s: MailServices,
  message: InboundEmail,
  requestId: string,
): Promise<{ code: MailOutcome; userId?: string }> {
  if (message.rawSize > MAX_INBOUND_BYTES) {
    message.setReject('Message trop volumineux pour Squiggle.');
    return { code: 'too_large' };
  }

  let email: Email;
  try {
    email = await PostalMime.parse(message.raw, { attachmentEncoding: 'arraybuffer' });
  } catch {
    return { code: 'unreadable' };
  }

  if (!message.from || isAutomatic(email)) return { code: 'automatic' };
  const from = email.from?.address?.trim().toLowerCase();
  if (!from || email.headers.filter((h) => h.key === 'from').length !== 1) return { code: 'unauthenticated' };
  const fromDomain = domainOf(from);
  if (fromDomain === OWN_DOMAIN || fromDomain.endsWith(`.${OWN_DOMAIN}`)) return { code: 'own_domain' };
  if (!senderAuthenticated(email, fromDomain)) return { code: 'unauthenticated' };

  const user = await s.db.getUserByEmail(from);
  if (!user || !user.emailVerified || !user.email) return { code: 'unknown_sender' };

  // From here on the sender is a reader, and every outcome is answered.
  const reply = (subject: string, content: Omit<MailContent, 'heading'>) =>
    sendReply(s, user, { subject, content: { heading: subject, ...content }, inReplyTo: email.messageId });

  if (!s.llm) {
    await reply('Squiggle n’a pas pu lire votre message', {
      paragraphs: ['Le service d’analyse est momentanément indisponible. Réessayez plus tard.'],
    });
    return { code: 'unconfigured', userId: user.id };
  }
  const analyze: AnalyzeServices = {
    db: s.db,
    clock: s.clock,
    llm: s.llm,
    promptVersion: s.promptVersion,
    fetchImpl: s.fetchImpl,
    requestId,
    surface: 'email',
  };

  let article = forwardedArticle(email.subject, email.text);

  // A message that is only a link to a publication on X: the publication (and
  // its thread) is read from X, then analysed as the short message it is.
  let fromX: XThread | undefined;
  if (s.x && withoutLinks(article.text).length < MIN_MESSAGE_CHARS) {
    const link = firstLink(article.text);
    const target = link ? parseXLink(link) : null;
    if (target) {
      const read = await readXThread({ db: s.db, clock: s.clock, x: s.x, requestId }, user.id, target.id);
      if (!read.ok) {
        await reply('Squiggle n’a pas pu lire cette publication X', {
          paragraphs: [read.message],
        });
        return { code: 'link_unknown', userId: user.id };
      }
      fromX = read;
      article = { ...article, title: read.title, text: read.text };
    }
  }
  const title = article.title.slice(0, 500);
  const blocks = plainTextBlocks(title, article.text);

  // What the message says once its links are set aside. A text this short
  // claims nothing; a text of any length above it is analysed, as a short
  // message (a chain, a post) or as an article, which the audit reads from
  // its length alone, as it does for a paste.
  if (!fromX && withoutLinks(article.text).length < MIN_MESSAGE_CHARS) {
    const link = firstLink(article.text);
    if (!link) {
      await reply('Squiggle n’a pas trouvé de texte dans votre message', {
        paragraphs: [
          `Transférez l’e-mail qui contient le texte, l’article ou le message reçu : il faut au moins ${MIN_MESSAGE_CHARS} caractères pour une analyse.`,
        ],
      });
      return { code: 'too_short', userId: user.id };
    }
    const found = await analyzeLink(analyze, link);
    if (found.ok && found.hit) {
      const action = { href: `${s.webAppOrigin}/analyser?url=${encodeURIComponent(link)}`, label: REPORT_LABEL };
      await sendReply(s, user, {
        subject: 'Le rapport Squiggle de votre lien',
        content: found.report
          ? { heading: 'Cet article a déjà été analysé', report: found.report, action }
          : { heading: 'Le rapport Squiggle de votre lien', paragraphs: ['Cet article a déjà été analysé par Squiggle.'], action },
        inReplyTo: email.messageId,
      });
      return { code: 'link_report', userId: user.id };
    }
    await reply('Squiggle ne va pas chercher les pages des liens', {
      paragraphs: [
        'Votre message ne contient qu’un lien, et Squiggle ne va jamais chercher une page : il lit le texte qu’on lui envoie.',
        'Ouvrez l’article, copiez son texte dans un e-mail et transférez-le de nouveau, ou analysez la page avec l’extension Squiggle.',
      ],
    });
    return { code: 'link_unknown', userId: user.id };
  }

  const payload = PastedAuditRequestSchema.safeParse({ title, blocks, url: fromX?.url });
  if (!payload.success) {
    await reply('Squiggle n’a pas pu lire votre message', {
      paragraphs: ['Ce message n’a pas pu être lu comme un article. Transférez l’article seul, sans le reste de la conversation.'],
    });
    return { code: 'refused', userId: user.id };
  }

  const audited = await analyzeAudit(analyze, user, payload.data);
  if (!audited.ok) {
    const subject = BILLING_CODES.has(audited.code)
      ? 'Plus d’analyse disponible sur votre compte Squiggle'
      : 'Squiggle n’a pas pu analyser votre message';
    await reply(subject, refusalContent(s, audited));
    return { code: 'refused', userId: user.id };
  }

  const job: MailJob = { runId: audited.runId, userId: user.id, researchable: audited.researchable, inReplyTo: email.messageId };
  if (s.mailQueue) {
    await s.mailQueue.send(job);
    return { code: 'queued', userId: user.id };
  }
  await runMailJob(s, job, { lastAttempt: true });
  return { code: 'analysed', userId: user.id };
}

/**
 * The rest of the analysis, from the queue: every researchable finding, then
 * the finalize that files the report and consumes the credit, then the reply.
 * Every stage is safe to run again (a finding already researched is not paid
 * twice, a run finalizes once), so a failed attempt is simply retried; the
 * last one tells the reader instead.
 */
export async function runMailJob(s: MailServices, job: MailJob, opts: { lastAttempt: boolean }): Promise<void> {
  const requestId = newRequestId();
  const user = await s.db.getUserById(job.userId);
  // The account was erased while its analysis ran: nobody is left to answer.
  if (!user?.email || !s.llm) return;
  const analyze: AnalyzeServices = {
    db: s.db,
    clock: s.clock,
    llm: s.llm,
    promptVersion: s.promptVersion,
    fetchImpl: s.fetchImpl,
    requestId,
    surface: 'email',
  };

  try {
    // One at a time, as the clients drive it: a failed finding is left
    // unverified by the stage itself, and the report says so.
    for (const findingId of job.researchable) {
      await analyzeResearch(analyze, user, { runId: job.runId, findingId });
    }
    const finalized = await analyzeFinalize(analyze, user, { runId: job.runId });
    if (!finalized.ok && finalized.code !== 'run_already_finalized') throw new Error(finalized.code);

    const run = await s.db.getAnalysisRun(job.runId);
    const state = run && parseRunState(run.state);
    if (!state?.textHash) throw new Error('run_not_found');
    const titled = state.title && state.title !== 'Article sans titre';
    await sendReply(s, user, {
      subject: titled ? `Rapport Squiggle : ${state.title}` : 'Votre rapport Squiggle',
      content: {
        heading: titled ? state.title : 'Votre texte analysé',
        // A retried job finds the run already finalized: the same report, rebuilt from the run.
        report: finalized.ok ? finalized.report : runReport(state, s.clock.now()),
        action: { href: `${s.webAppOrigin}/analyser?rapport=${state.textHash}`, label: REPORT_LABEL },
      },
      inReplyTo: job.inReplyTo,
    });
    logEvent({ event: 'mail_replied', requestId, userId: user.id });
  } catch (err) {
    if (!opts.lastAttempt) throw err;
    logEvent({ event: 'mail_replied', requestId, userId: user.id, code: 'failed' });
    await sendReply(s, user, {
      subject: 'Squiggle n’a pas pu analyser votre message',
      content: {
        heading: 'Squiggle n’a pas pu analyser votre message',
        paragraphs: ['L’analyse n’a pas abouti, et aucune analyse ne vous a été décomptée. Transférez de nouveau le message dans quelques minutes.'],
      },
      inReplyTo: job.inReplyTo,
    });
  }
}

/** A bounce, an out-of-office, a list's own mail: none of these was sent by a reader. */
const BILLING_CODES = new Set(['trial_exhausted', 'subscription_required', 'quota_exhausted', 'starts_exhausted', 'quota_exceeded']);

function refusalContent(s: MailServices, refusal: ApiError): Omit<MailContent, 'heading'> {
  if (BILLING_CODES.has(refusal.code)) {
    return { paragraphs: [refusal.message], action: { href: `${s.webAppOrigin}/compte`, label: 'Voir mon compte' } };
  }
  return { paragraphs: [refusal.message] };
}

const REPORT_LABEL = 'Voir le rapport complet';

/** A Message-ID as it may travel into a header we write: no folding, no second header. */
const MESSAGE_ID = /^<[^<>\s]{1,250}>$/;

/**
 * One reply, always to the account's own address, never to an address the
 * message named. It says it is automatic (RFC 3834), so a well-behaved
 * auto-responder does not answer it, and our own `isAutomatic` drops it if it
 * ever comes back.
 */
async function sendReply(
  s: MailServices,
  user: UserRow,
  reply: { subject: string; content: MailContent; inReplyTo?: string },
): Promise<void> {
  if (!user.email) return;
  const headers: Record<string, string> = { 'Auto-Submitted': 'auto-replied' };
  if (reply.inReplyTo && MESSAGE_ID.test(reply.inReplyTo)) {
    headers['In-Reply-To'] = reply.inReplyTo;
    headers.References = reply.inReplyTo;
  }
  const subject = reply.subject.replace(/\s+/g, ' ').trim().slice(0, 200);
  await s.email.send({
    to: user.email,
    subject,
    html: renderMailHtml(reply.content),
    text: renderMailText(reply.content),
    headers,
  });
}
