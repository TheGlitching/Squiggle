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
 * CORS is pinned to a small set of allowed origins (the web app and the
 * Chrome listing, plus any Firefox install on the endpoints it calls; see
 * lib/cors.ts) and no wildcard is ever emitted, so a page on any other origin
 * cannot read our responses even if it somehow obtains a token.
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
 *   POST   /web/account/teacher-checkout (session) the same, with the teacher coupon applied
 *   POST   /v1/account/portal          (signed) open the Stripe customer portal
 *   GET    /web/account/installs       (session) the installs whose token still works
 *   POST   /web/account/installs/revoke (session) revoke one install
 *   POST   /web/account/email          (session) send a code to a new address
 *   POST   /web/account/email/confirm  (session) switch to that address
 *   POST   /web/account/delete         (session) erase the account
 *   POST   /webhooks/stripe            (Stripe-signed) the only writer of a plan
 *   GET    /v1/analyze/check           (signed) shared-cache preflight (url + text hash), 0 credits
 *   POST   /v1/analyze/audit           (signed) audit the article, opens a run
 *   POST   /v1/analyze/research        (signed) check one factual finding
 *   POST   /v1/analyze/source-check    (signed) read one link the article cites
 *   POST   /v1/analyze/finalize        (signed) reconcile, cache, consume 1 credit
 *   GET    /web/analyze/check          (session) the same five stages for a pasted text,
 *   POST   /web/analyze/audit                    on the same quota, behind an allowed Origin
 *   POST   /web/analyze/research
 *   POST   /web/analyze/source-check
 *   POST   /web/analyze/finalize
 *   GET    /web/anon/check             (no account) the same five stages for a visitor's pasted
 *   POST   /web/anon/audit                       text: one a day per IP, 40 a day for the site,
 *   POST   /web/anon/research                    from the web app's own origin only
 *   POST   /web/anon/source-check
 *   POST   /web/anon/finalize
 *   GET    /web/anon/link              (no account) a link's report, if the extension already filed one
 *                                                from the page itself; 0 credits, nothing fetched
 *   POST   /web/count                  (no credentials) bump one audience counter from a closed list
 *   GET    /web/tableau                (owner session) the same metrics, for the owner's page; 404 to anyone else
 *   GET    /admin/metrics              (admin token) aggregate launch metrics, counts only
 *   POST   /admin/migrate              (admin token) apply pending migrations
 */
import { neon } from '@neondatabase/serverless';
import {
  GeminiClient,
  OpenRouterClient,
  PROMPT_VERSION,
  type BaseLLMClient,
  type OpenRouterProviderPreferences,
  type OpenRouterReasoning,
} from '@squiggle/shared';

import {
  analyzeAudit,
  analyzeCheck,
  analyzeFinalize,
  analyzeResearch,
  analyzeSourceCheck,
  analyzeLink,
  type AnalyzeServices,
  type Reader,
} from './analyze/stages';
import {
  AuditRequestSchema,
  CheckQuerySchema,
  FinalizeRequestSchema,
  PastedAuditRequestSchema,
  ResearchRequestSchema,
  SourceCheckRequestSchema,
  LinkQuerySchema,
} from './analyze/schemas';

