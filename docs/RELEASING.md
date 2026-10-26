# Releasing

A release is one command: move the version, tag it, push the tag. Everything after
that is automated. The setup below is done once.

## One-time setup

### 1. Create the store listing

The Chrome Web Store needs the item to exist before anything can be uploaded to it,
and creating it requires the one-off developer registration fee.

1. Go to the [developer dashboard](https://chrome.google.com/webstore/devconsole).
2. Create a new item and upload `packages/squiggle-chrome-0.1.0.zip` by hand, once.
   Build it with `SQUIGGLE_HOSTED_ORIGIN=https://squiggle.fr npm run package`.
3. Save it as a draft. Fill in the listing: description, screenshots, category,
   privacy declarations. The extension stores an API key locally and never sends
   page content anywhere except the provider the reader configures, which is worth
   stating plainly in the privacy section.
4. Copy the item's ID from the dashboard URL. That is `CWS_EXTENSION_ID`.

Only this first upload is manual. Every later version goes through the pipeline.

### Listing assets

Every image is generated, so none can drift from what it shows. The icon:

```bash
python3 scripts/build-icon.py
```

The promotional tiles and the screenshots:

```bash
node scripts/build-store-assets.mjs        # every image, into store/
node scripts/build-store-assets.mjs --only screenshot-2
```

Each image is a page of `store/render/` photographed by headless Chrome at its exact
size. A screenshot holds the extension's real side panel and the real in-page
highlights, mounted on the site's example article (`web/src/demo.ts`) and rendered by
their own code, so a change to the panel shows up in the next render. The fifth puts the
two ways to start side by side (own key, account), each over the part of the real panel
that does it. The drawings and
type are the site's (`web/src/components/Iso.tsx`, `web/src/index.css`).

| Asset | Size | Where |
|---|---|---|
| Extension icon | 128x128, artwork inset to 96 | `src/assets/icon-128.png`, already in the zip |
| Small promotional tile | 440x280 | `store/promo-small-440x280.png` (without it the item ranks below those that have one) |
| Marquee tile | 1400x560 | `store/promo-marquee-1400x560.png` (needed to be featured) |
| Screenshots | 1280x800, full bleed | `store/screenshot-1-1280x800.png` to `-5`, for Chrome and AMO alike |

The store shows screenshots downscaled to 640x400, which is why the caption type is
large. The order, the captions and the reason the tiles carry no sentence are in
[`../store/listing.fr.md`](../store/listing.fr.md).

### 2. Allow the pipeline to talk to the store

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project.
2. Enable the **Chrome Web Store API** for it.
3. Under *APIs & Services → OAuth consent screen*, set the publishing status to
   **Production**. This one matters more than it looks: a project left in
   *Testing* issues refresh tokens that stop working after seven days, so the
   pipeline works today and fails next week with an opaque `invalid_grant`.
   Publishing an app used only by its own owner needs no Google verification.
4. Under *APIs & Services → Credentials*, create an **OAuth client ID** of type
   **Web application**, and add `http://localhost:8976` as an authorised redirect
   URI. That port is what the helper below listens on.
5. Keep the client ID and client secret: `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`.

### 3. Store the credentials

One command mints the refresh token and writes all four Actions secrets:

```bash
scripts/setup-cws-secrets.sh <extension-id> <client-id>
```

It prompts for the client secret rather than taking it on the command line, keeps the
token off the terminal, and finishes by exchanging the stored credentials with Google,
so a combination that would fail mid-publish fails here instead.

The manual equivalent, if you would rather watch each step:

### 3b. Mint a refresh token by hand

The client ID and secret alone cannot upload anything; they need a token proving
the store account consented. Run:

```bash
node scripts/cws-refresh-token.mjs <client-id> <client-secret>
```

Open the URL it prints, sign in with the account that owns the listing, approve.
The refresh token appears in the terminal. As long as the consent screen is in
Production it stays valid until you revoke it.

If it reports an access token but no refresh token, this client was already
authorised once. Revoke it at
[myaccount.google.com/permissions](https://myaccount.google.com/permissions) and
run the helper again.

### 4. Store the four secrets

In *Settings → Secrets and variables → Actions*, add:

| Secret | From |
|---|---|
| `CWS_EXTENSION_ID` | the dashboard URL of the item |
| `CWS_CLIENT_ID` | the OAuth client |
| `CWS_CLIENT_SECRET` | the OAuth client |
| `CWS_REFRESH_TOKEN` | `scripts/cws-refresh-token.mjs` |

## Cutting a release

```bash
npm version patch      # or minor / major - this writes package.json and tags
git push origin main --follow-tags
```

`package.json` is the only place the version lives; both manifests read it at build
time, and a test fails if they ever disagree. The release also refuses outright if
the tag and `package.json` disagree, because the store spends the version slot
either way and a mislabelled build cannot be taken back.

The pipeline then typechecks, builds both targets, runs the tests, packages,
uploads to the store, publishes, and attaches both zips to a GitHub release.

The build step sets `SQUIGGLE_HOSTED_ORIGIN=https://squiggle.fr` inline in
`.github/workflows/release.yml`: it is not a secret, and keeping it in the workflow
means the value is reviewed with the code. Without it `vite.config.ts` falls back to
the placeholder `https://squiggle.example`, and the build would ship a hosted mode
that signs in nowhere. `scripts/package.mjs` refuses any build that still contains
that placeholder, so a missing origin fails the release before anything is uploaded.
The same applies to a local `npm run package`: set the variable first.

## Publishing to a few testers first

Run the **Release** workflow manually from the Actions tab and choose
`trustedTesters`. Tag pushes always publish to everyone.

## What the store does next

A new version goes to review. `ITEM_PENDING_REVIEW` in the log is success, not
failure: the upload is accepted and it goes live when review clears, usually within
a day or two. Both the upload and publish endpoints answer `200` even when they are
refusing, so the pipeline reads the body and fails on the real verdict rather than
the status code.

Common refusals:

- **Version already exists.** The store will not take a version number twice, even
  for a draft that was never published. Bump and tag again.
- **Permission denied.** The signed-in account for the refresh token is not an
  owner of the listing, or the Chrome Web Store API is not enabled on the project.
- **`invalid_grant`.** The refresh token was revoked, or the OAuth consent screen
  slipped back to *Testing*, which expires tokens after seven days. Set it to
  Production and mint a new one.

## Firefox

The Firefox zip is built, tested and attached to each release, but is not submitted
automatically: AMO uses separate credentials and its own review flow. Upload
`packages/squiggle-firefox-<version>.zip` at
[addons.mozilla.org](https://addons.mozilla.org/developers/) when you want it there.

### Source package

The package is produced by Vite and esbuild, so what AMO reviews is generated code. AMO
therefore asks, with **every** upload of a version, for the source archive and the
instructions to build the package from it. Without them the version is rejected.

```bash
npm run package:source      # -> packages/squiggle-source-<version>.zip
```

That is `git archive` of `HEAD`: tracked files only, so commit first, and no
`node_modules`, no `dist`, no secret. It holds the extension, `shared/`, and the `server/`
and `web/` workspaces, because the lockfile covers all of them and `npm ci` needs them.

In the upload form, attach that archive and paste these build instructions:

```
Requirements: Node.js 20 and npm 10, on Linux or macOS.

  unzip squiggle-source-<version>.zip && cd squiggle-source
  npm ci
  SQUIGGLE_HOSTED_ORIGIN=https://squiggle.fr npm run build:firefox

The package is dist/firefox. Zipping its contents gives the submitted add-on
(scripts/package.mjs does that for both browsers).

SQUIGGLE_HOSTED_ORIGIN is the only build-time setting: the origin of Squiggle's own
server, written into the code. https://squiggle.fr is the value the submitted package
was built with, and the hosted origin on the privacy policy.

File names under dist/firefox/assets carry a hash that depends on the directory the
build ran in, so they differ between checkouts. Their contents do not.

No code is downloaded at build time beyond the npm packages in package-lock.json.
```

Run the lint on the built package before uploading; the validator AMO runs is the same:

```bash
npx web-ext lint -s dist/firefox
```

It reports no error and three expected warnings. Two `UNSAFE_VAR_ASSIGNMENT` point at
`innerHTML` inside the bundled React runtime (the `SquiggleBadge-*.js` chunk); the
extension's own code never assigns `innerHTML`, and AMO review accepts them. One
`KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION` notes that Firefox for Android only reads
`data_collection_permissions` from 142; the add-on is not offered on Android, which has no
sidebar, so it does not apply.

`data_collection_permissions` in the Firefox manifest is only understood from Firefox 140,
which is why `strict_min_version` is `140.0`. Lowering one without the other either
fails validation or installs the add-on without showing its data disclosure.

## Submitting a version

The privacy answers, permission justifications and reviewer notes are written once, in
[`store-disclosure.md`](store-disclosure.md), and the listing text in
[`../store/listing.fr.md`](../store/listing.fr.md). Before uploading:

- [ ] `npm run typecheck`, `SQUIGGLE_HOSTED_ORIGIN=https://squiggle.fr npm run build:all`,
      `npm test`
- [ ] `npx web-ext lint -s dist/firefox` reports no error
- [ ] the Chrome zip declares no content script and no host permission beyond the four
      providers: the packaging tests pin both
- [ ] the privacy policy URL in both dashboards answers with the published policy
- [ ] `npm run package:source` for the AMO upload
