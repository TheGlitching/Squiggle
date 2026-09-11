# Squiggle

A browser extension that tells a reader how well the article in front of them holds
up: which facts are actually sourced, which are checkable and merely unsourced, which
the evidence undermines, and where the wording is doing work the evidence does not
support.

It reads the page you are on, audits it against a structured grid, checks the audit's
own factual objections against the web, and returns a score out of 100 with the
weaknesses it found and the exact sentence each one refers to. Findings are
highlighted in the article itself, and hovering one in the panel connects it to the
passage it came from.

Chrome and Firefox, Manifest V3. Bring your own API key: no backend, no account, no
telemetry. A hosted mode, for readers who would rather not hold an API key, is
[under construction](#hosted-mode-under-construction).

## Who it is for

Someone reading a news article, not the journalist who wrote it. A reader cannot edit
the piece, so the extension never offers rewrite advice or a pre-publication verdict.
It explains how solid the piece is and why, and leaves the conclusion to the reader.

## Inspiration

The starting point was a set of industrialised article-review prompts by
[@sjowall69](https://x.com/sjowall69), which he generously shared with me when I
asked. The idea of holding an article to explicit, weighted criteria rather than a
vague impression comes from there, and I am grateful for it.

What this extension does has since diverged, deliberately. It addresses a reader
instead of an author, so the criteria that graded editorial craft were dropped;
framing and rhetorical technique became a domain of its own; assertions are checked
against evidence rather than judged from memory; and the score is derived from the
findings instead of being volunteered alongside them. None of that should be read as
representing his work, and his document is private and not reproduced here.

## What it evaluates

Five weighted domains, summing to 100, chosen for a reader judging trustworthiness
rather than an editor grading craft:

| Domain | Weight |
|---|---|
| Robustesse factuelle et sourcing | 35 |
| Solidité logique et argumentative | 25 |
| Cadrage et procédés rhétoriques | 25 |
| Déontologie et transparence | 10 |
| Soin de la langue | 5 |

**Framing and rhetorical technique** carries as much weight as logic, because a piece
can be factually defensible sentence by sentence and still mislead: a headline
overstating what the body supports, loaded wording standing in for evidence, opinion
carrying the grammar of established fact, selective quotation, a real disagreement
presented as settled, or authority invoked without ever being named.

The composite maps to one of four bands - *solide* at 80 and above, *perfectible* at
70, *fragile* at 60, *problématique* below that.

Findings are classified as a logical fallacy, an unsupported claim, an overreach, a
missing source, a framing problem, or a strength worth keeping.

## How a factual claim is judged

Each factual objection the audit raises is checked, and the result describes **what
the article said** - never the audit's rebuttal of it. Four states, from the method:

| State | Meaning |
|---|---|
| Vérifiée | evidence was consulted and it backs the article |
| Non sourcée dans l'article | checkable, the article simply does not source it |
| Douteuse | evidence casts doubt on the article's statement |
| Non vérifiable telle qu'écrite | cannot be checked as worded |

The middle two are the distinction that matters. A claim nobody sourced is a sourcing
observation; a claim the evidence undermines is a defect. Treating them alike tells a
reader an ordinary claim is shaky.

When evidence **confirms** the article, the audit's objection was wrong. It is
withdrawn rather than published as a fault, and recorded with the sources that
cleared it, so a real disagreement is visible instead of silently deleted.

## The score answers to the findings

A model asked for a mark and a list of defects will happily supply both and let them
disagree - describing a fabricated poll accurately in its own weakness note and still
scoring that domain generously. So the mark is not taken at face value: every defect
the audit raises removes a share of the marks it awarded in that domain, scaled by
severity and by how well the defect stands up.

That is a rate, not a ceiling. Defects compound, a badly sourced piece approaches zero
on its own, and two articles judged differently stay apart afterwards - the
distinction a cap would flatten. Evidence only ever pulls a mark down.

## Bring your own key

In this mode there is no backend and no intermediary. You supply a key for one of four
providers and calls go from your browser straight to them:

- Anthropic
- OpenAI
- OpenRouter
- Google Gemini

The key is encrypted with AES-GCM and stored in your browser's extension storage. It
leaves your machine only as a request to the provider you chose. With no key
configured the extension says so and stops - it will never substitute a sample report
for an analysis of the page you are looking at.

See [SECURITY.md](SECURITY.md) for the data flow and how to report a vulnerability.

## Hosted mode (under construction)

Holding an API key is a real barrier: you need an account with a model provider, a
payment method on it, and enough of an idea of what a token costs to be comfortable.
Most readers of a news article have none of that, and asking them to get it is asking
them not to use the tool.

So there will be a second mode: sign in, and the analysis runs on our infrastructure
against credits — three free, then a small monthly subscription. **It is a choice, not
a migration.** BYOK stays exactly as it is, remains the default, and is what the
extension does with no account at all.

What changes, stated plainly, because it is the whole trade:

- the article text goes to our server, and from there to the configured model provider
  (OpenRouter by default; Gemini is a deployment setting away). It is used for the
  audit call and dropped when that request ends; no table in our database holds it.
- the finished report is cached and shared, so a second reader of the same article
  gets it for free and never sends the article anywhere.
- our server never fetches the article itself — your browser supplies it, from the
  page you are already reading. A paywalled article is analysed as far as you can read
  it, and flagged as partial.

[PRIVACY.md](PRIVACY.md) has the retention table and the subprocessors,
[SECURITY.md](SECURITY.md) the controls and the residual risks, and
[ARCHITECTURE.md](ARCHITECTURE.md) the topology.

## Install from source

```bash
npm install
npm run build:chrome     # -> dist/chrome
npm run build:firefox    # -> dist/firefox
```

**Chrome**: open `chrome://extensions`, enable Developer mode, choose *Load
unpacked*, and select `dist/chrome`.

**Firefox**: open `about:debugging#/runtime/this-firefox`, choose *Load Temporary
Add-on*, and select any file inside `dist/firefox`.

Then open an article, open the side panel, add your key via the gear icon, and run the
analysis.

## Layout

```
src/                  the extension
  crypto/             AES-GCM key encryption and local storage
  content/            article extraction, range tracking, in-page highlight overlay
  background/         service worker, tab state, analysis lifecycle
  sidepanel/          the panel application
  ui/                 design system, gauges, finding cards, evidence display, onboarding
  adapters/           translation between engine, content-script and UI vocabularies
  messaging/          typed cross-context messaging and the shared RPC contract

shared/src/           imported by BOTH the extension and the server
  engine/             criteria, prompts, research, reconciliation, scoring
  client/             provider clients (OpenAI, OpenRouter, Gemini)
  auth/signing.ts     the request-signing protocol for hosted mode

server/src/           the hosted backend (Cloudflare Workers + Neon)
  auth/               magic link, Google OAuth, extension tokens, signature checks
  analyze/            the five analysis stage endpoints and the shared cache
  billing/            Stripe checkout, portal, webhook, quotas
  index.ts            the config-driven LLM provider gateway (LLM_PROVIDER)
```

`shared/` is not a convenience. The moment the same analysis can run in two places, a
duplicated prompt or scoring rule is a latent divergence between what a BYOK reader
and a hosted reader are told about the same article.

[ARCHITECTURE.md](ARCHITECTURE.md) covers the pipeline and why it is ordered the way
it is. [docs/product-spec.md](docs/product-spec.md) is the original product spec.

## Privacy

In BYOK mode nothing reaches a server of mine, because there is no server of mine: the
article and your key go straight from your browser to the provider you chose. Hosted
mode is the deliberate exception, and it is opt-in and account-gated.
[PRIVACY.md](PRIVACY.md) accounts for every byte that leaves in either mode, and
[SECURITY.md](SECURITY.md) covers how the key is held.

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) has the build, the gates and the conventions.
Releases are documented in [docs/RELEASING.md](docs/RELEASING.md).

## Licence

MIT, see [LICENSE](LICENSE).
