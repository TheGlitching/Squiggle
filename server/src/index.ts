/**
 * The Squiggle hosted backend (Phase 2a: authentication).
 *
 * `createWorker` builds the fetch handler from plain dependencies — database,
 * clock, email sender, origins, Google client — which is what makes the whole
 * auth surface testable in-process (see `src/tests`). The default export is
 * the Workers entry: it resolves those dependencies from the Cloudflare
 * environment (secrets live in the Workers secret store, never in this repo)
 * and hands every request to the same handler.
 *
 * CORS is pinned to a small set of allowed origins (the web app and our two
 * store listings) and no wildcard is ever emitted, so a page on any other
 * origin cannot read our responses even if it somehow obtains a token.
 *
 * Endpoints:
 *   GET    /health                     liveness probe
 *   POST   /auth/magic-link            request a magic link (rate limited)
 *   POST   /auth/magic-link/verify     consume a magic link, open a session
 *   GET    /auth/google                begin Google OAuth (PKCE)
 *   GET    /auth/google/callback       finish Google OAuth, open a session
 *   GET|POST /auth/claim               exchange a session for an extension token
 *   POST   /auth/logout                end the current web session
 *   GET    /v1/account                 (signed) who am I, plan and usage
 *   POST   /v1/account/checkout        (signed) open a Stripe Checkout session
 *   POST   /v1/account/portal          (signed) open the Stripe customer portal
 *   POST   /webhooks/stripe            (Stripe-signed) the only writer of a plan
 *   GET    /v1/analyze/check           (signed) shared-cache preflight, 0 credits
 *   POST   /v1/analyze/audit           (signed) audit the article, opens a run
 *   POST   /v1/analyze/research        (signed) check one factual finding
 *   POST   /v1/analyze/source-check    (signed) read one link the article cites
 *   POST   /v1/analyze/finalize        (signed) reconcile, cache, consume 1 credit
 *   POST   /admin/migrate              (admin token) apply pending migrations
 */
import { neon } from '@neondatabase/serverless';
import {
  GeminiClient,
  OpenRouterClient,
  PROMPT_VERSION,
  type BaseLLMClient,
} from '@squiggle/shared';

import {
  analyzeAudit,
  analyzeCheck,
  analyzeFinalize,
  analyzeResearch,
  analyzeSourceCheck,
  type AnalyzeServices,
} from './analyze/stages';
import {
  AuditRequestSchema,
  FinalizeRequestSchema,
  ResearchRequestSchema,
  SourceCheckRequestSchema,
} from './analyze/schemas';

import { claimExtensionToken } from './auth/claim';
import { issueBridgeCode, redeemBridgeCode } from './auth/bridge';
import { completeGoogleAuth, startGoogleAuth } from './auth/google';
import { requestMagicLink, verifyMagicLink } from './auth/magicLink';
import { verifySignedRequest } from './auth/requestSigning';
import {
  cookieValue,
  SESSION_COOKIE,
  sessionClearCookie,
  sessionSetCookie,
  sessionUser,
} from './auth/session';
import { entitlementOf } from './billing/quota';
import { createCheckoutSession, createPortalSession, type StripeConfig } from './billing/stripe';
import { handleStripeWebhook } from './billing/webhook';
import { corsHeaders, originRequired } from './lib/cors';
import { logEvent, newRequestId, REQUEST_ID_HEADER } from './lib/log';
import { NeonDb } from './db/neon';
import type { Db, UserRow } from './db/types';
import type { Clock } from './lib/clock';
import { systemClock } from './lib/clock';
import type { EmailSender, FetchLike } from './lib/brevo';
import { BrevoEmailSender } from './lib/brevo';
import { apiError, errorResponse, type Outcome } from './lib/errors';
import { sha256Hex } from '@squiggle/shared';
import { migrate, type SqlQuery } from './migrations';
import { secureEquals } from './lib/secureCompare';

