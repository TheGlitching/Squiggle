/**
 * Who really sent an inbound message, as far as Cloudflare Email Routing can
 * tell: the checks every address we receive mail on applies before it reads a
 * word. They live apart from the forwarding address (`inbound.ts`) because the
 * content routine's reply address (`tools/contenu/worker`) applies the same
 * ones, and two copies of an authentication check would drift apart.
 */
import type { Email } from 'postal-mime';

/** The authentication service whose `Authentication-Results` header is trusted. */
const CLOUDFLARE_AUTHSERV_ID = 'mx.cloudflare.net';

/** A bounce, an automatic reply or a mailing list: never a person writing to us. */
export function isAutomatic(email: Email): boolean {
  const header = (key: string) => email.headers.find((h) => h.key === key)?.value.trim().toLowerCase();
  const autoSubmitted = header('auto-submitted');
  if (autoSubmitted && autoSubmitted !== 'no') return true;
  if (header('x-autoreply') || header('x-autorespond') || header('list-id') || header('list-unsubscribe')) return true;
  const precedence = header('precedence');
  return precedence === 'bulk' || precedence === 'junk' || precedence === 'list' || precedence === 'auto_reply';
}

export function domainOf(address: string): string {
  return address.slice(address.lastIndexOf('@') + 1);
}

/** Relaxed DMARC alignment, without the public-suffix list: the same domain, or one inside the other. */
function aligned(domain: string, fromDomain: string): boolean {
  const d = domain.toLowerCase().replace(/\.$/, '');
  return d === fromDomain || fromDomain.endsWith(`.${d}`) || d.endsWith(`.${fromDomain}`);
}

/**
 * Whether Cloudflare authenticated the From domain. Only the first
 * `Authentication-Results` header counts, and only when Cloudflare wrote it:
 * any header below it came with the message and is whatever the sender chose.
 * DMARC passing is alignment by definition; without a DMARC record, a DKIM
 * signature or an SPF pass for the From domain itself does it.
 */
export function senderAuthenticated(email: Pick<Email, 'headers'>, fromDomain: string): boolean {
  const header = email.headers.find((h) => h.key === 'authentication-results');
  if (!header) return false;
  const [authserv, ...results] = header.value.replace(/\([^)]*\)/g, ' ').split(';');
  if (authserv.trim().split(/\s+/)[0]?.toLowerCase() !== CLOUDFLARE_AUTHSERV_ID) return false;

  return results.some((result) => {
    const [verdict, ...props] = result.trim().split(/\s+/);
    const [method, value] = (verdict ?? '').toLowerCase().split('=');
    if (value !== 'pass') return false;
    const prop = (name: string) =>
      props.find((p) => p.toLowerCase().startsWith(`${name}=`))?.slice(name.length + 1).replace(/^"|"$/g, '');
    if (method === 'dmarc') {
      const headerFrom = prop('header.from');
      return !headerFrom || headerFrom.toLowerCase() === fromDomain;
    }
    if (method === 'dkim') {
      const d = prop('header.d') ?? prop('header.i')?.replace(/^.*@/, '');
      return !!d && aligned(d, fromDomain);
    }
    if (method === 'spf') {
      const mailfrom = prop('smtp.mailfrom');
      return !!mailfrom && aligned(domainOf(mailfrom), fromDomain);
    }
    return false;
  });
}
