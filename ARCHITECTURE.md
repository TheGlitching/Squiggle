# Architecture

## Topology

```
+-----------------------------------------------------------------------------+
|                               Web Browser                                   |
|                                                                             |
|  +------------------------+                     +------------------------+  |
|  |     Active Web Page    |                     |   Sidepanel / Sidebar  |  |
|  |  +------------------+  |                     |  +------------------+  |  |
|  |  |  Content Script  |  |                     |  |  React 18 App    |  |  |
|  |  |  - Extractor     |  |                     |  |  - Score gauges  |  |  |
|  |  |  - Range Tracker |  |                     |  |  - Finding cards |  |  |
|  |  |  - Shadow DOM    |  |                     |  |  - Evidence      |  |  |
|  |  +--------+---------+  |                     |  +--------+---------+  |  |
|  +-----------|------------+                     +-----------|------------+  |
|              |                                              |               |
|              +-------------------+      +-------------------+               |
|                                  |      |                                   |
|                                  v      v                                   |
|                     +-------------------------------+                       |
|                     |  Background Service Worker    |                       |
|                     |  - Tab State Manager          |                       |
|                     |  - BYOK Client Factory        |                       |
|                     |  - Analysis Pipeline          |                       |
|                     |  - Cross-Context Port Bridge  |                       |
|                     +---------------+---------------+                       |
|                                     |                                       |
+-------------------------------------|---------------------------------------+
                                      v
                  +---------------------------------------+
                  |  BYOK LLM Providers (direct, no proxy)|
                  |  - Anthropic                          |
                  |  - OpenAI                             |
                  |  - Google Gemini                      |
                  |  - OpenRouter                         |
                  +---------------------------------------+
```

In BYOK mode there is no server belonging to this project: the only outbound traffic
is from the reader's browser to the provider whose key they configured.

## Hosted mode

*In production on [squiggle.fr](https://squiggle.fr). Documented here as it changes.*

A reader who does not want to hold an API key can sign in and have the analysis run on
our infrastructure instead, on our own key, against credits. The provider and the model
are deployment settings, not a hard-coded client: `LLM_PROVIDER` selects one of the
gateway's providers (OpenRouter by default, Gemini kept selectable), `OPENROUTER_MODEL`
names the exact catalogue id, and the matching key lives in the secret store. It is a
mode selector, not a replacement: BYOK is untouched, and the extraction, the prompts,
the scoring and the reconciliation are the same code either way — that is what the
`shared/` workspace is for.

The same Worker serves the web app (`web/dist`) as static assets, so the app and the API
share one origin; only the API paths reach the Worker code. See
[docs/DEPLOYING.md](docs/DEPLOYING.md).

The web app is a second client of the same analysis. Its analysis page sends the text a
reader pasted to `/web/analyze/*`, the same five stages as `/v1/analyze/*`, identified by
the session cookie instead of an install's signature and refused without an allowed
`Origin`. Past that check both reach the same handlers on the same account, so the trial
and the subscription are one, and the client is the same `HostedAnalysisClient`
(`shared/src/hosted/client.ts`) in its session mode. A pasted text cites no links, so the
web route refuses any `citedSources`: a run started from the site never makes the server
read a page. A visitor without an account walks the same stages on `/web/anon/*`, with no
cookie, the client in its `session: 'none'` mode: one analysis per IP and per day, 40 a
day for the site, from the web app's origin only.

A third client is the forwarding address, `verifier@squiggle.fr` (`server/src/mail/`).
Cloudflare Email Routing hands each message to the Worker's `email()` handler, which drops
anything that is not a verified account's address authenticated by Cloudflare (DMARC, or
DKIM or SPF aligned with the From domain), takes the forwarded text out of the message
(`forwarded.ts`), cuts it into blocks as a paste is (`shared/src/hosted/pastedText.ts`, so
the same words share one report), and runs the audit in process. The research, the
finalize and the reply run from a Cloudflare Queue, which carries only the run's id: a
queue consumer has fifteen minutes, which an e-mail event is not documented to give. The
reply goes through Brevo, as HTML and plain text from one template (`reply.ts`): the
mark, the summary, the most severe passages, a strength and the source checks, with a
button to `/analyser?rapport=<fingerprint>`, which opens the cached report on the
reader's session.

```
+-----------------------------+
|         Extension           |
|  extraction, panel, keys    |
+--------------+--------------+
               | signed (P-256), one call per stage
               v
+-----------------------------+       +---------------------+
|   Worker (Cloudflare)       |──────▶| configured provider |
|   auth, quotas, stages      |       | OpenRouter / Gemini |
|   shared report cache       |       +---------------------+
+------+---------------+------+       +---------------------+
       |               |──────────────▶  the article's own  |
       v               |                 cited sources      |
+---------------+      |               +---------------------+
| Neon Postgres |      |                (SSRF-hardened; the
+---------------+      |                 article itself is
                       |                 NEVER fetched)
                       v
              +----------------+
              | Stripe, Brevo  |
              +----------------+
```

