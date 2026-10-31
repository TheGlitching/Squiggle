/**
 * The e-mails: the weekly report, the alerts, and the notice of a fresh piece
 * of substance's posts. Brevo's transactional API, on a key of its own (not the
 * server's). Plain text, readable on a phone, no attachment. Replies go to
 * `routine@squiggle.fr`, which the reply Worker reads.
 */
import { REPLY_TO, REPORT_FROM, REPORT_TO } from './config';
import { fetchJson, type Ctx } from './context';

export async function sendMail(ctx: Ctx, subject: string, text: string): Promise<void> {
  const prefix = ctx.dry ? '[À BLANC] ' : '';
  await fetchJson(ctx, 'Brevo', 'https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': ctx.secrets.brevoKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: 'Squiggle', email: REPORT_FROM },
      to: [{ email: REPORT_TO }],
      replyTo: { email: REPLY_TO },
      subject: `${prefix}${subject}`.slice(0, 200),
      textContent: text,
    }),
  });
}

/** An alert goes once, then not again for three days for the same cause. */
export async function alert(ctx: Ctx, key: string, subject: string, text: string): Promise<boolean> {
  const last = ctx.db.get<{ sent_at: string }>('SELECT sent_at FROM alerts WHERE key = ?', key);
  if (last && Date.parse(last.sent_at) > ctx.now.getTime() - 3 * 86_400_000) return false;
  await sendMail(ctx, `Squiggle, alerte : ${subject}`, `${text}\n\nRépondre « stop » à cet e-mail suspend la routine.`);
  ctx.db.run('INSERT INTO alerts (key, sent_at) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET sent_at = excluded.sent_at', key, ctx.now.toISOString());
  return true;
}
