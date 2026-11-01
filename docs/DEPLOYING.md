# Deploying

One Cloudflare Worker serves both the hosted API and the web app, so the app and the
API share an origin: the session cookie is first-party and there is no CORS to
configure for the web app. There are two environments, `staging` and `production`,
each a separate Worker with its own secrets and its own database.

| Path | Served by |
|---|---|
| `/health`, `/auth/*`, `/v1/*`, `/web/*`, `/webhooks/*`, `/admin/*` | the Worker (`server/src/index.ts`) |
| everything else | the files of `web/dist`, or `index.html` when no file matches, so the client-side router owns `/compte`, `/pont` and the other pages. Each public page is built as its own file with its own head (`/enseignants` is `enseignants.html`, see `web/src/seo.ts`), beside `robots.txt` and `sitemap.xml` |

The list of Worker paths is `assets.run_worker_first` in `server/wrangler.jsonc`.
`server/tests/deploy.test.ts` fails when the Worker gains a route that list does not
cover, when a web route falls under one of its prefixes, or when the installed app's
service worker (`web/sw.js`) stops listing the same paths as the ones it never answers.

## One-time setup, per environment

Run the `wrangler` commands from `server/`, with `--env staging` or `--env production`.

1. **A Cloudflare account**, then `npx wrangler login`. Production is served on the
   custom domain named in `env.production.routes`, which has to be a zone on that
   account. Staging is served on its `workers.dev` address.
2. **A Neon database** for the environment, in the AWS Frankfurt region
   (`aws-eu-central-1`): the privacy policy (`PRIVACY.md`, `/confidentialite`) names
   that location. Staging gets its own, never the production one.
3. **Fill the `PENDING_…` values** of the environment in `server/wrangler.jsonc`:
   - `WEB_APP_ORIGIN` of staging, once its `workers.dev` address is known;
   - `STRIPE_PRICE_ID`: the recurring price, from the test-mode catalogue for staging.
   - `STRIPE_TEACHER_COUPON_ID`: the coupon the self-service teacher offer applies
     (`server/src/billing/teacher.ts`), created in the Stripe dashboard (Products,
     Coupons): 100 % off, duration *repeating* for 12 months, at most 100
     redemptions, redeemable until 30 June. The subscription it opens is ended on
     30 June by the webhook, so the 12 months are only a bound. A new coupon is
     made for each school year.

   `npm run deploy:production` refuses to run while any of them is left.
4. **Secrets**, set by name with `npx wrangler secret put <NAME> --env <environment>`.
   The values are never written to the repository.

   | Secret | What it is |
   |---|---|
   | `DATABASE_URL` | Neon connection string of the environment |
   | `BREVO_API_KEY` | key of the Brevo account that sends the sign-in emails and the forwarding address's replies |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | the Google OAuth client |
   | `OPENROUTER_API_KEY` | the key hosted analyses run on |
   | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe, in test mode for staging |
   | `ADMIN_TOKEN` | bearer token for `POST /admin/migrate` and `GET /admin/metrics`; any long random string |
   | `METRICS_TOKEN` | optional: read-only bearer token accepted by `GET /admin/metrics` only, for a machine that reads the figures; any long random string, distinct from `ADMIN_TOKEN` |
   | `OWNER_EMAILS` | optional: comma-separated addresses whose web session can open `/tableau` (see Launch metrics) |
   | `EXTENSION_CHROME_ORIGIN` | `chrome-extension://<id>`, the id of the Chrome Web Store listing |
   | `EXTENSION_EDGE_ORIGIN` | optional: `chrome-extension://<id>`, the id of the Edge Add-ons listing |

   `GEMINI_API_KEY` is only needed to select Gemini with `LLM_PROVIDER=gemini`.

   `EXTENSION_CHROME_ORIGIN` is not sensitive, but it is a real extension id, and the
   repository never carries one, so it is set like a secret. CORS is pinned to it:
   without it every Chrome reader is refused, and `npm run deploy:production` refuses
   to run while `wrangler secret list` does not show it. `EXTENSION_EDGE_ORIGIN` is set
   the same way once the Edge listing exists: Edge gives the same package an id of its
   own, so it is a second pinned origin. Unset, no Edge origin is accepted, and the
   deploy does not require it. The site's Edge install link
   (`EDGE_STORE_URL` in `shared/src/stores.ts`) stays empty until the listing's address is
   known; Edge readers are sent to the Chrome Web Store meanwhile. Firefox needs nothing here:
   its extension origin is `moz-extension://<uuid>` with a UUID drawn on every
   install, so the server accepts any origin of that shape, on the endpoints the
   extension signs or redeems a code on and nowhere else (`server/src/lib/cors.ts`).
5. **The other side of each integration**, all pointing at the environment's origin:
   the Google OAuth redirect URI `<origin>/auth/google/callback` (with, on the consent
   screen, the privacy policy `<origin>/confidentialite` and the terms
   `<origin>/conditions`), the Stripe webhook
   endpoint `<origin>/webhooks/stripe` (see [stripe-webhook.md](stripe-webhook.md)), and
   the sender address of `BREVO_FROM_ADDRESS` verified in Brevo.

