# Store privacy disclosures

The Chrome Web Store and AMO both ask, in their own vocabulary, what the extension
collects and where it sends it. Those answers are made in a dashboard, not in this
repository, so they drift silently unless the exact wording lives somewhere reviewable.
This file is that place.

**The right-hand column is what to submit with the first release that ships hosted
mode.** Until it is live the listing must keep saying what is true today: BYOK only, no
server of ours. A listing that describes a data flow the shipped code does not have is a
false disclosure in the direction that gets an extension pulled, so change the
dashboards in the same release that ships the server, not before.

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

The manifest requests four permissions, four named hosts and one optional pattern.
Nothing runs on a page the reader has not asked about: there is **no static content
script**, and the extension reads a page only after the reader invokes it there.

- **`activeTab`** - grants access to the one tab the reader invoked the extension on
  (a click on the toolbar icon), for as long as that tab stays on that site. It is
  what lets the extension read the article, and only at that moment.
- **`scripting`** - injects the extraction and highlight code
  (`chrome.scripting.executeScript`, file `content-script.js`) into that tab, to
  recover the article's text and the positions to highlight. The same file is the one
  in the package: no remote code.
- **`storage`** - keeps the user's encrypted API key so it is not asked for again. In
  hosted mode, keeps the session token and the install's signing key the same way.
- **`sidePanel`** (Chrome; Firefox uses `sidebar_action`, and a popup on Android) - displays the analysis beside
  the article.
- **Host permissions** - exactly the four model providers a reader can bring a key for:
  `api.anthropic.com`, `api.openai.com`, `openrouter.ai`,
  `generativelanguage.googleapis.com`. The extension calls these directly from the
  browser in own-key mode; they are the destinations the privacy policy names. They
  are narrow, named hosts, not a pattern over the web.
- **Optional host permissions** (`https://*/*`, `http://*/*`) - never requested at
  install; the reader can grant them in the settings sheet ("Accès aux sites") and
  withdraw them there. They add two things, both the reader's choice: analysing a page
  after changing site without invoking the extension again (`activeTab` ends when the
  tab leaves the site), and, in own-key mode, fetching the sources an article cites
  (in hosted mode our server fetches them). Without the grant both degrade, they do
  not fail: the reader invokes the extension on the new page, and uncheckable sources
  are reported as not checked.

`web_accessible_resources` lists `squiggle-auth.html` (the page the web app navigates
to, to hand a hosted session back to the extension on Chromium) and the fonts and
images the highlight overlay loads inside an analysed page. It matches every site
because the overlay can appear on any article the reader analyses.

Hosted mode adds **no permission**. If a review question asks what changed, that is the
answer: a new destination, not a new capability. The hosted API is reached under CORS,
as a named origin, and needs no host permission.

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

## Listings

The French listing copy (name, summary, description, links, reviewer notes) is
[`store/listing.fr.md`](../store/listing.fr.md); it is written for the hosted offer and
must go out with the release that ships it. The summary is the manifest `description`.

- **Privacy policy URL**: the published policy, https://squiggle.fr/confidentialite, in both
  dashboards. Not the repository's `PRIVACY.md`, which is the source of the page but not
  a URL a store should point at.
- **Screenshots**: five, 1280x800, generated by `scripts/build-store-assets.mjs` from the
  extension's real panel and highlights, so the listing and the product cannot disagree.
  The shot list and captions are in the listing file.
- **Reviewer notes**: the same file; it tells a reviewer how to exercise the hosted mode
  without paying and where each permission is used.

## When hosted mode ships

- [x] permissions narrowed to what is used (no static content script, four named hosts,
      all sites optional); the packaging tests pin it
- [x] Firefox `strict_min_version` aligned with `data_collection_permissions`
- [x] AMO source package and build instructions (`docs/RELEASING.md`)
- [x] French listing copy for the hosted offer (`store/listing.fr.md`)
- [ ] update the CWS privacy practices to the right-hand column above
- [ ] update the CWS single purpose only if it actually changed (it does not: the
      purpose is the same, the infrastructure is not part of a purpose)
- [ ] update the AMO description and `data_collection_permissions`
- [ ] point both privacy policy URLs at the published policy rather than the repository
- [x] screenshots and promotional tiles, generated from the shipped panel
      (`scripts/build-store-assets.mjs`)
- [ ] re-read `PRIVACY.md` against the deployed reality before submitting either
