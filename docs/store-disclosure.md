# Store privacy disclosures

The Chrome Web Store and AMO both ask, in their own vocabulary, what the extension
collects and where it sends it. Those answers are made in a dashboard, not in this
repository, so they drift silently unless the exact wording lives somewhere reviewable.
This file is that place.

**Nothing here is submitted yet.** Hosted mode is not deployed, so the *current*
listings must keep saying what is true today: BYOK only, no server of ours. The
right-hand column is what to change, in the same release that ships hosted mode and
not before — a listing that describes a data flow the shipped code does not have is a
false disclosure in the direction that gets an extension pulled.

## Chrome Web Store — Privacy practices

| Question | Today (BYOK only) | With hosted mode |
|---|---|---|
| Single purpose | Analyse the news article in the active tab against an explicit editorial grid, and show the result beside it. | *unchanged* |
| Does it collect **personally identifiable information**? | No | **Yes** — email address, for the account |
| **Health information** | No | No |
| **Financial and payment information** | No | No — payment is handled entirely by Stripe; we never see a card number |
| **Authentication information** | No | **Yes** — a session token and a per-install signing key, held encrypted in extension storage |
| **Personal communications** | No | No |
| **Location** | No | No |
| **Web history** | No | No — a URL is sent only for the article being analysed, on an explicit action, and is never retained in a browsable form |
| **User activity** | No | No |
| **Website content** | **Yes** — the text of the article is sent to the provider whose key the user configured | **Yes** — and in hosted mode, to our server and from there to the configured model provider (OpenRouter and the model's provider by default; Google Gemini if that is the deployment setting) |
| Certification: not sold to third parties | ✔ | ✔ |
| Certification: not used or transferred for a purpose unrelated to the single purpose | ✔ | ✔ |
| Certification: not used to determine creditworthiness or for lending | ✔ | ✔ |
| Privacy policy URL | the repository's `PRIVACY.md` | the published policy on the web app |

### Permission justifications (both cases)

- **`activeTab`** — reads the article in the tab the user explicitly asked to analyse,
  and only at that moment.
- **`scripting`** — injects the extraction and highlight code into that tab, to recover
  the article's text and the positions to highlight.
- **`storage`** — keeps the user's encrypted API key so it is not asked for again. In
  hosted mode, keeps the session token and the install's signing key the same way.
- **`sidePanel`** — displays the analysis beside the article.
- **Host permissions** — an article can be on any domain and the extension cannot know
  in advance which one the reader will open; the access is used to read that page and
  to reach the chosen model provider.

Hosted mode adds **no permission**. If a review question asks what changed, that is the
answer: a new destination, not a new capability.

## AMO (addons.mozilla.org)

AMO asks in prose rather than in a matrix. The submitted text should say, in this
order:

1. what the extension reads (the article in the tab the user asked about),
2. where it sends it (the provider the user configured; in hosted mode, our server and
   the configured model provider — OpenRouter and the model's provider by default,
   Google Gemini if that is the deployment setting),
3. what is stored locally (the encrypted key; in hosted mode, also the session token
   and the install's signing key),
4. what is stored remotely (in BYOK mode: nothing; in hosted mode: the report for 30
   days, a usage ledger with no content for 12 months, and the account),
5. that no analytics, no tracking and no remote code exist in either mode.

The `data_collection_permissions` block in `src/manifest.firefox.json` must agree with
whatever is written there. It is the machine-readable half of the same statement, and
Mozilla compares them.

## When hosted mode ships

- [ ] update the CWS privacy practices to the right-hand column above
- [ ] update the CWS single purpose only if it actually changed (it does not: the
      purpose is the same, the infrastructure is not part of a purpose)
- [ ] update the AMO description and `data_collection_permissions`
- [ ] point both privacy policy URLs at the published policy rather than the repository
- [ ] re-read `PRIVACY.md` against the deployed reality before submitting either
