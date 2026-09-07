/**
 * Machine-readable error codes and the uniform error shape.
 *
 * Both the extension and the web app branch on these codes, so they are part
 * of the public protocol: adding a new code is safe, renaming or removing an
 * existing one is not. Responses are always `{"error": <code>, "message": ...}`.
 */

export const ErrorCodes = {
  invalid_email: 'invalid_email',
  invalid_code: 'invalid_code',
  expired_link: 'expired_link',
  link_already_used: 'link_already_used',
  invalid_session: 'invalid_session',
  invalid_token: 'invalid_token',
  bad_signature: 'bad_signature',
  bad_timestamp: 'bad_timestamp',
  nonce_reused: 'nonce_reused',
  invalid_key: 'invalid_key',
  invalid_payload: 'invalid_payload',
  invalid_url: 'invalid_url',
  run_not_found: 'run_not_found',
  run_already_finalized: 'run_already_finalized',
  provider_unavailable: 'provider_unavailable',
  provider_unreadable: 'provider_unreadable',
  invalid_state: 'invalid_state',
  oauth_failed: 'oauth_failed',
  origin_not_allowed: 'origin_not_allowed',
  rate_limited: 'rate_limited',
  quota_exceeded: 'quota_exceeded',
  not_found: 'not_found',
  method_not_allowed: 'method_not_allowed',
  internal: 'internal',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export interface ApiError {
  ok: false;
  code: ErrorCode;
  message: string;
  status: number;
}

const DEFAULT_STATUS: Record<ErrorCode, number> = {
  invalid_email: 400,
  invalid_code: 400,
  expired_link: 410,
  link_already_used: 400,
  invalid_session: 401,
  invalid_token: 401,
  bad_signature: 401,
  bad_timestamp: 401,
  nonce_reused: 401,
  invalid_key: 400,
  invalid_payload: 400,
  invalid_url: 400,
  run_not_found: 404,
  run_already_finalized: 409,
  provider_unavailable: 502,
  provider_unreadable: 502,
  invalid_state: 400,
  oauth_failed: 502,
  origin_not_allowed: 403,
  rate_limited: 429,
  quota_exceeded: 429,
  not_found: 404,
  method_not_allowed: 405,
  internal: 500,
};

/** Build an error result. `status` defaults to a sensible value per code. */
export function apiError(code: ErrorCode, message: string, status?: number): ApiError {
  return { ok: false, code, message, status: status ?? DEFAULT_STATUS[code] };
}

/** Render an error as the uniform JSON response. */
export function errorResponse(err: ApiError): Response {
  return Response.json({ error: err.code, message: err.message }, { status: err.status });
}

/**
 * The result of an auth operation: a success payload (any `T` merged with
 * `ok: true`) or an {@link ApiError}. Callers discriminate with `result.ok`.
 */
export type Outcome<T> = ({ ok: true } & T) | ApiError;