export interface Env {
  // Non-secret (wrangler.jsonc vars)
  WEB_APP_ORIGIN: string;
  EXTENSION_CHROME_ORIGIN: string;
  EXTENSION_FIREFOX_ORIGIN: string;
  // Secrets (wrangler secret put)
  DATABASE_URL: string;
  BREVO_API_KEY: string;
  BREVO_FROM_ADDRESS: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET?: string;
  ADMIN_TOKEN?: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  /** Non-secret: the `price_…` the subscription is sold at (wrangler.jsonc var). */
  STRIPE_PRICE_ID: string;
  /** Non-secret: which provider hosted analyses run on. Defaults to `openrouter`. */
  LLM_PROVIDER?: string;
  /** Our own OpenRouter key. Hosted mode runs on it; BYOK never touches it. */
  OPENROUTER_API_KEY?: string;
  /** Non-secret: the exact OpenRouter model id (wrangler.jsonc var). */
  OPENROUTER_MODEL?: string;
  /** The switchable alternative provider, used only when `LLM_PROVIDER` is `gemini`. */
  GEMINI_API_KEY?: string;
  /** Non-secret: the exact Gemini model id, used only for the `gemini` selection. */
  GEMINI_MODEL?: string;
}

export interface Services {
  db: Db;
  clock: Clock;
  email: EmailSender;
  webAppOrigin: string;
  extensionOrigins: string[];
  googleClientId: string;
  googleClientSecret?: string;
  fetchImpl?: FetchLike;
  adminToken?: string;
  /**
   * Builds the LLM client hosted analyses run on. A factory, not an instance,
   * so a test can supply a stub and no code path can reach a real provider
   * without one being configured.
   */
  llm?: () => BaseLLMClient;
  /** Prompt set version; part of the shared cache key. */
  promptVersion?: string;
  /** Billing configuration. Absent on a server built without payments. */
  stripe?: StripeConfig;
  /** Apply pending migrations; only present in the live (Neon) deployment. */
  runMigrations?: (now: number) => Promise<string[]>;
}

/**
 * The model hosted analyses default to when the deployment names none. The id
 * is the exact OpenRouter catalogue id, tilde-free: OpenRouter ids are not
 * predictable from the model name, and the API rejects anything that is not
 * exactly right.
 */
export const DEFAULT_OPENROUTER_MODEL = 'deepseek/deepseek-v4.1-flash';

/** The deployment settings the provider gateway reads. */
export interface LlmEnv {
  LLM_PROVIDER?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
}

/**
 * Builds the hosted LLM client from deployment config, so the provider and the
 * model are settings rather than something baked into a build. OpenRouter is
 * the default; `gemini` is kept selectable.
 *
 * A provider whose key is absent yields `undefined` rather than throwing at
 * request time or silently falling back to a provider the deployment did not
 * choose. `undefined` is what the analyze route already turns into the existing
 * "mode hébergé n'est pas configuré" refusal.
 */
export function createHostedLlm(env: LlmEnv): BaseLLMClient | undefined {
  const provider = (env.LLM_PROVIDER || 'openrouter').trim().toLowerCase();

  if (provider === 'gemini') {
    if (!env.GEMINI_API_KEY) return undefined;
    return new GeminiClient({
      provider: 'gemini',
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL || 'gemini-2.5-flash',
    });
  }

  if (provider === 'openrouter') {
    if (!env.OPENROUTER_API_KEY) return undefined;
    return new OpenRouterClient({
      provider: 'openrouter',
      apiKey: env.OPENROUTER_API_KEY,
      model: env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL,
    });
  }

  return undefined;
}

/** Build the request handler from dependencies (the testable core). */
export function createWorker(services: Services) {
  const allowedOrigins = new Set([services.webAppOrigin, ...services.extensionOrigins]);
  return { fetch: (req: Request) => handle(req, services, allowedOrigins) };
}

