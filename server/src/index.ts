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
 *   GET    /v1/account                 (signed) who am I
 *   POST   /admin/migrate              (admin token) apply pending migrations
 */
import { neon } from '@neondatabase/serverless';

import { claimExtensionToken } from './auth/claim';
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
import { NeonDb } from './db/neon';
import type { Db } from './db/types';
import type { Clock } from './lib/clock';
import { systemClock } from './lib/clock';
import type { EmailSender, FetchLike } from './lib/brevo';
import { BrevoEmailSender } from './lib/brevo';
import { apiError, errorResponse, type Outcome } from './lib/errors';
import { sha256Hex } from '@squiggle/shared';
import { migrate, type SqlQuery } from './migrations';

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
  /** Apply pending migrations; only present in the live (Neon) deployment. */
  runMigrations?: (now: number) => Promise<string[]>;
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
  const origin = req.headers.get('origin');
  const originAllowed = origin !== null && allowedOrigins.has(origin);

  if (origin !== null && !originAllowed) {
    return errorResponse(apiError('origin_not_allowed', 'This origin is not allowed to call this API.'));
  }

  if (req.method === 'OPTIONS') {
    if (!originAllowed) return new Response(null, { status: 204 });
    return new Response(null, { status: 204, headers: corsHeaders(origin as string) });
  }

  let res: Response;
  try {
    res = await route(req, url, s);
  } catch {
    res = errorResponse(apiError('internal', 'Something went wrong. Please try again.'));
  }

  if (originAllowed) {
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(corsHeaders(origin as string))) headers.set(k, v);
    res = new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  }
  return res;
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type, x-squiggle-sig, x-squiggle-nonce, x-squiggle-ts',
    'access-control-expose-headers': 'x-squiggle-request-id',
    'access-control-max-age': '86400',
  };
}

function finish(outcome: Outcome<Record<string, unknown>>, setCookie?: string | null): Response {
  const base = outcome.ok ? Response.json(outcome, { status: 200 }) : errorResponse(outcome);
  const res = new Response(base.body, { status: base.status, statusText: base.statusText, headers: base.headers });
  if (setCookie) res.headers.set('set-cookie', setCookie);
  return res;
}

async function route(req: Request, url: URL, s: Services): Promise<Response> {
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
      { db: s.db, clock: s.clock, email: s.email, webAppOrigin: s.webAppOrigin },
      { email, ip },
    );
    return finish(outcome);
  }

  if (path === '/auth/magic-link/verify' && method === 'POST') {
    const body = await readJson(req);
    const code = typeof body.code === 'string' ? body.code : '';
    const outcome = await verifyMagicLink({ db: s.db, clock: s.clock }, code);
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

  if (path === '/v1/account' && method === 'GET') {
    const auth = await verifySignedRequest({ db: s.db, clock: s.clock }, req, await req.text());
    if (!auth.ok) return finish(auth);
    const { user } = auth;
    return finish({
      ok: true,
      id: user.id,
      email: user.email,
      plan: user.plan,
      planExpiresAt: user.planExpiresAt,
    });
  }

  if (path === '/admin/migrate' && method === 'POST') {
    const header = req.headers.get('authorization');
    if (!s.adminToken || header !== `Bearer ${s.adminToken}`) {
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
