/**
 * The forwarding address (`src/mail/inbound.ts`), end to end in process: a
 * raw message as Cloudflare Email Routing hands it to `email()`, the queue
 * job it leaves, the report it files, and the reply Brevo is asked to send.
 *
 * The messages are built the way Gmail writes a forward (multipart, quoted-
 * printable, the « Message transféré » block), with the
 * `Authentication-Results` header Cloudflare prepends. What is pinned: an
 * account's authenticated forward gets its report by e-mail, on its own quota;
 * anything else (a stranger, a forged or unauthenticated From, a robot, our
 * own reply coming back) gets no answer at all; nothing is ever fetched.
 */
import { describe, expect, it } from 'vitest';

import { articleTextHash, plainTextBlocks, type AnalysisReport } from '@squiggle/shared';

import { magicLogin, makeTestEnv, StubLlm, type TestEnv } from './helpers';
import { mailServicesOf } from '../src/index';
import {
  MAX_INBOUND_BYTES,
  receiveEmail,
  runMailJob,
  senderAuthenticated,
  type InboundEmail,
  type MailJob,
} from '../src/mail/inbound';
import { firstLink, forwardedArticle } from '../src/mail/forwarded';
import { renderMailHtml, renderMailText } from '../src/mail/reply';
import { sanitizeNext } from '../src/auth/next';

const READER = 'marie.dupont@gmail.com';
const CLOUDFLARE_PASS =
  'mx.cloudflare.net; dkim=pass header.d=gmail.com header.s=20230601 header.b=Xy1; dmarc=pass header.from=gmail.com policy.dir=none; spf=pass (mx.cloudflare.net: domain of marie.dupont@gmail.com designates 209.85.128.41 as permitted sender) smtp.mailfrom=marie.dupont@gmail.com';

const ARTICLE = [
  'Le chômage a baissé de 12 % en un an.',
  '',
  'Tout le monde le sait.',
  '',
  // A paragraph Gmail hard-wraps in the plain-text part, as it does past 76 columns.
  'Selon le gouvernement, cette baisse tient aux réformes engagées depuis deux',
  'ans, et elle devrait se poursuivre l’an prochain si la croissance tient bon',
  'et que les entreprises continuent d’embaucher au même rythme qu’aujourd’hui.',
];

/** Quoted-printable, as Gmail encodes a text part with accented letters. */
function qp(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let out = '';
  let line = '';
  for (const byte of bytes) {
    const ch = byte === 10 ? '\n' : byte >= 33 && byte <= 126 && byte !== 61 ? String.fromCharCode(byte) : byte === 32 ? ' ' : `=${byte.toString(16).toUpperCase().padStart(2, '0')}`;
    if (ch === '\n') {
      out += `${line}\r\n`;
      line = '';
      continue;
    }
    if (line.length + ch.length > 75) {
      out += `${line}=\r\n`;
      line = '';
    }
    line += ch;
  }
  return out + line;
}

interface MessageOpts {
  from?: string;
  envelopeFrom?: string;
  /** `null` leaves the header out. */
  authResults?: string | null;
  /** Headers the sender added, above Cloudflare's. */
  extraHeaders?: string[];
  subject?: string;
  body?: string;
}

/** A Gmail forward (French interface) of a newsletter, with the reader's own note above it. */
function gmailForward(opts: MessageOpts = {}): string {
  const from = opts.from ?? READER;
  const text =
    opts.body ??
    [
      'Regarde ça, c’est vrai ?',
      '',
      '---------- Message transféré ---------',
      'De : La Lettre Éco <lettre@presse.example>',
      'Date: ven. 30 oct. 2026 à 08:02',
      'Subject: Emploi : la baisse',
      'To: <marie.dupont@gmail.com>',
      '',
      '',
      ...ARTICLE,
      '',
      '-- ',
      'La Lettre Éco, 12 rue des Exemples, Paris',
    ].join('\n');
  const html = `<div dir="ltr">${text.split('\n').map((line) => `<div>${line || '<br>'}</div>`).join('')}</div>`;
  const headers = [
    ...(opts.authResults === null ? [] : [`Authentication-Results: ${opts.authResults ?? CLOUDFLARE_PASS}`]),
    ...(opts.extraHeaders ?? []),
    'MIME-Version: 1.0',
    'Date: Sat, 31 Oct 2026 09:14:02 +0100',
    'Message-ID: <CAF1x9Q2-forward-1@mail.gmail.com>',
    `Subject: =?UTF-8?Q?Fwd=3A_Emploi_=3A_la_baisse?=`,
    `From: Marie Dupont <${from}>`,
    'To: verifier@squiggle.fr',
    'Content-Type: multipart/alternative; boundary="000000000000a1b2c3"',
  ];
  return [
    ...headers,
    '',
    '--000000000000a1b2c3',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    qp(text),
    '--000000000000a1b2c3',
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    qp(html),
    '--000000000000a1b2c3--',
    '',
  ].join('\r\n');
}

