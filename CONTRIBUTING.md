# Contributing

## Getting it running

```bash
npm install
npm run build:chrome     # -> dist/chrome
npm run build:firefox    # -> dist/firefox
```

**Chrome**: `chrome://extensions` → Developer mode → *Load unpacked* → `dist/chrome`.
**Firefox**: `about:debugging#/runtime/this-firefox` → *Load Temporary Add-on* → any
file inside `dist/firefox`.

You need an API key from one of the supported providers to see a real analysis.
Without one the extension says so and stops; it will not substitute a sample.

## The gates

```bash
npx tsc --noEmit    # typecheck
npm run build:all   # both targets
npm test            # unit and integration
```

All three must pass before a change lands, and CI runs exactly these on every push.
`npm test` reads `dist/`, so build before testing or the packaging checks will fail
on a stale tree.

## What a test is for here

A test should fail if a plausible bug is introduced, and pin an observable contract
rather than the shape of the implementation. Several tests in this repository exist
because a specific defect shipped: the score that contradicted its own findings, the
tour card that ran off the bottom of the panel, the four identical placeholder icons,
the subscription link counted as a cited source. When you fix something, reproduce it
first and keep the reproduction.

Prefer proving the fix works by neutralising it and watching the test fail. A test
that passes against the broken code was not testing the thing you fixed.

## Writing for the reader

Every string a user sees addresses **someone reading an article** - not the
journalist who wrote it. The extension has no power to change the article and its
audience has no interest in editing it. So: no rewrite advice, no "corrigez", no
pre-publication verdicts, no revision plans. Describe how well the piece holds up
and why; let the reader draw the conclusion.

User-facing copy is French, `vouvoiement`. Internal names, comments and commit
messages are English.

## Honesty rules the code enforces

These are not style preferences, they are the product:

- A finding is never published with an explanation admitting it was not checked.
- Research verdicts describe **the article's statement**, never the audit's
  objection to it. An objection the evidence refutes is withdrawn and recorded,
  not quietly deleted and not shown as a fault.
- The score is coupled to the findings by a rate, never a ceiling. Do not
  reintroduce caps or thresholds that clamp a mark: they flatten two differently
  judged articles onto the same number and lose the distinction permanently.
- Assertions are classified with the four states the method defines. Collapsing
  "unsourced in the text" into "doubtful" tells a reader an ordinary claim is
  shaky, which is the bug that taxonomy exists to prevent.

## Code conventions

- Comments explain **why**, at the level of the decision. Never narrate the diff.
- Plain dash, never an em dash.
- No linter is configured. If you add one, land it as its own change with the
  existing violations dealt with, rather than alongside unrelated work.
- Keep the `src/adapters/` boundary: the engine, the content script and the panel
  name the same concepts differently, and that translation belongs in one place.

## Releasing

See [docs/RELEASING.md](docs/RELEASING.md). Versions live in `package.json` alone;
both manifests read it at build time.

## Where the criteria come from

The grid began as a set of article-review prompts shared with me privately, and has
since been reworked for a reader rather than an author. That origin is acknowledged in
the README; it is not a specification this project is bound to, and the document is
not reproduced here.

So changes to the criteria, the domains or the assertion taxonomy stand or fall on
their own reasoning: whether they help a reader judge an article. Say which of the two
audiences a change serves, because most of the criteria that were dropped had been
written for the other one.
