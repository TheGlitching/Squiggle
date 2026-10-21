# Security

## What this extension handles

Squiggle holds one thing worth protecting: the API key you give it for your own
LLM provider. Everything else it touches is the public text of the page you are
reading.

In BYOK mode there is no backend. No account, no telemetry, no server belonging
to this project. The key is encrypted with AES-GCM and kept in your browser's
extension storage; it leaves your machine only as an `Authorization` header on a
request to the provider you chose, and only when you ask for an analysis.

A hosted mode is being built alongside it, for readers who do not want to hold
an API key. It is opt-in, it requires signing in, and it changes the data flow,
so it has its own section below. **BYOK is unaffected by any of it: a
bring-your-own-key user's key never reaches our server, and never leaves their
browser.**

## What it can read

The extension reads the article in the tab you point it at, and sends that text to
your provider so it can be analysed. During the research stage it also asks your
provider to search the web for the factual claims the audit questioned. That is
the whole data flow: your page, your provider, your key.

It declares no content script. The reader that extracts the article is injected into
the tab you invoke the extension on (`activeTab` and `scripting`), when you ask for an
analysis, so nothing runs on a page you have not pointed it at. Its only host access
is the four model providers it can call with your key (`api.anthropic.com`,
`api.openai.com`, `openrouter.ai`, `generativelanguage.googleapis.com`).

Access to every http and https site is an optional permission, off until you grant it
in the settings and withdrawable there. It lets you analyse a page after changing site
without invoking the extension again and, with your own key, lets the extension fetch
the sources an article cites. Hosted mode adds no permission.

## Hosted mode

*This section describes the server that is being built. It is not deployed yet;
it is documented here as it lands, not after.*

In hosted mode the analysis runs on our infrastructure, on our own OpenRouter key,
instead of on a key you hold. The model is DeepSeek V4.1 Flash, an open-weight
model, served by inference hosts that OpenRouter chooses (pinning a closed list of
hosts is tracked separately). Squiggle only processes public articles: the text of
the page being read, its URL and the pages it cites. No reader identity is sent
with a request. What that means concretely:

- **the article text you are reading is sent to our server**, and from there to
  OpenRouter and the inference host that runs the model. It is not stored: the
  audit call is the only thing that needs it, and it is dropped when that request
  ends. No table in our database holds it.
- **the finished report is cached and shared, and it contains excerpts.** Each
  finding carries a verbatim quote of the article, and the report carries a
  summary. Two readers of the same article get the same report, which is what
  makes the service affordable. The cache key is the canonical URL, computed on
  the server, plus a fingerprint of the article's text, plus the model and the
  prompt version.
- **our server never fetches the article itself.** It only ever fetches pages
  the article cites, and only through an SSRF-hardened fetcher.

### The controls

- **Request signing.** Every `/v1/*` call carries an ECDSA (P-256) signature
  over `METHOD \n PATH \n NONCE \n TIMESTAMP \n SHA256(BODY)`, verified against
  the public key that install registered when it signed in. The body hash is in
  the signed string, so the article content of a request is covered, not just
  the account and the clock. Nonces are single-use (an atomic check-and-set) and
  timestamps must be within five minutes.
- **Origin policy.** The cookie-authenticated endpoints refuse a request with a
  wrong `Origin` *or with none at all*, unless the browser vouches that it is
  same-origin with `Sec-Fetch-Site: same-origin` (a browser sends no `Origin` on
  a same-origin `GET`, and page script cannot set that header). `cross-site`,
  `same-site`, `none` and an absent header are refused. The OAuth redirects are exempt because a
  top-level navigation carries no `Origin` by design; their anti-forgery control
  is the OAuth `state`. `/v1/*` is exempt because the signature is strictly
  stronger evidence than a header, and a mismatched origin is still refused
  there.
- **Ceilings, not just quotas.** One analysis in flight per account, an hourly
  per-account ceiling, and an hourly ceiling for the whole service. The last one
  is what bounds the worst case: every account compromised at once still cannot
  spend more than one hour of that ceiling.