function inbound(raw: string, envelopeFrom = READER): InboundEmail & { rejected: string | null } {
  const message = {
    from: envelopeFrom,
    raw,
    rawSize: new TextEncoder().encode(raw).length,
    rejected: null as string | null,
    setReject(reason: string) {
      message.rejected = reason;
    },
  };
  return message;
}

/** The queue, as a list: the test runs a job as the consumer would. */
function fakeQueue() {
  const jobs: MailJob[] = [];
  return { jobs, queue: { send: async (job: MailJob) => void jobs.push(job) } };
}

/** Every page the server asks for, so a test can prove it asked for none. */
function recordingFetch(): { fetchImpl: typeof fetch; urls: string[] } {
  const urls: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    urls.push(String(input instanceof Request ? input.url : input));
    return new Response('<html><body><p>Page.</p></body></html>', { headers: { 'content-type': 'text/html' } });
  }) as unknown as typeof fetch;
  return { fetchImpl, urls };
}

async function withReader(opts: { fetchImpl?: typeof fetch } = {}) {
  const env = makeTestEnv({ fetchImpl: opts.fetchImpl });
  const { user } = await magicLogin(env, READER);
  env.email.sent = [];
  const { jobs, queue } = fakeQueue();
  const s = { ...mailServicesOf(env.services), mailQueue: queue };
  return { env, user, jobs, s };
}

async function analysedBlocks() {
  const article = forwardedArticle('Fwd: Emploi : la baisse', `---------- Message transféré ---------\nSubject: Emploi : la baisse\n\n${ARTICLE.join('\n')}`);
  return plainTextBlocks(article.title, article.text);
}