async function handle(
  req: Request,
  s: Services,
  allowedOrigins: Set<string>,
): Promise<Response> {
  const url = new URL(req.url);
  const requestId = newRequestId();
  const startedAt = Date.now();
  const origin = req.headers.get('origin');
  const originAllowed = origin !== null && allowedOrigins.has(origin);

  // A wrong origin is refused everywhere; a MISSING one is refused on the
  // endpoints that a page could otherwise drive with the reader's own cookie.
  // See lib/cors.ts for why the list is a list and not "every POST".
  if ((origin !== null && !originAllowed) || (!originAllowed && originRequired(req.method, url.pathname))) {
    logEvent({ event: 'origin_rejected', requestId, method: req.method, path: url.pathname });
    return withRequestId(
      errorResponse(apiError('origin_not_allowed', 'This origin is not allowed to call this API.')),
      requestId,
    );
  }

  if (req.method === 'OPTIONS') {
    if (!originAllowed) return new Response(null, { status: 204 });
    return new Response(null, { status: 204, headers: corsHeaders(origin as string) });
  }

  let res: Response;
  try {
    res = await route(req, url, s, requestId);
  } catch {
    // The thrown value is never logged: it can carry a fragment of whatever
    // was being parsed, and that is article text.
    logEvent({ event: 'unhandled_error', requestId, method: req.method, path: url.pathname });
    res = errorResponse(apiError('internal', 'Something went wrong. Please try again.'));
  }

  const headers = new Headers(res.headers);
  headers.set(REQUEST_ID_HEADER, requestId);
  if (originAllowed) {
    for (const [k, v] of Object.entries(corsHeaders(origin as string))) headers.set(k, v);
  }
  res = new Response(res.body, { status: res.status, statusText: res.statusText, headers });

  // The route pattern, never the query string: on `/v1/analyze/check` the
  // query string is the article the reader is looking at.
  logEvent({
    event: 'request',
    requestId,
    method: req.method,
    path: url.pathname,
    status: res.status,
    durationMs: Date.now() - startedAt,
  });
  return res;
}

