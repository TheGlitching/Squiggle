# Fourches Caudines

A browser extension that puts any press article through a professional editorial
review, in place, in the page you are reading.

It reads the article, applies a structured critique grid, and returns a verdict
with a score out of 100, a breakdown across ten editorial domains, the individual
weaknesses it found with the exact quote each one refers to, and a prioritised
revision plan. Findings are highlighted directly in the article, and hovering a
finding in the panel connects it to the sentence it came from.

Chrome and Firefox, Manifest V3. Bring your own API key.

## Credit

The editorial methodology behind this extension is not mine. It comes from the
industrialised article-review prompts published by
[**@sjowall69**](https://x.com/sjowall69) — the criteria, the scoring domains and
the review philosophy are all theirs. This repository is an implementation of that
method as a browser tool, nothing more.

The source prompt document itself is not redistributed here. Go read the original.

## What it evaluates

Ten weighted domains, summing to 100:

| Domain | Weight |
|---|---|
| Factual robustness and sourcing | 20 |
| Logical soundness | 15 |
| Editorial coherence | 15 |
| Clarity and readability | 10 |
| Structure and progression | 10 |
| Angle and impact | 10 |
| Spelling and grammar | 5 |
| Connection to the reader's world | 5 |
| Preservation of the author's voice | 5 |
| Format and calibration | 5 |

The composite score maps to one of four verdicts: *publier*, *publier après
corrections mineures*, *réviser avant publication*, *bloquer*.

Findings are classified as a logical fallacy, an unsupported claim, an
overreach, a missing source, a framing bias, or a strength worth keeping.

## Bring your own key

There is no backend and no intermediary. You supply a key for one of four
providers and calls go directly from your browser to them:

- Anthropic
- OpenAI
- OpenRouter
- Google Gemini

The key is encrypted with AES-GCM and stored only in your browser's local
extension storage. It never leaves your machine except as a request to the
provider you chose. With no key configured, the extension runs against a bundled
demo article so you can see the output shape before committing a key.

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

Then open an article, open the side panel, add your key via the gear icon, and
run the analysis.

## Development

```bash
npm run dev        # Vite dev server
npx tsc --noEmit   # typecheck
npm test           # unit and integration tests
```

Typecheck, build and tests are all expected to pass before a change lands.

## Layout

```
src/
  engine/      review criteria, prompt construction, response validation, scoring
  client/      provider clients (Anthropic, OpenAI, OpenRouter, Gemini)
  crypto/      AES-GCM key encryption and local storage
  content/     article extraction, range tracking, in-page highlight overlay
  background/  service worker, tab state, analysis lifecycle
  sidepanel/   the panel application
  ui/          design system, gauges, verdict stamp, finding cards, onboarding
  canvas/      shareable review card export
  adapters/    translation between the engine, content-script and UI vocabularies
  messaging/   typed cross-context messaging and the shared RPC contract
```

`src/adapters/` exists for a specific reason: the engine, the content script and
the panel each name the same concepts differently. That translation lives in one
place instead of being re-derived at every call site.

## Licence

MIT. The editorial methodology remains the work of
[@sjowall69](https://x.com/sjowall69).