describe('a reader’s forward', () => {
  it('is audited at once, finished from the queue, and answered with the report’s link', async () => {
    const { fetchImpl, urls } = recordingFetch();
    const { env, user, jobs, s } = await withReader({ fetchImpl });

    expect(await receiveEmail(s, inbound(gmailForward()))).toBe('queued');
    // Only the run travels: no text in the job.
    expect(jobs).toHaveLength(1);
    expect(Object.keys(jobs[0]).sort()).toEqual(['inReplyTo', 'researchable', 'runId', 'userId']);
    expect(jobs[0].userId).toBe(user.id);
    expect(env.llm.calls.complete).toBe(1);
    expect(env.email.sent).toHaveLength(0);

    await runMailJob(s, jobs[0], { lastAttempt: false });

    expect(env.email.sent).toHaveLength(1);
    const reply = env.email.sent[0];
    expect(reply.to).toBe(READER);
    expect(reply.subject).toBe('Rapport Squiggle : Emploi : la baisse');
    expect(reply.headers).toEqual({
      'Auto-Submitted': 'auto-replied',
      'In-Reply-To': '<CAF1x9Q2-forward-1@mail.gmail.com>',
      References: '<CAF1x9Q2-forward-1@mail.gmail.com>',
    });
    expect(reply.html).toContain('L&#39;article avance un chiffre sans le sourcer.');

    // The link names the report by the fingerprint of the text the audit read,
    // the same blocks a paste of that text on the site gives.
    const fingerprint = await articleTextHash(await analysedBlocks());
    expect(reply.html).toContain(`href="https://squiggle.fr/analyser?rapport=${fingerprint}"`);
    // The plain-text part says the same, with the link spelled out.
    expect(reply.text).toMatch(/^RAPPORT SQUIGGLE\nEmploi : la baisse\n\n\d+\/100 - /);
    expect(reply.text).toContain(`Voir le rapport complet : https://squiggle.fr/analyser?rapport=${fingerprint}`);

    // The report is filed and opens on the reader's session, at no credit.
    const { sessionCookie } = await magicLogin(env, READER);
    const check = await env.handler(
      new Request(`${env.webAppOrigin}/web/analyze/check?text=${fingerprint}`, {
        headers: { cookie: sessionCookie, 'sec-fetch-site': 'same-origin' },
      }),
    );
    const body = (await check.json()) as { hit: boolean };
    expect(body.hit).toBe(true);

    // One credit, and the research ran: nothing else was fetched.
    expect(await env.db.countAnalysesSince(user.id, 0)).toBe(1);
    expect(env.llm.calls.grounded).toBe(jobs[0].researchable.length);
    expect(urls).toEqual([]);
  });

  it('keeps only the forwarded text: not the reader’s note, the header block nor the signature', () => {
    const article = forwardedArticle('Fwd: Emploi : la baisse', [
      'Regarde ça',
      '',
      '---------- Forwarded message ---------',
      'From: La Lettre <lettre@presse.example>',
      'Date: Fri, Oct 30, 2026 at 8:02 AM',
      'Subject: Fwd: Emploi : la baisse',
      'To: <marie.dupont@gmail.com>',
      '',
      ...ARTICLE,
      '-- ',
      'Marie',
    ].join('\n'));
    expect(article.title).toBe('Emploi : la baisse');
    expect(article.text.split('\n')).toEqual([
      'Le chômage a baissé de 12 % en un an.',
      'Tout le monde le sait.',
      'Selon le gouvernement, cette baisse tient aux réformes engagées depuis deux ans, et elle devrait se poursuivre l’an prochain si la croissance tient bon et que les entreprises continuent d’embaucher au même rythme qu’aujourd’hui.',
    ]);
  });

  it('reads Apple Mail’s and Outlook’s forwards, and a message written without one', () => {
    const apple = forwardedArticle('Fwd: Titre', ['Début du message réexpédié :', '', 'De: X <x@y.example>', 'Objet: Le vrai titre', 'Date: 30 octobre 2026', 'À: Moi <m@z.example>', '', 'Le texte.'].join('\n'));
    expect(apple).toEqual({ title: 'Le vrai titre', text: 'Le texte.' });
    const outlook = forwardedArticle('TR: Titre', ['Ma note', '________________________________', 'De : X', 'Envoyé : vendredi 30 octobre 2026 08:02', 'À : Moi', 'Objet : Chaîne', '', 'Transférez à tous vos contacts !'].join('\n'));
    expect(outlook).toEqual({ title: 'Chaîne', text: 'Transférez à tous vos contacts !' });
    expect(forwardedArticle('RE: TR: Fwd: Sujet', 'Un texte.\n> pas cité')).toEqual({ title: 'Sujet', text: 'Un texte.\n> pas cité' });
  });

  it('spends the account’s own quota: a reader without analyses left is told so, and nothing is audited', async () => {
    const { env, user, jobs, s } = await withReader();
    for (let i = 0; i < 3; i += 1) await env.db.recordAnalysis({ userId: user.id, now: env.clock.now() });

    expect(await receiveEmail(s, inbound(gmailForward()))).toBe('refused');
    expect(jobs).toHaveLength(0);
    expect(env.llm.calls.complete).toBe(0);
    expect(env.email.sent).toHaveLength(1);
    expect(env.email.sent[0].html).toContain('href="https://squiggle.fr/compte"');
  });

  it('answers a message that is only a link without requesting it', async () => {
    const { fetchImpl, urls } = recordingFetch();
    const { env, jobs, s } = await withReader({ fetchImpl });
    const raw = gmailForward({ body: 'https://presse.example/emploi-2026\n\nEnvoyé de mon iPhone' });

    expect(await receiveEmail(s, inbound(raw))).toBe('link_unknown');
    expect(jobs).toHaveLength(0);
    expect(env.email.sent[0].subject).toBe('Squiggle ne va pas chercher les pages des liens');
    expect(urls).toEqual([]);
    expect(env.llm.calls.complete).toBe(0);
    expect(firstLink('Lire (https://presse.example/a).')).toBe('https://presse.example/a');
  });

  it('analyses a short chain forwarded on its own as a message, not as an article', async () => {
    const { env, jobs, s } = await withReader();
    const chain = [
      '---------- Message transféré ---------',
      'De : Tata <tata@example.org>',
      'Subject: URGENT',
      '',
      'URGENT ⚠️ à partir du 1er novembre la CAF supprime les APL pour les retraités propriétaires. Transférez à tous vos contacts !',
      '',
      'Envoyé de mon iPhone',
    ].join('\n');
    expect(await receiveEmail(s, inbound(gmailForward({ body: chain })))).toBe('queued');
    const prompt = [env.llm.completeOptions[0].systemPrompt, ...env.llm.completeOptions[0].messages.map((m) => m.content)].join('\n');
    expect(prompt).toContain('MESSAGE COURT');
    expect(prompt).not.toContain('Envoyé de mon iPhone');
    await runMailJob(s, jobs[0], { lastAttempt: false });
    expect(env.email.sent[0].subject).toBe('Rapport Squiggle : URGENT');
  });

  it('answers a message that says nothing', async () => {
    const { env, s } = await withReader();
    expect(await receiveEmail(s, inbound(gmailForward({ body: 'Merci !' })))).toBe('too_short');
    expect(env.email.sent).toHaveLength(1);
    expect(env.llm.calls.complete).toBe(0);
  });

  it('tells the reader when the last attempt fails, and consumes nothing', async () => {
    const { env, user, jobs, s } = await withReader();
    await receiveEmail(s, inbound(gmailForward()));
    const job = { ...jobs[0], runId: 'not-a-run' };

    await expect(runMailJob(s, job, { lastAttempt: false })).rejects.toThrow();
    expect(env.email.sent).toHaveLength(0);
    await runMailJob(s, job, { lastAttempt: true });
    expect(env.email.sent).toHaveLength(1);
    expect(env.email.sent[0].subject).toBe('Squiggle n’a pas pu analyser votre message');
    expect(await env.db.countAnalysesSince(user.id, 0)).toBe(0);
  });

  it('charges once when a job that already finalized runs again', async () => {
    const { env, jobs, s } = await withReader();
    await receiveEmail(s, inbound(gmailForward()));
    await runMailJob(s, jobs[0], { lastAttempt: false });
    await runMailJob(s, jobs[0], { lastAttempt: false });
    // The second is the retry after a send that failed: it answers again, it does not charge again.
    expect(env.email.sent).toHaveLength(2);
    expect(env.email.sent[1].html).toBe(env.email.sent[0].html);
  });
});