function withRequestId(res: Response, requestId: string): Response {
  const headers = new Headers(res.headers);
  headers.set(REQUEST_ID_HEADER, requestId);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

function finish<T extends object>(outcome: Outcome<T>, setCookie?: string | null): Response {
  const base = outcome.ok ? Response.json(outcome, { status: 200 }) : errorResponse(outcome);
  const res = new Response(base.body, { status: base.status, statusText: base.statusText, headers: base.headers });
  if (setCookie) res.headers.set('set-cookie', setCookie);
  return res;
}

async function route(req: Request, url: URL, s: Services, requestId: string): Promise<Response> {
  const path = url.pathname;
  const method = req.method;

  if (path === '/health' && method === 'GET') {
    return Response.json({ ok: true });
  }

  if (path === '/auth/magic-link' && method === 'POST') {
    const body = await readJson(req);
    const email = typeof body.email === 'string' ? body.email : '';
    const ip = req.headers.get('cf-connecting-ip');
    const outcome = await requestMagicLink(
      { db: s.db, clock: s.clock, email: s.email, webAppOrigin: s.webAppOrigin, requestId },
      { email, ip },
    );
    return finish(outcome);
  }

  if (path === '/auth/magic-link/verify' && method === 'POST') {
    const body = await readJson(req);
    const code = typeof body.code === 'string' ? body.code : '';
    const outcome = await verifyMagicLink(
      { db: s.db, clock: s.clock, requestId },
      code,
      req.headers.get('cf-connecting-ip'),
    );
    return finish(outcome, outcome.ok ? sessionSetCookie(outcome.sessionToken) : null);
  }

  if (path === '/auth/google' && method === 'GET') {
    const started = await startGoogleAuth({
      db: s.db,
      clock: s.clock,
      webAppOrigin: s.webAppOrigin,
      clientId: s.googleClientId,
      clientSecret: s.googleClientSecret,
      fetchImpl: s.fetchImpl,
    });
    return new Response(null, { status: 302, headers: { location: started.redirectUrl } });
  }

  if (path === '/auth/google/callback' && method === 'GET') {
    const outcome = await completeGoogleAuth(
      {
        db: s.db,
        clock: s.clock,
        webAppOrigin: s.webAppOrigin,
        clientId: s.googleClientId,
        clientSecret: s.googleClientSecret,
        fetchImpl: s.fetchImpl,
      },
      {
        state: url.searchParams.get('state') ?? undefined,
        code: url.searchParams.get('code') ?? undefined,
      },
    );
    if (outcome.ok) {
      const res = new Response(null, {
        status: 302,
        headers: { location: `${s.webAppOrigin}/account` },
      });
      res.headers.set('set-cookie', sessionSetCookie(outcome.sessionToken));
      return res;
    }
    return errorResponse(outcome);
  }

  if (path === '/auth/claim' && (method === 'GET' || method === 'POST')) {
    const user = await sessionUser({ db: s.db, clock: s.clock }, req);
    if (!user) return finish(apiError('invalid_session', 'Sign in first.'));

    let jwk: unknown = null;
    if (method === 'POST') {
      const body = await readJson(req);
      jwk = body.publicKeyJwk ?? null;
    } else {
      const raw = url.searchParams.get('key');
      if (raw) {
        try {
          jwk = JSON.parse(raw);
        } catch {
          jwk = null;
        }
      }
    }
    const outcome = await claimExtensionToken({ db: s.db, clock: s.clock }, user, jwk);
    return finish(outcome);
  }

  if (path === '/auth/logout' && method === 'POST') {
    const raw = cookieValue(req, SESSION_COOKIE);
    if (raw) await s.db.revokeSession(await sha256Hex(raw), s.clock.now());
    const res = Response.json({ ok: true });
    res.headers.set('set-cookie', sessionClearCookie());
    return res;
  }

  // The web app's own bridge: issue a code for a signed-in reader to type
  // into an extension that Firefox will not let us navigate to.
  if (path === '/web/bridge/code' && method === 'POST') {
    const user = await sessionUser({ db: s.db, clock: s.clock }, req);
    if (!user) return finish(apiError('invalid_session', 'Connectez-vous d’abord.'));
    const sessionHash = await sha256Hex(cookieValue(req, SESSION_COOKIE) as string);
    const body = await readJson(req);
    const outcome = await issueBridgeCode(
      { db: s.db, clock: s.clock, requestId },
      { userId: user.id, sessionHash, publicKeyJwk: body.publicKeyJwk ?? null },
    );
    return finish(outcome);
  }

  // Redeeming a code is done by the extension, which has no session cookie:
  // the code itself is the credential, and it is single-use and rate limited.
  if (path === '/auth/bridge/redeem' && method === 'POST') {
    const body = await readJson(req);
    const rawSession = cookieValue(req, SESSION_COOKIE);
    const outcome = await redeemBridgeCode(
      { db: s.db, clock: s.clock, requestId },
      {
        code: typeof body.code === 'string' ? body.code : '',
        ip: req.headers.get('cf-connecting-ip'),
        sessionHash: rawSession ? await sha256Hex(rawSession) : null,
      },
    );
    return finish(outcome);
  }

  if (path === '/webhooks/stripe' && method === 'POST') {
    if (!s.stripe) return finish(apiError('billing_unavailable', 'Billing is not configured.'));
    // Stripe is not a browser: it sends no Origin, and its signature is the
    // authentication. The raw bytes are what was signed, so they are what is
    // verified — never a re-serialization of the parsed JSON.
    const outcome = await handleStripeWebhook(
      { db: s.db, clock: s.clock, webhookSecret: s.stripe.webhookSecret, requestId },
      await req.text(),
      req.headers.get('stripe-signature'),
    );
    return finish(outcome);
  }

  if (path.startsWith('/web/account')) {
    return webAccountRoute(req, s, path, method);
  }

  if (path.startsWith('/v1/account')) {
    return accountRoute(req, s, path, method);
  }

  if (path.startsWith('/v1/analyze/')) {
    return analyzeRoute(req, url, s, path, method, requestId);
  }

  if (path === '/admin/migrate' && method === 'POST') {
    // Constant-time: a plain `!==` short-circuits at the first differing byte,
    // which lets an attacker recover the admin token one character at a time.
    const header = req.headers.get('authorization') ?? '';
    const expected = s.adminToken ? `Bearer ${s.adminToken}` : '';
    if (!s.adminToken || !(await secureEquals(header, expected))) {
      return finish(apiError('invalid_token', 'Invalid admin token.'));
    }
    if (!s.runMigrations) {
      return finish(apiError('internal', 'Migrations are unavailable in this environment.'));
    }
    const applied = await s.runMigrations(s.clock.now());
    return finish({ ok: true, applied });
  }

  if (path.startsWith('/v1/')) {
    return finish(apiError('not_found', 'No such endpoint.'));
  }

  return finish(apiError('not_found', 'No such endpoint.'));
}

/** The account and billing endpoints, all behind the signed-request gate. */
async function accountRoute(
  req: Request,
  s: Services,
  path: string,
  method: string,
): Promise<Response> {
  const rawBody = method === 'GET' ? '' : await req.text();
  const auth = await verifySignedRequest({ db: s.db, clock: s.clock }, req, rawBody);
  if (!auth.ok) return finish(auth);
  return accountForUser(s, auth.user, path, method);
}

/**
 * The same account and billing capabilities, reached with a web session
 * cookie instead of a P-256 signature. `lib/cors.ts` requires an Origin on
 * every one of these, so a third-party page cannot drive them with the
 * reader's cookie.
 */
async function webAccountRoute(
  req: Request,
  s: Services,
  path: string,
  method: string,
): Promise<Response> {
  const user = await sessionUser({ db: s.db, clock: s.clock }, req);
  if (!user) return finish(apiError('invalid_session', 'Connectez-vous d’abord.'));
  return accountForUser(s, user, path, method);
}

/**
 * The shared capability body. Both the signed `/v1/account*` route and the
 * cookie-authenticated `/web/account*` route land here, so the billing logic
 * and the response shape exist once and cannot diverge between the extension
 * and the web app.
 */
async function accountForUser(
  s: Services,
  user: UserRow,
  path: string,
  method: string,
): Promise<Response> {
  const now = s.clock.now();

  if (path === '/v1/account' || path === '/web/account') {
    if (method !== 'GET') return finish(apiError('not_found', 'No such endpoint.'));
    // The panel renders its quota states from this, so it carries the
    // entitlement, not just the stored plan: an `active` row whose period has
    // ended is reported as `none`, which is what is actually true.
    const entitlement = await entitlementOf(s.db, user, now);
    return finish({
      ok: true,
      id: user.id,
      email: user.email,
      plan: entitlement.plan,
      planExpiresAt: user.planExpiresAt,
      usage: {
        used: entitlement.used,
        limit: entitlement.limit,
        remaining: entitlement.remaining,
        resetsAt: entitlement.resetsAt,
      },
    });
  }

  const isCheckout = path === '/v1/account/checkout' || path === '/web/account/checkout';
  const isPortal = path === '/v1/account/portal' || path === '/web/account/portal';

  if (isCheckout && method === 'POST') {
    if (!s.stripe) return finish(apiError('billing_unavailable', 'Billing is not configured.'));
    const outcome = await createCheckoutSession({
      config: s.stripe,
      userId: user.id,
      email: user.email,
      customerId: user.stripeCustomerId,
      successUrl: `${s.webAppOrigin}/compte?paiement=ok`,
      cancelUrl: `${s.webAppOrigin}/tarifs?paiement=annule`,
    });
    return finish(outcome);
  }

  if (isPortal && method === 'POST') {
    if (!s.stripe) return finish(apiError('billing_unavailable', 'Billing is not configured.'));
    if (!user.stripeCustomerId) {
      return finish(apiError('not_found', 'Aucun abonnement à gérer pour ce compte.'));
    }
    return finish(await createPortalSession(s.stripe, user.stripeCustomerId, `${s.webAppOrigin}/compte`));
  }

  return finish(apiError('not_found', 'No such endpoint.'));
}

/**
 * The analysis stages. Every one of them is behind the same signed-request
 * gate as the rest of `/v1/`, and every body is parsed by its zod schema
 * before a handler sees it — so a handler only ever receives a value of the
 * shape it declares, and an oversized or malformed payload costs no tokens.
 */
async function analyzeRoute(
  req: Request,
  url: URL,
  s: Services,
  path: string,
  method: string,
  requestId: string,
): Promise<Response> {
  if (!s.llm) {
    return finish(apiError('internal', "Le mode hébergé n'est pas configuré sur ce serveur."));
  }
  const analyze: AnalyzeServices = {
    db: s.db,
    clock: s.clock,
    llm: s.llm,
    promptVersion: s.promptVersion ?? PROMPT_VERSION,
    fetchImpl: s.fetchImpl as typeof fetch | undefined,
    requestId,
  };

  // The signature covers the body byte-for-byte, so the raw text has to be
  // read once and reused: re-reading a consumed body would verify one string
  // and parse another.
  const rawBody = method === 'GET' ? '' : await req.text();
  const auth = await verifySignedRequest({ db: s.db, clock: s.clock }, req, rawBody);
  if (!auth.ok) return finish(auth);

  if (path === '/v1/analyze/check' && method === 'GET') {
    const target = url.searchParams.get('url') ?? '';
    return finish(await analyzeCheck(analyze, target));
  }

  if (path === '/v1/analyze/audit' && method === 'POST') {
    const parsed = AuditRequestSchema.safeParse(parseJson(rawBody));
    if (!parsed.success) return finish(invalidPayload(parsed.error, requestId, auth.user.id));
    return finish(await analyzeAudit(analyze, auth.user, parsed.data));
  }

  if (path === '/v1/analyze/research' && method === 'POST') {
    const parsed = ResearchRequestSchema.safeParse(parseJson(rawBody));
    if (!parsed.success) return finish(invalidPayload(parsed.error, requestId, auth.user.id));
    return finish(await analyzeResearch(analyze, auth.user, parsed.data));
  }

  if (path === '/v1/analyze/source-check' && method === 'POST') {
    const parsed = SourceCheckRequestSchema.safeParse(parseJson(rawBody));
    if (!parsed.success) return finish(invalidPayload(parsed.error, requestId, auth.user.id));
    return finish(await analyzeSourceCheck(analyze, auth.user, parsed.data));
  }

  if (path === '/v1/analyze/finalize' && method === 'POST') {
    const parsed = FinalizeRequestSchema.safeParse(parseJson(rawBody));
    if (!parsed.success) return finish(invalidPayload(parsed.error, requestId, auth.user.id));
    return finish(await analyzeFinalize(analyze, auth.user, parsed.data));
  }

  return finish(apiError('not_found', 'No such endpoint.'));
}

/**
 * A rejected payload is named by its FIELD, never echoed back: the value that
 * failed validation is attacker-supplied article text, and it belongs neither
 * in a response nor in a log line. Naming the field is what keeps a real
 * client's bug debuggable without any of that.
 */
function invalidPayload(
  error: { issues: Array<{ path: PropertyKey[] }> },
  requestId: string,
  userId: string,
) {
  const fields = [...new Set(error.issues.map((issue) => issue.path.join('.') || '(racine)'))].slice(0, 5);
  logEvent({ event: 'payload_rejected', requestId, userId, fields });
  return apiError('invalid_payload', `Requête invalide : ${fields.join(', ')}.`);
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = await req.json();
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
  } catch {
    // malformed body: the route handler validates the absence of fields
  }
  return {};
}