Five calls make one analysis, because each is one or two model calls (5-25 s) and a
single 3-minute request would time out on a serverless runtime:

```
check  ->  audit  ->  research (x N)  ->  source-check (x M)  ->  finalize
  |                                                                  |
  cache hit: 0 calls, 0 credits                    reconcile, score, cache, 1 credit
```

Three invariants hold that shape together.

**The server never fetches the article.** Its text always comes from the client: the
extension, from the page the reader is already looking at, or the web app, from what the
reader pasted. A paywalled article is therefore analysed exactly as far as the reader can
read it, flagged as partial, and our IP never appears in a publisher's logs. An address
given beside a pasted text is a key and a line of the prompt, never a request. The only
pages the server fetches are the sources the article itself cites, through an
SSRF-hardened fetcher.

**The intermediate state stays on the server.** It lives in an `analysis_runs` row for
an hour; the client names a run, a finding and a claim, never their content. Finalize
writes into a cache every other reader is served from, so anything a client could edit
between stages would be an injection channel between readers. That row does not hold
the article's text either: only the audit needs it, and it is dropped when that
request ends.

**A plan is only ever written by the Stripe webhook.** A client cannot declare itself
subscribed; whether an account is active is a fact Stripe reports, not a claim
anybody makes.

The cache key is the canonical article URL plus a fingerprint of the article's text plus
the model plus the prompt version, so changing any of them invalidates the stored
report (the same article judged by a different model is a different report). The
fingerprint (`articleTextHash` in `shared/`) is computed by the extension to ask the
cache and by the server, from the text it was given, to file a report: a client cannot
declare the hash a report is stored under, so text invented for a real article's
address is never served to a reader whose page says something else.

A text pasted without an address is filed under a fixed key, `PASTED_TEXT_KEY`, that no
http(s) URL can canonicalise to, so its report is keyed by the fingerprint alone: the same
words get the same report, any other words another one. The web app makes the title the
first block, so the fingerprint covers it too.

A link shared from a phone app (a newspaper's or YouTube's) carries no text, so it can
never meet that key. `GET /web/anon/link` answers it by address alone, among the reports
flagged `read_by_extension`: those built from a text the extension read on the page
itself, never one pasted on the site, which anyone could have invented under a real
address. It returns the most recent unexpired one for today's model and prompt version,
fetches nothing, and costs no credit. Every link to one page canonicalises to one address
(`canonicalUrl.ts`): a video's `youtu.be`, Shorts and watch links to its watch page, an
article's AMP, mobile and Google AMP cache editions to the publisher's page. What it serves
holds the article's words to short quotations (`citations.ts`: 25 words at most each, a
tenth of the text's words in all), and the web app opens it on a link to the publisher.

## The installed app

The web app is a PWA (`web/public/manifest.webmanifest`, `web/sw.js`), opening on the
analysis page. Its service worker caches the build's own files and nothing else: a page
navigation gets the app's one `index.html`, fresh or from the cache when offline, and
every request under the Worker's paths goes to the network and is never stored. Android
can share an article to it, or screenshots of one (Web Share Target, a multipart `POST
/analyser`). The worker reads that POST itself and never sends it on: the screenshots wait
in its `squiggle-partage` cache, and the title, text and address go into the query string
of a redirect to `/analyser`. It answers every navigation by fetching the bare `/`, so a
shared text in that query string never leaves the device, and the page moves it into the
form and wipes it from the address bar. `vite.config.ts` writes the file list and a
content-derived version into the worker at build time.

Screenshots, imported on `/analyser` or shared, are read on the device (`web/src/captures.ts`):
Tesseract in WebAssembly with its French model, served from `/ocr/` on our own origin
(copied beside the build by `vite.config.ts`, kept out of the worker's shell, loaded on a
first import only). The lines repeated at the same place of most screenshots (status bar,
app header, tab bar) are dropped, an overlap between two screenshots is kept once, and the
text lands in the form for the reader to check. What reaches the server is that text, as
for a paste; no image ever does.

A PDF is read the same way, on the device, by pdf.js. `shared/src/extract/pdf.ts` puts its
runs of text back into headings and paragraphs (running headers, page numbers, footnotes and
figure labels dropped, a sentence carried over a column or a page) for both clients. The site
(`web/src/pdf.ts`) loads pdf.js's legacy build from `/pdf/` on a first PDF, with
`web/pdf/compat.mjs` for what an older phone's browser lacks, and reads a scanned PDF's pages
with the screenshots' OCR. A PDF shared to the Android app takes the screenshots' way through
the share target. The browsers let no extension into their PDF viewer, so the panel's
« Analyser ce PDF » sends the tab to the extension's own page (`src/pdf/`): it fetches the
file from the address the tab showed, with the reader's browser and the access to that one
site asked for in the click, lays it out as an article, loads the content script into itself
and starts the analysis, so the panel and the highlights work there as on a news page. The
content script answers only its own `FC_*` messages, since in an extension page it also hears
the panel's calls to the background.