describe('a message that is not a reader’s', () => {
  async function silent(env: TestEnv, outcome: Promise<string>, expected: string) {
    const audits = env.llm.calls.complete;
    expect(await outcome).toBe(expected);
    expect(env.email.sent).toHaveLength(0);
    expect(env.llm.calls.complete).toBe(audits);
  }

  it('from an address with no account gets no answer', async () => {
    const { env, s } = await withReader();
    const raw = gmailForward({
      from: 'inconnu@gmail.com',
      authResults: CLOUDFLARE_PASS.replaceAll('marie.dupont', 'inconnu'),
    });
    await silent(env, receiveEmail(s, inbound(raw, 'inconnu@gmail.com')), 'unknown_sender');
  });

  it('with a reader’s From but no Cloudflare authentication gets no answer', async () => {
    const { env, s } = await withReader();
    await silent(env, receiveEmail(s, inbound(gmailForward({ authResults: null }))), 'unauthenticated');
    const failed = 'mx.cloudflare.net; dkim=fail header.d=gmail.com; dmarc=fail header.from=gmail.com; spf=softfail smtp.mailfrom=spam@relay.example';
    await silent(env, receiveEmail(s, inbound(gmailForward({ authResults: failed }))), 'unauthenticated');
  });

  it('cannot pass with an Authentication-Results header of its own below a failing one', async () => {
    const { env, s } = await withReader();
    const raw = gmailForward({
      authResults: 'mx.cloudflare.net; dkim=none; dmarc=none; spf=none smtp.mailfrom=spam@relay.example',
      extraHeaders: [`Authentication-Results: ${CLOUDFLARE_PASS}`],
    });
    await silent(env, receiveEmail(s, inbound(raw, 'spam@relay.example')), 'unauthenticated');
  });

  it('cannot borrow another domain’s pass: the passing domain must be the From domain', () => {
    const headers = (value: string) => ({ headers: [{ key: 'authentication-results', originalKey: 'Authentication-Results', value }] });
    expect(senderAuthenticated(headers('mx.cloudflare.net; dkim=pass header.d=spam.example; dmarc=none; spf=pass smtp.mailfrom=x@spam.example'), 'gmail.com')).toBe(false);
    expect(senderAuthenticated(headers('mx.cloudflare.net; dmarc=pass header.from=spam.example'), 'gmail.com')).toBe(false);
    expect(senderAuthenticated(headers('relay.example; dmarc=pass header.from=gmail.com'), 'gmail.com')).toBe(false);
    expect(senderAuthenticated(headers('mx.cloudflare.net; dkim=pass header.d=mail.example.org; dmarc=none'), 'example.org')).toBe(true);
    expect(senderAuthenticated(headers('mx.cloudflare.net; spf=pass smtp.mailfrom=bounce@example.org; dmarc=none'), 'example.org')).toBe(true);
  });

  it('from a robot or a list gets no answer: a bounce, an out-of-office, a list’s own mail', async () => {
    const { env, s } = await withReader();
    await silent(env, receiveEmail(s, inbound(gmailForward(), '')), 'automatic');
    for (const header of ['Auto-Submitted: auto-replied', 'Precedence: bulk', 'X-Autoreply: yes', 'List-Id: <lettre.presse.example>']) {
      await silent(env, receiveEmail(s, inbound(gmailForward({ extraHeaders: [header] }))), 'automatic');
    }
  });

  it('that is our own reply coming back is dropped, which is what ends a loop', async () => {
    const { env, jobs, s } = await withReader();
    await receiveEmail(s, inbound(gmailForward()));
    await runMailJob(s, jobs[0], { lastAttempt: false });
    const ours = env.email.sent[0];
    env.email.sent = [];

    // The reply, auto-forwarded by the reader's mailbox straight back to the address.
    const bounced = gmailForward({ extraHeaders: [`Auto-Submitted: ${ours.headers?.['Auto-Submitted']}`], body: ours.html });
    await silent(env, receiveEmail(s, inbound(bounced)), 'automatic');
    // And anything From our own domain, forged or not.
    const own = gmailForward({ from: 'no-reply@squiggle.fr', authResults: 'mx.cloudflare.net; dmarc=pass header.from=squiggle.fr' });
    await silent(env, receiveEmail(s, inbound(own, 'no-reply@squiggle.fr')), 'own_domain');
  });

  it('over the size cap is refused at the SMTP stage, before it is parsed', async () => {
    const { env, s } = await withReader();
    const message = inbound(gmailForward());
    message.rawSize = MAX_INBOUND_BYTES + 1;
    await silent(env, receiveEmail(s, message), 'too_large');
    expect(message.rejected).toBeTruthy();
  });
});