// ---------------------------------------------------------------------------
// Workers entry
// ---------------------------------------------------------------------------

let live: Services | null = null;

function servicesFromEnv(env: Env): Services {
  if (live) return live;
  const sql = neon(env.DATABASE_URL);
  // The provider is a deployment setting. When its key is missing this is
  // `undefined`, and the analyze route refuses — it never picks a provider the
  // deployment did not configure. Our own key is read from the Workers secret
  // store and never leaves this process; a BYOK user's key is a different thing
  // entirely and never reaches this server at all.
  const hostedLlm = createHostedLlm(env);
  live = {
    db: new NeonDb(env.DATABASE_URL),
    clock: systemClock,
    email: new BrevoEmailSender({
      apiKey: env.BREVO_API_KEY,
      from: env.BREVO_FROM_ADDRESS,
      fromName: 'Squiggle',
    }),
    webAppOrigin: env.WEB_APP_ORIGIN,
    extensionOrigins: [env.EXTENSION_CHROME_ORIGIN, env.EXTENSION_FIREFOX_ORIGIN],
    googleClientId: env.GOOGLE_CLIENT_ID,
    googleClientSecret: env.GOOGLE_CLIENT_SECRET,
    adminToken: env.ADMIN_TOKEN,
    llm: hostedLlm ? () => hostedLlm : undefined,
    promptVersion: PROMPT_VERSION,
    stripe: {
      secretKey: env.STRIPE_SECRET_KEY,
      priceId: env.STRIPE_PRICE_ID,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    },
    runMigrations: (now) => {
      const q: SqlQuery = {
        query: (text, params) =>
          params && params.length > 0 ? sql.query(text, [...params]) : sql.query(text),
      };
      return migrate(q, undefined, now);
    },
  };
  return live;
}

export default {
  fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    return createWorker(servicesFromEnv(env)).fetch(request);
  },
} satisfies ExportedHandler<Env>;
