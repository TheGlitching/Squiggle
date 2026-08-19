# Releasing

A release is one command: move the version, tag it, push the tag. Everything after
that is automated. The setup below is done once.

## One-time setup

### 1. Create the store listing

The Chrome Web Store needs the item to exist before anything can be uploaded to it,
and creating it requires the one-off developer registration fee.

1. Go to the [developer dashboard](https://chrome.google.com/webstore/devconsole).
2. Create a new item and upload `packages/squiggle-chrome-0.1.0.zip` by hand, once.
   Build it with `npm run package`.
3. Save it as a draft. Fill in the listing: description, screenshots, category,
   privacy declarations. The extension stores an API key locally and never sends
   page content anywhere except the provider the reader configures, which is worth
   stating plainly in the privacy section.
4. Copy the item's ID from the dashboard URL. That is `CWS_EXTENSION_ID`.

Only this first upload is manual. Every later version goes through the pipeline.

### Listing assets

Generated, so they cannot drift from the icon:

```bash
python3 scripts/build-icon.py
```

| Asset | Size | Where |
|---|---|---|
| Extension icon | 128x128, artwork inset to 96 | `src/assets/icon-128.png`, already in the zip |
| Small promotional tile | 440x280 | `store/promo-small-440x280.png` **(required)** |
| Marquee tile | 1400x560 | `store/promo-marquee-1400x560.png` (optional, needed to be featured) |

Screenshots have to come from a real browser, so they are the one thing not generated
here. One is the minimum, five the maximum, and they must be full bleed at exactly
1280x800 or 640x400. Capture the panel open beside an analysed article, then:

```bash
scripts/store-screenshot.sh ~/Desktop/shot.png
```

That crops to 16:10 before scaling. Cropping the other way round, or letting `sips`
fit the image, pads it with borders - which is exactly what the store asks you not to
submit.

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

The pipeline then typechecks, lints, builds both targets, runs the tests, packages,
uploads to the store, publishes, and attaches both zips to a GitHub release.

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