describe('the reply’s link', () => {
  it('survives the sign-in, by its fingerprint and nothing else', () => {
    const fingerprint = 'a'.repeat(64);
    expect(sanitizeNext(`/analyser?rapport=${fingerprint}`)).toBe(`/analyser?rapport=${fingerprint}`);
    expect(sanitizeNext(`/analyser?rapport=${fingerprint}&x=1`)).toBe(`/analyser?rapport=${fingerprint}`);
    expect(sanitizeNext('/analyser?rapport=not-a-hash')).toBe('/analyser');
  });

  it('is not promised by a server without a provider: the reader is told instead', async () => {
    const env = makeTestEnv({ llm: new StubLlm() });
    await magicLogin(env, READER);
    env.email.sent = [];
    const s = { ...mailServicesOf(env.services), llm: undefined };
    expect(await receiveEmail(s, inbound(gmailForward()))).toBe('unconfigured');
    expect(env.email.sent).toHaveLength(1);
  });
});

describe('the reply’s body', () => {
  const report = (summary: string, textLengthChars: number) =>
    ({
      score: 58,
      scoreBand: 'problematique',
      summary,
      findings: [
        { id: 'f1', category: 'cadrage', severity: 1, label: 'Mot chargé', quote: 'un désastre', explanation: 'Le mot juge.' },
        { id: 'f2', category: 'affirmation-non-etayee', severity: 3, label: 'Chiffre sans source', quote: '<b>12 %</b>', explanation: 'D’où ?' },
        { id: 'f3', category: 'point-fort', severity: 1, label: 'Citation attribuée', quote: '', explanation: 'La ministre est nommée.' },
      ],
      claims: [{ verification: 'douteuse' }],
      research: { performed: true, queries: [], withdrawn: [] },
      meta: { textLengthChars },
    }) as unknown as AnalysisReport;

  it('puts the most severe passage first, escapes what the article wrote, and keeps the strength apart', () => {
    const content = { heading: 'Emploi', report: report('Synthèse.', 5000) };
    const html = renderMailHtml(content);
    expect(html).toContain('&#60;b&#62;12 %&#60;/b&#62;');
    expect(html).not.toContain('<b>12 %');
    expect(html.indexOf('Chiffre sans source')).toBeLessThan(html.indexOf('Mot chargé'));
    expect(html.indexOf('Mot chargé')).toBeLessThan(html.indexOf('Citation attribuée'));
    expect(renderMailText(content)).toContain('58/100 - Article problématique\n');
    expect(renderMailText(content)).toContain('Affirmations : 1 douteuse.');
  });

  it('reads a short message’s four lines as four answers', () => {
    const summary = "De quoi parle-t-on : un rappel.\nQui l'affirme : personne.\nCe qu'on en sait : rien.\nCe qui manque : une source.";
    const content = { heading: 'Chaîne', report: report(summary, 300) };
    expect(renderMailText(content)).toContain('58/100 - Message problématique\n');
    expect(renderMailText(content)).toContain('Qui l’affirme : personne.\nCe qu’on en sait : rien.');
    expect(renderMailHtml(content)).toContain('>Ce qui manque</p>');
  });
});
