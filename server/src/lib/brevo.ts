/**
 * Brevo (formerly Sendinblue) transactional email.
 *
 * The only outbound network call the magic-link flow makes. The sender is
 * injected (`EmailSender`), so tests substitute a recording fake and the
 * real `BrevoEmailSender` (a plain `fetch` against the Brevo v3 API, no
 * SDK) never touches the network during a test run.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

/** The shape of `fetch` we rely on; lets tests substitute a fake without casts. */
export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface BrevoOptions {
  apiKey: string;
  /** Verified sender address in the Brevo account. */
  from: string;
  fromName?: string;
  /** Injectable fetch (tests); defaults to the global. */
  fetchImpl?: FetchLike;
  /** Defaults to the Brevo v3 smtp/email endpoint. */
  apiUrl?: string;
}

const BREVO_EMAIL_URL = 'https://api.brevo.com/v3/smtp/email';

export class BrevoEmailSender implements EmailSender {
  private readonly opts: BrevoOptions;

  constructor(opts: BrevoOptions) {
    this.opts = opts;
  }

  async send(message: EmailMessage): Promise<void> {
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const res = await fetchImpl(this.opts.apiUrl ?? BREVO_EMAIL_URL, {
      method: 'POST',
      headers: {
        'api-key': this.opts.apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: this.opts.fromName ?? 'Squiggle', email: this.opts.from },
        to: [{ email: message.to }],
        subject: message.subject,
        htmlContent: message.html,
      }),
    });
    if (!res.ok) {
      throw new Error(`Brevo rejected the email (HTTP ${res.status})`);
    }
  }
}