import {
  confirmEmailChange,
  deleteAccount,
  listInstalls,
  requestEmailChange,
  revokeInstall,
} from './account/manage';
import { claimExtensionToken } from './auth/claim';
import { issueBridgeCode, redeemBridgeCode } from './auth/bridge';
import { completeGoogleAuth, startGoogleAuth } from './auth/google';
import { AFTER_ANON_NEXT, DEFAULT_NEXT } from './auth/next';
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
import { teacherCoupon, teacherOfferOpen } from './billing/teacher';
import { handleStripeWebhook } from './billing/webhook';
import { corsHeaders, firefoxExtensionCall, originRequired } from './lib/cors';
import { logEvent, newRequestId, REQUEST_ID_HEADER } from './lib/log';
import { DAILY_CRON, REPORT_MAX_COUNT, USAGE_LOG_RETENTION_MS } from './usage/limits';
import { NeonDb } from './db/neon';
import type { Db, MetricName, UserRow } from './db/types';
import type { Clock } from './lib/clock';
import { systemClock } from './lib/clock';
import type { EmailSender, FetchLike } from './lib/brevo';
import { BrevoEmailSender } from './lib/brevo';
import { apiError, errorResponse, type Outcome } from './lib/errors';
import { HOSTED_ANALYSIS, isAudienceMetricName, sha256Hex } from '@squiggle/shared';
import { migrate, type SqlQuery } from './migrations';
import { collectLaunchMetrics, countMetric } from './metrics';
import { secureEquals } from './lib/secureCompare';

export interface Env {
  // Non-secret (wrangler.jsonc vars)
  WEB_APP_ORIGIN: string;
  // Secrets (wrangler secret put)
  /**
   * `chrome-extension://<id>` of the Chrome listing. Not sensitive, but a real
   * extension id never enters the repository (AGENTS.md), so it is set like a
   * secret. Firefox has no counterpart: see lib/cors.ts.
   */
  EXTENSION_CHROME_ORIGIN: string;
  /**
   * `chrome-extension://<id>` of the Edge Add-ons listing, set the same way. Edge
   * draws its own id for the same package, so it is a second pinned origin.
   * Optional: unset or empty, no Edge origin is accepted.
   */
  EXTENSION_EDGE_ORIGIN?: string;
  DATABASE_URL: string;
  BREVO_API_KEY: string;
  BREVO_FROM_ADDRESS: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET?: string;
  ADMIN_TOKEN?: string;
  /**
   * Comma-separated addresses whose web session may read the metrics page
   * (`/tableau`). Unset or empty, no one can.
   */
  OWNER_EMAILS?: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  /** Non-secret: the `price_…` the subscription is sold at (wrangler.jsonc var). */
  STRIPE_PRICE_ID: string;
  /** Non-secret: the teacher coupon id (wrangler.jsonc var); `PENDING_…` keeps the offer closed. */
  STRIPE_TEACHER_COUPON_ID?: string;
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
  /** Lower-cased addresses allowed on `/web/tableau` (`OWNER_EMAILS`). */
  ownerEmails?: string[];
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

/** The deployment settings the provider gateway reads. */
export interface LlmEnv {
  LLM_PROVIDER?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
}

/**
 * Where OpenRouter may run a hosted analysis: the hosts the public pages name,
 * European first, American only as a fallback, tried in their order, and
 * nowhere else. With fallbacks off, a request none of them can serve fails
 * instead of reaching a host the pages do not name; the audit turns that into
 * a "retry in a few minutes" that costs the reader nothing. Each host must
 * also keep no prompt, train on none, and honour every parameter sent, so a
 * host that would drop the response schema is skipped too.
 */
const HOSTED_PROVIDER_PREFERENCES: OpenRouterProviderPreferences = {
  order: HOSTED_ANALYSIS.inferenceHosts.map((host) => host.slug),
  only: HOSTED_ANALYSIS.inferenceHosts.map((host) => host.slug),
  allow_fallbacks: false,
  require_parameters: true,
  data_collection: 'deny',
  zdr: true,
};

/**
 * How hard the hosted model thinks before it answers. DeepSeek V4.1 Flash
 * reasons by default at `high` effort, and its reasoning is paid for out of
 * the same output ceiling as the answer: left at that default, it could spend
 * most of the audit's budget thinking and stop mid-report, which the reader
 * saw as an unreadable answer. `low` keeps it thinking and leaves the answer
 * its room. `require_parameters` above skips a host that would ignore it.
 */
const HOSTED_REASONING: OpenRouterReasoning = { effort: 'low' };

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
      // The default is the exact OpenRouter catalogue id, tilde-free: the API
      // rejects anything that is not exactly right.
      model: env.OPENROUTER_MODEL || HOSTED_ANALYSIS.model,
    }, HOSTED_PROVIDER_PREFERENCES, HOSTED_REASONING);
  }

  return undefined;
}

