/**
 * Structured logging, shaped so it cannot leak an article.
 *
 * The privacy promise is that no article text is ever written to a log. A
 * convention ("remember not to log the body") does not survive a hurried
 * change, so the promise is a type here instead: {@link LogFields} has no
 * free-text field. Everything a line can carry is either a fixed identifier,
 * a number, or a hash — there is nowhere to put a paragraph even by accident.
 *
 * That also answers the second half of the same concern: a validation failure
 * logs the FIELD that failed, never the value that failed it, because the
 * value is attacker-supplied text.
 *
 * `requestId` is a fresh random UUID per request, never derived from any
 * content, so correlating two lines proves they belong to one request and
 * says nothing else. It is also returned to the caller in
 * `x-squiggle-request-id`, which is what a user can quote in a bug report.
 */

export interface LogFields {
  /** A fixed identifier from the code, never interpolated with input. */
  event:
    | 'request'
    | 'origin_rejected'
    | 'rate_limited'
    | 'auth_failed'
    | 'payload_rejected'
    | 'analysis_started'
    | 'analysis_finalized'
    | 'cache_hit'
    | 'provider_failed'
    | 'unhandled_error';
  requestId: string;
  method?: string;
  /** The route pattern, never the query string (which carries the article URL). */
  path?: string;
  status?: number;
  durationMs?: number;
  /** Our own opaque account id. Never the email address. */
  userId?: string;
  /** SHA-256 of the canonical article URL. Never the URL. */
  urlHash?: string;
  /** A machine-readable error code from `ErrorCodes`. */
  code?: string;
  /** Which limit tripped, e.g. `magic_link:ip`. Never the value it limited. */
  scope?: string;
  count?: number;
  /** Names of the payload fields that failed validation. Never their values. */
  fields?: string[];
}

/** One JSON line per event. Cloudflare's observability ingests these as-is. */
export function logEvent(fields: LogFields): void {
  console.log(JSON.stringify(fields));
}

/** A fresh opaque correlation id. Not derived from anything in the request. */
export function newRequestId(): string {
  return crypto.randomUUID();
}

export const REQUEST_ID_HEADER = 'x-squiggle-request-id';