A recording (a saved video, a voice message, a podcast episode), imported on `/analyser`
or shared to the app, is decoded on the device (`web/src/media.ts`): only its sound, mono at
16 kHz, fifteen minutes at most (one part per analysis), goes to `POST /web/transcribe` as a
WAV file (`shared/src/hosted/wav.ts`). That fixed format lets the server read the exact
duration from the bytes before anything is paid for; it then checks the account has an
analysis left and that the account's and the site's daily minutes allow it
(`TRANSCRIBE_DAILY_MINUTES`, the spending cap), and sends the sound to Voxtral on OpenRouter
a minute at a time (`server/src/transcribe/`). The timed text comes back into the form, like
a pasted transcript; neither the sound nor the text is kept. The Android app hands a shared
recording to the site's share target inside the Trusted Web Activity.

A podcast episode's own transcript, when its feed publishes one (`podcast:transcript`), is
read by the extension in the reader's browser (`src/podcast/transcript.ts`): the page's
feed, the episode in it, then the transcript, analysed like a video's captions. The server
never fetches the feed, the transcript or the episode. A feed whose host refuses
cross-origin reads asks the reader for access to that one site.

`SECURITY.md` has the controls and the residual risks; `PRIVACY.md` has the retention
table and the subprocessors.

## The classroom mode