/** The extension origins CORS is pinned to: Chrome's, and Edge's once its listing exists. */
export function extensionOriginsOf(env: Pick<Env, 'EXTENSION_CHROME_ORIGIN' | 'EXTENSION_EDGE_ORIGIN'>): string[] {
  return [env.EXTENSION_CHROME_ORIGIN, env.EXTENSION_EDGE_ORIGIN].filter((origin): origin is string => !!origin);
}

function refererOrigin(req: Request): string | null {
  const referer = req.headers.get('referer');
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

/** Build the request handler from dependencies (the testable core). */
export function ownerEmailsOf(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

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
  const pinned = origin !== null && allowedOrigins.has(origin);
  const originAllowed = pinned || (origin !== null && firefoxExtensionCall(origin, url.pathname));

  // A wrong origin is refused everywhere; a MISSING one is refused on the
  // endpoints that a page could otherwise drive with the reader's own cookie.
  // See lib/cors.ts for why the list is a list and not "every POST".
  // A browser sends no Origin on a same-origin GET (web app and API share one
  // origin), so `Sec-Fetch-Site: same-origin` stands in for it when Origin is
  // absent. The browser sets that header and page script cannot. A browser too
  // old to send Sec-Fetch-Site (Safari before 16.4, Firefox before 90) still
  // sends the page's address as Referer, which script can drop but not forge.
  const fetchSite = req.headers.get('sec-fetch-site');
  const sameOrigin =
    origin === null &&
    (fetchSite === 'same-origin' || (fetchSite === null && refererOrigin(req) === s.webAppOrigin));
  if (
    (origin !== null && !originAllowed) ||
    (!originAllowed && !sameOrigin && originRequired(req.method, url.pathname))
  ) {
    logEvent({ event: 'origin_rejected', requestId, method: req.method, path: url.pathname });
    return withRequestId(
      errorResponse(apiError('origin_not_allowed', 'This origin is not allowed to call this API.')),
      requestId,
    );
  }

  if (req.method === 'OPTIONS') {
    if (!originAllowed) return new Response(null, { status: 204 });
    return new Response(null, { status: 204, headers: corsHeaders(origin as string, pinned) });
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
    for (const [k, v] of Object.entries(corsHeaders(origin as string, pinned))) headers.set(k, v);
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
  const count = (name: MetricName) => countMetric(s.db, name, s.clock.now(), requestId);

  // An account opened from a visitor's report is the one figure that says
  // whether the analysis without an account leads anywhere. The sign-in only
  // carries where it lands; nothing ties it to the visitor's run.
  const countSignin = async (outcome: { created: boolean; next: string | null }) => {
    await count('signin_completed');
    if (outcome.created && outcome.next === AFTER_ANON_NEXT) await count('signin_after_anon');
  };

  if (path === '/health' && method === 'GET') {
    return Response.json({ ok: true });
  }

  if (path === '/auth/magic-link' && method === 'POST') {
    const body = await readJson(req);
    const email = typeof body.email === 'string' ? body.email : '';
    const ip = req.headers.get('cf-connecting-ip');
    const outcome = await requestMagicLink(
      { db: s.db, clock: s.clock, email: s.email, webAppOrigin: s.webAppOrigin, requestId },
      { email, ip, next: body.next },
    );
    if (outcome.ok) await count('signin_link_sent');
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
    if (outcome.ok) await countSignin(outcome);
    return finish(outcome, outcome.ok ? sessionSetCookie(outcome.sessionToken) : null);
  }

  if (path === '/auth/google' && method === 'GET') {
    const started = await startGoogleAuth(
      {
        db: s.db,
        clock: s.clock,
        webAppOrigin: s.webAppOrigin,
        clientId: s.googleClientId,
        clientSecret: s.googleClientSecret,
        fetchImpl: s.fetchImpl,
      },
      { next: url.searchParams.get('next') },
    );
    await count('signin_google');
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
      await countSignin(outcome);
      const res = new Response(null, {
        status: 302,
        headers: { location: `${s.webAppOrigin}${outcome.next ?? DEFAULT_NEXT}` },
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
      { db: s.db, clock: s.clock, stripe: s.stripe, requestId },
      await req.text(),
      req.headers.get('stripe-signature'),
    );
    return finish(outcome);
  }

  // An audience counter. Sent with `credentials: 'omit'`, so it reaches us
  // without the session cookie: nothing ties the count to an account, and the
  // name is the whole of what is kept. The address the request came from is
  // never read here.
  if (path === '/web/count' && method === 'POST') {
    const body = await readJson(req);
    if (!isAudienceMetricName(body.name)) return finish(apiError('invalid_payload', 'Unknown counter.'));
    await count(body.name);
    return new Response(null, { status: 204 });
  }

  if (path.startsWith('/web/account')) {
    return webAccountRoute(req, s, path, method, requestId);
  }

  if (path.startsWith('/v1/account')) {
    return accountRoute(req, s, path, method, requestId);
  }

  if (path.startsWith('/v1/analyze/')) {
    return analyzeRoute(req, url, s, 'install', path.slice('/v1/analyze'.length), method, requestId);
  }

  if (path.startsWith('/web/analyze/')) {
    return analyzeRoute(req, url, s, 'session', path.slice('/web/analyze'.length), method, requestId);
  }

  if (path.startsWith('/web/anon/')) {
    return analyzeRoute(req, url, s, 'anon', path.slice('/web/anon'.length), method, requestId);
  }

  // The owner's metrics page. Anyone else, signed in or not, gets exactly the
  // answer an unknown path gets, so the page does not admit it exists.
  if (path === '/web/tableau' && method === 'GET') {
    const user = await sessionUser({ db: s.db, clock: s.clock }, req);
    const email = user?.email?.toLowerCase();
    if (!email || !s.ownerEmails?.includes(email)) return finish(apiError('not_found', 'No such endpoint.'));
    return metricsAnswer(url, s);
  }

  if (path === '/admin/metrics' && method === 'GET') {
    if (!(await adminAuthorized(req, s))) return finish(apiError('invalid_token', 'Invalid admin token.'));
    return metricsAnswer(url, s);
  }

  if (path === '/admin/migrate' && method === 'POST') {
    if (!(await adminAuthorized(req, s))) return finish(apiError('invalid_token', 'Invalid admin token.'));
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

/** The launch metrics over `?weeks=`, with the cost per analysis when `?costUsd=` is given. */
async function metricsAnswer(url: URL, s: Services): Promise<Response> {
  const weeks = Number(url.searchParams.get('weeks') ?? DEFAULT_METRICS_WEEKS);
  const costParam = url.searchParams.get('costUsd');
  const cost = costParam === null ? undefined : Number(costParam);
  if (
    !Number.isInteger(weeks) ||
    weeks < 1 ||
    weeks > MAX_METRICS_WEEKS ||
    (cost !== undefined && !(Number.isFinite(cost) && cost >= 0))
  ) {
    return finish(apiError('invalid_payload', 'weeks is a whole number of weeks, costUsd a non-negative number.'));
  }
  return finish({ ok: true, metrics: await collectLaunchMetrics(s.db, s.clock.now(), weeks, cost) });
}

/**
 * Constant-time: a plain `!==` short-circuits at the first differing byte,
 * which lets an attacker recover the admin token one character at a time.
 */
async function adminAuthorized(req: Request, s: Services): Promise<boolean> {
  const header = req.headers.get('authorization') ?? '';
  const expected = s.adminToken ? `Bearer ${s.adminToken}` : '';
  return Boolean(s.adminToken) && (await secureEquals(header, expected));
}

const DEFAULT_METRICS_WEEKS = 4;
const MAX_METRICS_WEEKS = 52;

/** The account and billing endpoints, all behind the signed-request gate. */
async function accountRoute(
  req: Request,
  s: Services,
  path: string,
  method: string,
  requestId: string,
): Promise<Response> {
  const rawBody = method === 'GET' ? '' : await req.text();
  const auth = await verifySignedRequest({ db: s.db, clock: s.clock }, req, rawBody);
  if (!auth.ok) return finish(auth);
  return accountForUser(s, auth.user, path, method, requestId);
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
  requestId: string,
): Promise<Response> {
  const user = await sessionUser({ db: s.db, clock: s.clock }, req);
  if (!user) return finish(apiError('invalid_session', 'Connectez-vous d’abord.'));
  return (
    (await accountDataRoute(req, s, user, path, method, requestId)) ??
    accountForUser(s, user, path, method, requestId, await checkoutReturn(req, path, method))
  );
}

/**
 * The account-data actions. They exist only here, behind the browser session:
 * `/v1/account*` is reached with an install's signature, and an install must
 * not be able to change the address or delete the account it merely serves.
 * Returns `null` for a path that is not one of them.
 */
async function accountDataRoute(
  req: Request,
  s: Services,
  user: UserRow,
  path: string,
  method: string,
  requestId: string,
): Promise<Response | null> {
  const deps = { db: s.db, clock: s.clock, requestId };

  if (path === '/web/account/installs' && method === 'GET') {
    return finish(await listInstalls(deps, user));
  }

  if (method !== 'POST') return null;
  const body = () => readJson(req);

  switch (path) {
    case '/web/account/installs/revoke':
      return finish(await revokeInstall(deps, user, (await body()).id));
    case '/web/account/email':
      return finish(
        await requestEmailChange(
          { ...deps, email: s.email, webAppOrigin: s.webAppOrigin },
          user,
          (await body()).email,
          req.headers.get('cf-connecting-ip'),
        ),
      );
    case '/web/account/email/confirm':
      return finish(await confirmEmailChange({ ...deps, stripe: s.stripe }, user, (await body()).code));
    case '/web/account/delete': {
      const outcome = await deleteAccount({ ...deps, stripe: s.stripe }, user, (await body()).confirm);
      // The session row is gone with the account; the cookie in the browser
      // would only point at nothing, so it is cleared with the same response.
      return finish(outcome, outcome.ok ? sessionClearCookie() : null);
    }
    default:
      return null;
  }
}

/**
 * The page a web checkout comes back to: the analysis page when the reader paid
 * from under a report, so they land where they were, and the account page
 * otherwise. A closed list, never a URL from the client.
 */
async function checkoutReturn(req: Request, path: string, method: string): Promise<'/analyser' | null> {
  if (method !== 'POST' || (path !== '/web/account/checkout' && path !== '/web/account/teacher-checkout')) return null;
  return (await readJson(req)).retour === '/analyser' ? '/analyser' : null;
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
  requestId: string,
  returnPage: '/analyser' | null = null,
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
      // Whether the self-service teacher offer is open to this account. The
      // rule lives on the server; the web app only shows or hides a button.
      teacherOffer: teacherOfferOpen(s.stripe, user),
      usage: {
        used: entitlement.used,
        limit: entitlement.limit,
        remaining: entitlement.remaining,
        resetsAt: entitlement.resetsAt,
      },
    });
  }

  const isCheckout = path === '/v1/account/checkout' || path === '/web/account/checkout';
  const isTeacherCheckout = path === '/web/account/teacher-checkout';
  const isPortal = path === '/v1/account/portal' || path === '/web/account/portal';

  if (isCheckout && method === 'POST') {
    if (!s.stripe) return finish(apiError('billing_unavailable', 'Billing is not configured.'));
    const outcome = await createCheckoutSession({
      config: s.stripe,
      userId: user.id,
      email: user.email,
      customerId: user.stripeCustomerId,
      successUrl: `${s.webAppOrigin}${returnPage ?? '/compte'}?paiement=ok`,
      cancelUrl: `${s.webAppOrigin}${returnPage ?? '/tarifs'}?paiement=annule`,
    });
    if (outcome.ok) await countMetric(s.db, 'checkout_started', now, requestId);
    return finish(outcome);
  }

  if (isTeacherCheckout && method === 'POST') {
    const coupon = teacherCoupon(s.stripe);
    if (!s.stripe || !coupon) return finish(apiError('billing_unavailable', 'Billing is not configured.'));
    if (!teacherOfferOpen(s.stripe, user)) {
      return finish(
        apiError(
          'teacher_offer_closed',
          'L’accès enseignant en libre-service demande une adresse académique vérifiée, sur un compte qui n’a jamais été abonné.',
        ),
      );
    }
    const outcome = await createCheckoutSession({
      config: s.stripe,
      userId: user.id,
      email: user.email,
      customerId: null,
      successUrl: `${s.webAppOrigin}${returnPage ?? '/compte'}?paiement=ok`,
      cancelUrl: `${s.webAppOrigin}${returnPage ?? '/compte'}?paiement=annule`,
      teacherCoupon: coupon,
    });
    // Completed, it comes back free: counted as `checkout_free` by the webhook.
    if (outcome.ok) await countMetric(s.db, 'checkout_started', now, requestId);
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
 * The analysis stages, reached two ways that differ only in how the reader is
 * identified. `install` is the extension, behind the same signed-request gate
 * as the rest of `/v1/`. `session` is the web app, with the session cookie and
 * an allowed Origin (`lib/cors.ts`); it may audit a text without an address
 * and never one that cites links. Past that, both run the same handlers on
 * the same account, so a pasted text spends the same trial and subscription.
 * `anon` is the web app for a visitor without an account: the same pasted-text
 * stages, from the web app's own origin only, on the visitor's one analysis
 * of the day rather than on an account.
 *
 * Every body is parsed by its zod schema before a handler sees it, so a
 * handler only ever receives a value of the shape it declares, and an
 * oversized or malformed payload costs no tokens.
 */
async function analyzeRoute(
  req: Request,
  url: URL,
  s: Services,
  caller: 'install' | 'session' | 'anon',
  stage: string,
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
    surface: caller,
  };

  // The signature covers the body byte-for-byte, so the raw text has to be
  // read once and reused: re-reading a consumed body would verify one string
  // and parse another.
  const rawBody = method === 'GET' ? '' : await req.text();
  let reader: Reader;
  if (caller === 'install') {
    const auth = await verifySignedRequest({ db: s.db, clock: s.clock }, req, rawBody);
    if (!auth.ok) return finish(auth);
    reader = auth.user;
  } else if (caller === 'session') {
    const session = await sessionUser({ db: s.db, clock: s.clock }, req);
    if (!session) return finish(apiError('invalid_session', 'Connectez-vous d’abord.'));
    reader = session;
  } else {
    // The site only: an extension signs in, it never runs as a visitor.
    const origin = req.headers.get('origin');
    if (origin !== null && origin !== s.webAppOrigin) {
      return finish(apiError('origin_not_allowed', 'This origin is not allowed to call this API.'));
    }
    // Cloudflare always sets it; a request without one shares a single day's analysis with every other.
    reader = { visitor: true, ipHash: await sha256Hex(req.headers.get('cf-connecting-ip') ?? 'unknown') };
  }
  const userId = 'visitor' in reader ? undefined : reader.id;

  if (stage === '/check' && method === 'GET') {
    // A pasted text may come without an address; an install always has one,
    // so an absent `url` there stays the `invalid_url` it always was.
    const target = url.searchParams.get('url') ?? (caller === 'install' ? '' : undefined);
    const query = CheckQuerySchema.safeParse({ text: url.searchParams.get('text') ?? '' });
    if (!query.success) return finish(invalidPayload(query.error, requestId, userId));
    return finish(await analyzeCheck(analyze, target, query.data.text));
  }

  if (stage === '/link' && method === 'GET') {
    const query = LinkQuerySchema.safeParse({ url: url.searchParams.get('url') ?? '' });
    if (!query.success) return finish(invalidPayload(query.error, requestId, userId));
    return finish(await analyzeLink(analyze, query.data.url));
  }

  if (stage === '/audit' && method === 'POST') {
    const schema = caller === 'install' ? AuditRequestSchema : PastedAuditRequestSchema;
    const parsed = schema.safeParse(parseJson(rawBody));
    if (!parsed.success) return finish(invalidPayload(parsed.error, requestId, userId));
    return finish(await analyzeAudit(analyze, reader, parsed.data));
  }

  if (stage === '/research' && method === 'POST') {
    const parsed = ResearchRequestSchema.safeParse(parseJson(rawBody));
    if (!parsed.success) return finish(invalidPayload(parsed.error, requestId, userId));
    return finish(await analyzeResearch(analyze, reader, parsed.data));
  }

  if (stage === '/source-check' && method === 'POST') {
    const parsed = SourceCheckRequestSchema.safeParse(parseJson(rawBody));
    if (!parsed.success) return finish(invalidPayload(parsed.error, requestId, userId));
    return finish(await analyzeSourceCheck(analyze, reader, parsed.data));
  }

  if (stage === '/finalize' && method === 'POST') {
    const parsed = FinalizeRequestSchema.safeParse(parseJson(rawBody));
    if (!parsed.success) return finish(invalidPayload(parsed.error, requestId, userId));
    return finish(await analyzeFinalize(analyze, reader, parsed.data));
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
  userId: string | undefined,
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
    extensionOrigins: extensionOriginsOf(env),
    googleClientId: env.GOOGLE_CLIENT_ID,
    googleClientSecret: env.GOOGLE_CLIENT_SECRET,
    adminToken: env.ADMIN_TOKEN,
    ownerEmails: ownerEmailsOf(env.OWNER_EMAILS),
    llm: hostedLlm ? () => hostedLlm : undefined,
    promptVersion: PROMPT_VERSION,
    stripe: {
      secretKey: env.STRIPE_SECRET_KEY,
      priceId: env.STRIPE_PRICE_ID,
      teacherCouponId: env.STRIPE_TEACHER_COUPON_ID,
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

/**
 * The retention sweeps `PRIVACY.md` promises. Cron triggers (`wrangler.jsonc`):
 * the hourly one drops lapsed short-lived rows (analysis runs live one hour),
 * closed rate-limit windows and ledger rows past 12 months; the daily one drops expired and over-cap reports.
 * Logs counts only.
 */
export async function runScheduled(s: Services, cron: string): Promise<void> {
  const now = s.clock.now();
  if (cron === DAILY_CRON) {
    const { expired, overCap } = await s.db.purgeReports(now, REPORT_MAX_COUNT);
    logEvent({ event: 'retention_purge', requestId: newRequestId(), scope: 'reports', count: expired + overCap });
    return;
  }
  const count = await s.db.purgeExpired(now, USAGE_LOG_RETENTION_MS);
  logEvent({ event: 'retention_purge', requestId: newRequestId(), scope: 'expired', count });
}

export default {
  fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    return createWorker(servicesFromEnv(env)).fetch(request);
  },
  scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): void {
    ctx.waitUntil(runScheduled(servicesFromEnv(env), event.cron));
  },
} satisfies ExportedHandler<Env>;
