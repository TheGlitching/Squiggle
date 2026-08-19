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

There is no server belonging to this project. The only outbound traffic is from the
reader's browser to the provider whose key they configured.

## The analysis pipeline

The ordering here is the design, not an implementation detail. It exists because an
earlier arrangement produced a specific failure.

```
extract -> audit -> research -> reconcile -> score
```

1. **Extract** (`src/content/extractor.ts`) turns the page into ordered blocks with
   stable coordinates, plus the sources the article itself hyperlinks. Links to the
   publisher's own registrable domain are navigation, not citations, and are excluded.

2. **Audit** (`src/engine/pipeline.ts`, `prompts.ts`) asks the model once, from the
   article alone, for domain marks and findings. Each finding quotes the text it is
   about and names a block.

3. **Research** (`src/engine/research.ts`) takes the audit's *own* factual findings
   and checks them against evidence. The claim under test is always **what the
   article stated**, never the audit's rebuttal of it.

   The earlier design ran a separate extraction pass to pick claims *before* the
   audit, so the checked set was disjoint from what the audit went on to doubt. The
   audit's objections therefore reached the reader unchecked, straight from the
   model's memory. Dropping that pass also costs one call fewer.

4. **Reconcile** (`src/engine/validator.ts`) is code, not a second model call.
   Evidence confirming the article **withdraws** the objection, recording it in
   `research.withdrawn` with the sources that cleared it rather than deleting it.
   Evidence contradicting the article keeps the finding and attaches the sources.

5. **Score** (`src/engine/scoring.ts`) couples the marks to the findings. Each defect
   removes a *share* of the marks awarded in its domain, scaled by severity and by
   how well the defect stands up. It is a rate, not a ceiling: defects compound, and
   two articles judged differently stay apart afterwards. Evidence only ever pulls a
   mark down.

## The two taxonomies

**Score domains** (`SCORE_DOMAINS` in `src/engine/types.ts`), five, summing to 100.
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
- **`ArticleExtractor`** - JSON-LD (`schema.org/NewsArticle`), semantic `<article>`,
  then text-density heuristics. Emits character offsets and XPath coordinates per
  block, plus the article's own citations.
- **`RangeTracker`** - three-tier highlight anchoring: DOM range from XPath and
  offsets, exact quote search, then fuzzy match with sliding-window disambiguation.
- **`ShadowHighlightOverlay`** - closed shadow root, so host page CSS cannot bleed in
  and the overlay cannot leak out. Repositions via `ResizeObserver` and
  rAF-throttled scroll.

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

## Known dead code

`src/canvas/` renders a shareable review card. Nothing imports it, so it is absent
from the built bundle. It is either worth wiring to a real export control or worth
deleting; leaving it unreferenced is the one thing that helps nobody.
`bin/fractal-integrate-check.sh` in the harness repo reports the current orphan list.