`/classe` turns a report the teacher just got, or a session file they downloaded, into a
lesson, and adds nothing to the server. The session (the pasted blocks, the report, the
reveal order, and the teacher's own remarks, kept beside the report and never in it) lives in
the tab's session storage and in the `.squiggle` file; `web/src/classe.ts` holds its model and
the file format. Every view that shows a teacher's remark, the board included, says it is the
teacher's. During the lesson two windows of the same browser
share it: the desk on the teacher's screen holds the state, the board (`/classe/tableau`)
on the projector shows what it is told and sends its keys back, over a `BroadcastChannel`
that never leaves the browser. A session opened from a file is a report the server can no
longer vouch for, so the board says it came from a file instead of presenting it as
Squiggle's own analysis; a signature over the report would lift that, and is not built.

## The analysis pipeline

The ordering here is the design, not an implementation detail. It exists because an
earlier arrangement produced a specific failure.

```
extract -> audit -> research -> reconcile -> score
```

1. **Extract** (`shared/src/extract/extractor.ts`) turns the page into ordered blocks with
   stable coordinates, plus the sources the article itself hyperlinks. Links to the
   publisher's own registrable domain are navigation, not citations, and are excluded.

2. **Audit** (`shared/src/engine/pipeline.ts`, `prompts.ts`) asks the model once, from the
   article alone, for domain marks and findings. Each finding quotes the text it is
   about and names a block.

3. **Research** (`shared/src/engine/research.ts`) takes the audit's *own* factual findings
   and checks them against evidence. The claim under test is always **what the
   article stated**, never the audit's rebuttal of it.

   The earlier design ran a separate extraction pass to pick claims *before* the
   audit, so the checked set was disjoint from what the audit went on to doubt. The
   audit's objections therefore reached the reader unchecked, straight from the
   model's memory. Dropping that pass also costs one call fewer.

4. **Reconcile** (`shared/src/engine/validator.ts`) is code, not a second model call.
   Evidence confirming the article **withdraws** the objection, recording it in
   `research.withdrawn` with the sources that cleared it rather than deleting it.
   Evidence contradicting the article keeps the finding and attaches the sources.

5. **Score** (`shared/src/engine/scoring.ts`) couples the marks to the findings. Each defect
   removes a *share* of the marks awarded in its domain, scaled by severity and by
   how well the defect stands up. It is a rate, not a ceiling: defects compound, and
   two articles judged differently stay apart afterwards. Evidence only ever pulls a
   mark down.

## The two taxonomies

**Score domains** (`SCORE_DOMAINS` in `shared/src/engine/types.ts`), five, summing to 100.
They are weighted for a reader deciding whether to trust a piece, not for an editor
grading craft.

**Assertion states** (`VerificationState`), four: `verifiee`, `non-sourcee`,
`douteuse`, `non-verifiable`. The distinction that
matters most is between the middle two: a claim the article simply does not source is
a sourcing observation, while a claim the evidence undermines is a defect. Collapsing
them tells a reader an ordinary claim is shaky.

A sourcing question is not a truth question, so `source-absente` findings are not
submitted to research: confirming the underlying fact would not make the article
sourced, and would overwrite the observation.

## Subsystems

### Content script
Built to `content-script.js` and injected by the background into the tab the reader
invoked the extension on (`activeTab` and `scripting`); the manifests declare no
content script, and a second injection into the same tab is a no-op.

- **`ArticleExtractor`** - JSON-LD (`schema.org/NewsArticle`), semantic `<article>`,
  then text-density heuristics. Emits character offsets and XPath coordinates per
  block, plus the article's own citations.
- **`RangeTracker`** - three-tier highlight anchoring: DOM range from XPath and
  offsets, exact quote search, then fuzzy match with sliding-window disambiguation.
- **`ShadowHighlightOverlay`** - closed shadow root, so host page CSS cannot bleed in
  and the overlay cannot leak out. Repositions via `ResizeObserver` and
  rAF-throttled scroll.

### YouTube videos
On a YouTube watch or Shorts page the background reads the video's captions instead of
injecting the article reader (`src/video/youtube.ts`). A function run in the page's own
world, on the reader's click, switches captions on through the player's API so the
player fetches the caption file with the token it alone generates, reads that file
again (`fmt=json3`, every cue with its time), and switches captions back. A pre-roll
ad that autoplay left stalled is played muted, and the video paused back at its start
once read. The cues become paragraph blocks that remember where each cue starts, so a
finding's quote maps back to the second it is said at; the panel shows that time on the
finding and a click seeks the player there. The text then runs the ordinary pipeline
under the address `https://www.youtube.com/watch?v=<id>`, and that address alone is
what tells the audit prompt (and the hosted counter `run_started_video`) that it is
reading a spoken transcript (`shared/src/engine/video.ts`).

### Short messages
A text of at most 1 200 characters (`MAX_MESSAGE_CHARS`, `shared/src/engine/message.ts`)
is a short message: a chain forwarded on a messaging app, a two-line post, a rumour. The
audit reads it under its own instructions (`MESSAGE_SYSTEM_PROMPT`), not the article grid,
which judges the sourcing and the structure of a long text and would mark a rumour on what
it cannot hold. The report has the same shape; its summary answers four questions (what it
is about, who says it, what is known, what is missing), its findings name the signs that
usually come with a false message (no source, urgency, a call to forward, a figure without
an origin), and its main claim always goes to research, so what is known about it carries
sources rather than the model's memory. Like the video mode, the mode is read from the text
itself, never from a client's flag, so the fingerprint that keys the cache also fixes the
instructions. A video's transcript stays one however short. A message the extension read
(a passage the reader selected, `src/content/selection.ts`, or a short social post) is never
served by link alone: it is not the page's article.

### Background and messaging
- **`UnifiedRuntime`** (`src/messaging/runtime.ts`) - the one place Chrome's
  `chrome.*` and Firefox's `browser.*` differences are absorbed.
- **`TypedMessageBus`** - typed RPC and event broadcast across the three contexts.
- **`TabStateManager`** - per-tab analysis state and lifecycle cleanup. The panel
  outlives many pages, so it follows the page it is pointed at rather than the page
  it was opened on.

### Keys
- **`SecureKeyStorage`** (`src/crypto/storage.ts`) - AES-GCM with PBKDF2 derivation.
  The encrypted key lives in shared extension storage and the seed that decrypts it
  must be readable from both the panel and the worker, which is why the seed is not
  kept in `localStorage`: a service worker has no such binding.
- **`LLMClientFactory`** - one interface over the four providers, with streaming and,
  where the provider supports it, web search and grounded answers.

### Adapters
`src/adapters/findingAdapters.ts` exists because the engine, the content script and
the panel each name the same concepts differently. That translation lives in one
place instead of being re-derived at every call site.

## Workspaces

```
src/       the extension: extraction, panel, background worker, key storage
shared/    the analysis engine, the provider clients, and the request-signing
           protocol - imported by BOTH the extension and the server, so a
           prompt, a score or a signature can never mean two different things
server/    the hosted backend (Cloudflare Workers + Neon)
web/       the public web app: sign-in, subscription, the extension bridge, and
           the paste-to-analyse page; reads shared/ by relative path, never src/
```

`shared/` exists for one reason: the moment the same analysis could run in two places,
any duplicated prompt or scoring rule would be a latent divergence between what a BYOK
reader and a hosted reader are told about the same article. The request-signing module
is there for the same reason at a smaller scale — the extension signs and the server
verifies, and a disagreement about the canonical string would silently break
authentication for every install.

## Known dead code

`src/canvas/` renders a shareable review card. Nothing imports it, so it is absent
from the built bundle. It is either worth wiring to a real export control or worth
deleting; leaving it unreferenced is the one thing that helps nobody.
`bin/fractal-integrate-check.sh` in the harness repo reports the current orphan list.
