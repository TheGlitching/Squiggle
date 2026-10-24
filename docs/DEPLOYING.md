# Deploying

One Cloudflare Worker serves both the hosted API and the web app, so the app and the
API share an origin: the session cookie is first-party and there is no CORS to
configure for the web app. There are two environments, `staging` and `production`,
each a separate Worker with its own secrets and its own database.

| Path | Served by |
|---|---|
| `/health`, `/auth/*`, `/v1/*`, `/web/*`, `/webhooks/*`, `/admin/*` | the Worker (`server/src/index.ts`) |
| everything else | the files of `web/dist`, or `index.html` when no file matches, so the client-side router owns `/compte`, `/pont` and the other pages |

The list of Worker paths is `assets.run_worker_first` in `server/wrangler.jsonc`.
`server/tests/deploy.test.ts` fails when the Worker gains a route that list does not
cover, when a web route falls under one of its prefixes, or when the installed app's
service worker (`web/sw.js`) stops listing the same paths as the ones it never answers.

## One-time setup, per environment

Run the `wrangler` commands from `server/`, with `--env staging` or `--env production`.

1. **A Cloudflare account**, then `npx wrangler login`. Production is served on the
   custom domain named in `env.production.routes`, which has to be a zone on that
   account. Staging is served on its `workers.dev` address.
2. **A Neon database** for the environment. Staging gets its own, never the
   production one.
3. **Fill the `PENDING_…` values** of the environment in `server/wrangler.jsonc`:
   - `WEB_APP_ORIGIN` of staging, once its `workers.dev` address is known;
   - `STRIPE_PRICE_ID`: the recurring price, from the test-mode catalogue for staging.

   `npm run deploy:production` refuses to run while any of them is left.
4. **Secrets**, set by name with `npx wrangler secret put <NAME> --env <environment>`.
   The values are never written to the repository.

   | Secret | What it is |
   |---|---|
   | `DATABASE_URL` | Neon connection string of the environment |
   | `BREVO_API_KEY` | key of the Brevo account that sends the sign-in emails |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | the Google OAuth client |
   | `OPENROUTER_API_KEY` | the key hosted analyses run on |
   | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe, in test mode for staging |
   | `ADMIN_TOKEN` | bearer token for `POST /admin/migrate` and `GET /admin/metrics`; any long random string |
   | `EXTENSION_CHROME_ORIGIN` | `chrome-extension://<id>`, the id of the Chrome Web Store listing |

   `GEMINI_API_KEY` is only needed to select Gemini with `LLM_PROVIDER=gemini`.

   `EXTENSION_CHROME_ORIGIN` is not sensitive, but it is a real extension id, and the
   repository never carries one, so it is set like a secret. CORS is pinned to it:
   without it every Chrome reader is refused, and `npm run deploy:production` refuses
   to run while `wrangler secret list` does not show it. Firefox needs nothing here:
   its extension origin is `moz-extension://<uuid>` with a UUID drawn on every
   install, so the server accepts any origin of that shape, on the endpoints the
   extension signs or redeems a code on and nowhere else (`server/src/lib/cors.ts`).
5. **The other side of each integration**, all pointing at the environment's origin:
   the Google OAuth redirect URI `<origin>/auth/google/callback` (with, on the consent
   screen, the privacy policy `<origin>/confidentialite` and the terms
   `<origin>/conditions`), the Stripe webhook
   endpoint `<origin>/webhooks/stripe` (see [stripe-webhook.md](stripe-webhook.md)), and
   the sender address of `BREVO_FROM_ADDRESS` verified in Brevo.

## Staging is optional

Production does not depend on staging: nothing is shared between them, and
`npm run deploy:production` checks only the production values. Staging stays undeployed
until it is needed. Its `PENDING_…` values (its `workers.dev` subdomain, the test-mode
price) and its secrets, including the `EXTENSION_CHROME_ORIGIN` of a development build,
are filled in at that point; `npm run deploy:staging` only warns about them.

## Deploy

From the repository root:

```bash
npm run deploy:staging
npm run deploy:production
```

Each builds `web/dist`, then deploys the Worker, which uploads those files as its
static assets. Both cron triggers (hourly and daily retention sweeps) are part of the
deployment.

## Migrate

Migrations ship inside the Worker, so they are applied after the deploy that carries
them, through the admin route. The runner is forward-only and idempotent: running it
when nothing is pending changes nothing.

```bash
ADMIN_TOKEN=… npm run migrate -w @squiggle/server -- https://<origin>
```

It prints the names of the migrations it applied. Between the deploy and the migrate,
the new code runs on the old schema, so a migration is written to be additive and the
second command follows the first immediately.

## Check a deployment

Against the environment's origin:

1. `GET /health` answers `{"ok":true}`.
2. `/compte` renders the app, and so does any other web path, such as a reload on
   `/pont`.
3. `GET /v1/anything` answers a JSON `not_found`, not the app: the API is served first.
4. Sign in with an email link, then open `/compte`: the account loads and shows the
   plan and the usage.

## Roll back

```bash
cd server && npx wrangler rollback --env production
```

A Worker version carries its static assets, so this restores the API and the site
together. The database is not rolled back: migrations are forward-only, which is why
they are additive and the previous version keeps working on the newer schema.

## Not covered here

The extension is built against an origin with `SQUIGGLE_HOSTED_ORIGIN` (see
`vite.config.ts`). A release build has to be given the production origin; a staging
build, the staging one.

## Launch metrics

`GET /admin/metrics` answers with aggregate counts and ratios, read with the same admin
token. It is the only source of launch metrics: the extension and the site carry no
telemetry. The figures come from rows the server already keeps, plus one small table of
daily event counters (cache checks and hits, calls and failures per model stage).

```bash
curl -H "authorization: Bearer $ADMIN_TOKEN" "https://<origin>/admin/metrics?weeks=4&costUsd=12.40"
```

`weeks` (1 to 52, default 4) sets the window of the event figures; account figures
(activation, trial completion, trial to paid) cover every account. `costUsd` is what the
provider invoiced over the same window, which the server cannot know: pass it and the
answer carries the cost per analysis (invoice divided by analyses finalized). Counters
written between a deploy and its migration are dropped, never an error for the reader.
