/**
 * The only way a commercial e-mail may leave: to an account whose accord is
 * live, with an unsubscribe link and the one-click headers (RFC 8058).
 *
 * Everything else the server sends is a service message, which needs no accord
 * and carries no such link: the login code (`auth/magicLink.ts`), the
 * confirmation of a new address (`account/manage.ts`), and the answer to a
 * message the reader forwarded (`mail/inbound.ts`). No commercial message exists
 * yet. `tests/email-classes.test.ts` fails when a new sender appears elsewhere.
 */
import type { Db, UserRow } from '../db/types';
import type { EmailSender } from '../lib/brevo';

export interface CommercialMessage {
  subject: string;
  html: string;
  text: string;
}

export function hasMarketingConsent(user: UserRow): boolean {
  return user.marketingConsentAt !== null && user.marketingWithdrawnAt === null;
}

/**
 * @returns whether the message left. The account is read here rather than taken
 * from the caller, so an accord withdrawn a moment ago is honoured.
 */
export async function sendCommercial(
  deps: { db: Db; email: EmailSender; webAppOrigin: string },
  userId: string,
  message: CommercialMessage,
): Promise<boolean> {
  const user = await deps.db.getUserById(userId);
  if (!user?.email || !user.emailVerified || !user.marketingUnsubToken || !hasMarketingConsent(user)) return false;
  const token = encodeURIComponent(user.marketingUnsubToken);
  const page = `${deps.webAppOrigin}/desinscription?t=${token}`;
  await deps.email.send({
    to: user.email,
    subject: message.subject,
    html: `${message.html}\n<p><a href="${page}">Ne plus recevoir ces e-mails</a></p>`,
    text: `${message.text}\n\nNe plus recevoir ces e-mails : ${page}`,
    headers: {
      'List-Unsubscribe': `<${deps.webAppOrigin}/web/unsubscribe?t=${token}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  });
  return true;
}