- **The cache is bound to the text, not only the address.** The server never
  fetches the article, so the text it analyses is whatever the client sent. A
  report is filed under the SHA-256 of the normalised text (letters and digits
  only, lowercased, Unicode-normalised) that the server computed itself from
  that text, never a hash the client declared, and a preflight only hits when
  the reader's own page yields the same hash. Text invented for a real
  article's address therefore sits under a key no honest reader asks for. The
  same rule stops a corrected article from being served its old report. The
  title, author and outlet are not part of the fingerprint.
- **Report sanitization.** A cached report is written by one reader's analysis
  and served to every later reader of the same article, which makes the cache
  the one place where text derived from a hostile article could reach someone
  who never chose to trust its author. Every report is stripped of control and
  bidirectional-override characters, capped per field and per array, and refused
  by the cache entirely if it is still over the size cap.
- **Logs carry no article.** The log record has no free-text field at all, only
  fixed event names, numbers, our own opaque ids, and the SHA-256 of the article
  URL. A rejected payload is logged by the *name* of the field that failed,
  never by its value. Every response carries an opaque `X-Squiggle-Request-Id`
  you can quote in a report.
- **Secrets.** Our OpenRouter key, the database URL, the mail and billing keys
  live in the Cloudflare secret store. None of them is in this repository, in any
  example, or in any test. The provider key travels in a request header rather
  than a query string, so it cannot end up in a URL log or a devtools panel,
  which is also true of *your* key in BYOK mode.

### Residual risks, stated plainly

- **A non-browser script can forge headers.** `Origin` is only meaningful
  because a browser sets it; `curl` sets whatever it likes. What that buys an
  attacker is bounded by the signature: without an install's P-256 private key
  they cannot make a valid `/v1/*` request at all, and with a stolen one they
  can burn that account's own credits. Not another account's data, not any key.
- **A stolen extension token plus its key is a full compromise of that
  account.** Both live in the extension's encrypted storage, which protects
  against casual inspection, not against someone already inside your browser
  profile. Signing out in the extension discards the session on that device. Revoking
  an install from the account page is not available yet; until it is, a stolen
  token stays valid until it expires (90 days).
- **The cache answers "has anyone analysed this page?"** Any signed-in account
  can call the preflight for an arbitrary URL and learn whether a report exists
  for it. That is inherent to a shared cache, since the saving comes precisely from
  one reader's analysis being visible to the next, and it discloses nothing
  about *who* ran it, since the usage ledger deliberately does not record which
  article an analysis was of. It is still a corpus-level signal, and it is
  named here rather than left to be discovered.
- **The shared cache is a shared read.** If two readers open the same article,
  the second is served a report the first paid for. That is deliberate, and it
  is why the sanitizer exists. What it does mean: a report is not private to the
  reader who produced it.
- **We see which articles are analysed.** The URL is hashed in the logs, but the
  cache necessarily holds a report per article, with excerpts of it, and our
  model calls necessarily reach OpenRouter and the host that runs the model. Hosted mode is a trade: you stop needing an API key, and you
  start trusting us with the article. BYOK exists precisely for people who would
  rather not.

## Reporting a vulnerability

Open a [security advisory](https://github.com/TheGlitching/Squiggle/security/advisories/new)
rather than a public issue, and give it a few days before disclosing.

Things worth reporting:

- any path by which a stored key could be read by a page, another extension, or a
  provider other than the one it was saved for
- any way the content script could be induced to execute page-controlled script
- a way a crafted article could make the extension send more than that article's
  own text to a provider
- in hosted mode: any way to make our server fetch a host the article did not
  cite, to reach another account's data or run, or to place text in the shared
  cache that a later reader would be served

Things that are known and intended:

- the key is recoverable by anyone with access to your unlocked browser profile.
  Extension storage is not a secret store, and the encryption protects against
  casual inspection of storage, not against someone already inside your session.
- article text is sent to a third-party provider. That is the entire point of a
  bring-your-own-key tool, and which provider sees it is your choice.