6. **The queue the forwarding address finishes its analyses on**, created once, before
   the first deploy that carries it (a deploy whose queue does not exist is refused by
   wrangler):

   ```bash
   npx wrangler queues create squiggle-mail-in-production
   ```

   (`squiggle-mail-in-staging` for staging). Its producer and consumer are declared in
   `server/wrangler.jsonc`.

## The forwarding address

A reader forwards an e-mail to `verifier@squiggle.fr` and gets the report's essentials and
link back by e-mail (`server/src/mail/inbound.ts`, rendered by `server/src/mail/reply.ts`). Cloudflare Email Routing hands the
message to the Worker's `email()` handler; the audit runs there, the research and the
reply run from the queue above, and the reply is sent through Brevo from
`BREVO_FROM_ADDRESS`. Only a verified account's address is answered, and only when
Cloudflare authenticated it; everything else is dropped without a reply.

The address is a routing rule on the `squiggle.fr` zone, set in the dashboard, once the
queue exists and a deploy carrying `email()` is live:

1. Email > Email Routing > Routing rules > **Create address**.
2. Custom address `verifier`, action **Send to a Worker**, destination
   `squiggle-server-production`. Save.
3. Leave every other rule as it is: `contact@squiggle.fr` keeps its own route.

Check it by forwarding an article from an account's address: the reply arrives within
two or three minutes, and the Worker's logs show one `mail_received` line with
`code: "queued"`, then one `mail_replied`. A message from any other address shows
`code: "unknown_sender"` and gets nothing. To turn it off, disable the rule.

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
SQUIGGLE_WEB_ANALYTICS_TOKEN=… npm run deploy:production
```

Each builds `web/dist`, then deploys the Worker, which uploads those files as its
static assets. Both cron triggers (hourly and daily retention sweeps) are part of the
deployment. `SQUIGGLE_WEB_ANALYTICS_TOKEN` is the Cloudflare Web Analytics token of the
site (see Launch metrics); a production deploy whose build was not given it is refused.

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
tracker. The figures come from rows the server already keeps, plus one small table of
daily event counters, a number per day and per fixed name:

- counted by the server: cache checks and hits, calls and failures per model stage,
  sign-ins started and completed, checkouts started and completed (paid, or free through
  a 100 % promotion code), analyses started and finalized by surface (extension or site),
  and refusals by reason;
- sent by the site, and by the extension in hosted mode (`POST /web/count`, no cookie,
  closed list in `shared/src/hosted/audience.ts`): known campaign links (`?ref=clemi`),
  a few buttons, and findings reported as wrong, counted by category and, apart, by the
  reason picked from a closed list.

Visits themselves (pages viewed, referrers, countries) are not counted here: they are
read in Cloudflare Web Analytics (no cookie). The site loads its script itself, once the
page has painted (`firstPaintReady` in `web/vite.config.ts`): injected by Cloudflare at
the edge, it was fetched during the first paint, and PageSpeed counted it as holding that
paint back. So the site is set up in the dashboard as *Enable with JS Snippet
installation* (Web Analytics, the site, *Manage site*), never *Enable*, which injects it
a second time and counts every visit twice. The token is the one in the snippet that
setting shows; it is not committed, it is given to the build. The site's
Content-Security-Policy (`web/public/_headers`, completed by the build) allows the script
from `static.cloudflareinsights.com` and its reports to `cloudflareinsights.com`.

`headline` gathers the five figures to read every week; ask with `?weeks=1` to read them
over the last week. Revenue is read in Stripe, net of discounts: `subscriptions.active`
and `trial.convertedToPaid` count only the accounts that pay, and `activeFree` the ones
subscribed through a free code.

```bash
curl -H "authorization: Bearer $ADMIN_TOKEN" "https://<origin>/admin/metrics?weeks=4&costUsd=12.40"
```

A machine that only reads the figures, such as a scheduled report, uses `METRICS_TOKEN`
instead: it opens `GET /admin/metrics` and nothing else, so `ADMIN_TOKEN`, which can
migrate the database, never has to leave the owner's hands.

`weeks` (1 to 52, default 4) sets the window of the event figures; account figures
(activation, trial completion, trial to paid) cover every account. `costUsd` is what the
provider invoiced over the same window, which the server cannot know: pass it and the
answer carries the cost per analysis (invoice divided by analyses finalized). Counters
written between a deploy and its migration are dropped, never an error for the reader.

The same figures are readable from a phone at `/tableau`, signed in to the site with an
address listed in the `OWNER_EMAILS` secret (comma-separated, compared without case):

```bash
cd server && npx wrangler secret put OWNER_EMAILS --env production
```

The page asks `GET /web/tableau`, which computes exactly what `/admin/metrics` does, from
the web session instead of the admin token. To anyone else, signed in or not, the page and
its API answer exactly as an unknown address: a 404, so neither admits it is there. Unset or empty, the secret admits no one. The page is not in the sitemap or
`robots.txt`, nothing links to it, and it counts no audience. Its cost field takes the
provider's invoice over the window, as `costUsd` does.
