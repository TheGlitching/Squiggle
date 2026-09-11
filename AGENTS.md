# Project agent memory

The committed home for project-intrinsic knowledge that should travel with the code.
It is deliberately short: `CONTRIBUTING.md` owns the build, the gates, the conventions
and the honesty rules, `ARCHITECTURE.md` owns the topology and the pipeline order, and
`SECURITY.md` and `PRIVACY.md` own the data flow. What is here is the handful of things
that are load-bearing and not visible from any one file.

## The workspace boundary

```
src/      the extension (Chrome + Firefox MV3)
shared/   the analysis engine, the provider clients, the request-signing protocol
server/   the hosted backend (Cloudflare Workers + Neon Postgres)
web/      the public web app (Vite + React): sign-in, subscription, extension bridge
```

`shared/` is not a convenience directory. Anything imported by **both** the extension
and the server belongs there, and nothing else does. The rule exists because the same
analysis can now run in two places: a prompt, a scoring rule or a canonical signing
string existing in two copies would be a silent divergence between what a BYOK reader
and a hosted reader are told about the same article. If you are about to copy something
out of `shared/`, move it instead.

`web/` is the keyless reader's half of hosted mode. Its browser-session namespace is
`/web/account*` in `server/src/index.ts`, and the contract the extension must implement
to connect is `web/BRIDGE.md` — the extension half does not exist yet.

## Secrets and identifiers

Nothing sensitive is ever committed: no key, no token, no cloud project name, no
account id, no real extension id — not in code, not in an example, not in a test, not
in a comment.

- Server secrets live in the Cloudflare secret store. The names the code reads are
  declared as `Env` in `server/src/index.ts`; that declaration is the list.
- Environment-specific values that are *not* secret are `vars` in
  `server/wrangler.jsonc`, and anything not yet decided carries a `PENDING_…`
  placeholder rather than a plausible-looking guess.
- Release credentials are GitHub Actions secrets; see `docs/RELEASING.md`.
- The extension is BYOK: a user's own API key never leaves their browser except toward
  the provider they chose, and never reaches our server. Any change that could put a
  key in a URL, a log line or a message payload is a bug, not a trade-off.

If you find something sensitive already committed, stop and say so rather than deleting
it. A published secret is revoked, not removed.

## Three invariants in the hosted backend

Each of these is load-bearing, and each is easy to break with a change that looks like
a simplification.

**The server never fetches the article.** Its text always comes from the extension,
from the page the reader is already looking at. That is what makes a paywalled page
analysable exactly as far as the reader can read it (flagged as partial), and what
keeps our IP out of publishers' logs. The only pages the server fetches are the sources
the article itself cites, through the SSRF-hardened fetcher — never the browser-safe
one, which is only sound inside a browser.

**The shared cache is server-authored.** Intermediate state lives in an `analysis_runs`
row, never in the client's hands; a client names a run, a finding and a claim, never
their content. A cached report is served to readers who never chose to trust the
article that produced it, so anything a client could edit on the way would be an
injection channel between readers.

**A plan is only ever written by the Stripe webhook.** Nothing else calls `setPlan`. A
client that could declare itself subscribed would be a client that could grant itself
the product.

## Logs

`server/src/lib/log.ts` has no free-text field, deliberately: that is how "no article
text is ever logged" is enforced by the compiler rather than by memory. Do not add one.
A rejected payload is logged by the **name** of the field that failed, never its value.

## Tests for the backend

The server suite runs entirely in process — `MemoryDb`, a `ManualClock`, a stub LLM, a
fake Stripe, a fake Google, all in `server/tests/helpers.ts`. **No test may reach a
network.** A new stage that needs an external call injects it through `Services` rather
than calling a global.

`server/tests/wire.test.ts` is the one worth keeping alive: it points the extension's
own client straight at the server's request handler, so the two halves of the protocol
are tested against each other instead of against separate assumptions about each other.

## Maintaining this file

Keep this file for knowledge useful to almost every future session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or
command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar and keep entries concise.
