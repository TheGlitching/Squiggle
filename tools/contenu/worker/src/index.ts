/**
 * `routine@squiggle.fr`: where the owner answers the weekly report, in free
 * French, from a phone. Cloudflare Email Routing hands each message to this
 * Worker, which keeps only what the owner wrote and files it in KV; the routine
 * on the VPS reads it through Cloudflare's API, so the VPS opens no port.
 *
 * A message is kept only when it clears, in this order, the same checks as the
 * forwarding address (`server/src/mail/authenticated.ts`, shared rather than
 * copied):
 *  1. a size a reply has;
 *  2. not a bounce, an automatic reply or a mailing list;
 *  3. a From address that is one of the owner's (`OWNER_SENDERS`);
 *  4. that From domain authenticated by Cloudflare (DMARC, or DKIM or SPF aligned).
 * Anything else is dropped without an answer: answering would send mail to an
 * address someone else wrote. Attachments are never stored, only the text the
 * owner typed, without the quoted report under it.
 */
import PostalMime from 'postal-mime';

import { domainOf, isAutomatic, senderAuthenticated } from '../../../../server/src/mail/authenticated';
import { OWNER_SENDERS } from '../../src/owners';

export interface Env {
  REPONSES: KVNamespace;
}

/** A reply is a few lines; the report it quotes is under 100 kB. */
export const MAX_BYTES = 512 * 1024;
/** Kept long enough for a missed week; the routine files what it read in its own database. */
const TTL_SECONDS = 90 * 86_400;

export type Outcome = 'kept' | 'too_large' | 'unreadable' | 'automatic' | 'not_owner' | 'unauthenticated' | 'empty';

/**
 * What the owner wrote, without what they quoted: the lines starting with `>`,
 * and everything from the « Le … a écrit : » line a mail client puts above the quote.
 */
export function ownText(text: string): string {
  const lines: string[] = [];
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    if (/^\s*>/.test(line)) break;
    if (/^\s*(le|on)\b.{0,200}(a écrit|wrote)\s*:\s*$/i.test(line)) break;
    if (/^-{2,}\s*(original message|message d.origine)/i.test(line)) break;
    lines.push(line);
  }
  return lines.join('\n').trim().slice(0, 4000);
}

export async function receive(message: { from: string; raw: ReadableStream | ArrayBuffer | string; rawSize: number }, env: Env, now = new Date()): Promise<Outcome> {
  if (message.rawSize > MAX_BYTES) return 'too_large';
  let email;
  try {
    email = await PostalMime.parse(message.raw, { attachmentEncoding: 'arraybuffer' });
  } catch {
    return 'unreadable';
  }
  if (!message.from || isAutomatic(email)) return 'automatic';
  const from = email.from?.address?.toLowerCase() ?? '';
  if (!(OWNER_SENDERS as readonly string[]).includes(from)) return 'not_owner';
  if (!senderAuthenticated(email, domainOf(from))) return 'unauthenticated';
  const text = ownText(email.text ?? (email.html ?? '').replace(/<[^>]+>/g, ' '));
  if (!text) return 'empty';
  const key = `reponse:${now.toISOString()}:${crypto.randomUUID()}`;
  await env.REPONSES.put(key, JSON.stringify({ receivedAt: now.toISOString(), from, subject: (email.subject ?? '').slice(0, 200), text }), { expirationTtl: TTL_SECONDS });
  return 'kept';
}

export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    const outcome = await receive(message, env);
    // The outcome alone: never the sender, never a word of the message.
    console.log(JSON.stringify({ event: 'routine_reply', outcome }));
  },
} satisfies ExportedHandler<Env>;
