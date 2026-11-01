# Squiggle for Android

The Android app: a Trusted Web Activity for squiggle.fr plus one native screen,
in the same package (`fr.squiggle.app`). Not published on any store yet.

## What it does

- **The home screen icon** opens squiggle.fr full screen (the TWA,
  `LauncherActivity` from android-browser-helper).
- **"Partager", then Squiggle**, from a paper's app or a browser, opens
  `LectureActivity`. It loads the shared article in the app's own web view,
  where the reader signs in to their paper once (the cookies are kept). As
  soon as the page has loaded, it runs the bookmark "Analyser avec Squiggle"
  (`web/src/favori/favori.ts`) in it: the page is read on the phone, exactly
  as the bookmark reads it, and the bookmark's `/analyser#page=…&via=favori`
  address opens in the TWA, where the analysis starts on its own. That address
  is never loaded by the web view. The reader's Squiggle account and the
  Google sign-in are there, since Google refuses to sign in inside a web view.
- **A social post** (X, Threads, Instagram, Facebook, TikTok) takes the same
  way: the bookmark reads it without scrolling into its comments, and
  `/analyser` reads the post out of the page and analyses it as a message.
  TikTok Lite's share carries a second link, to TikTok Lite's own page: the
  app opens the first link that is not such an advertisement.
- **Back** from the report returns to the article in the web view. A reader
  who has just signed in to their paper, or to the social site, there touches
  **Vérifier** to read it again.
- **A YouTube link** has no page to read here: it opens `/analyser?url=…`,
  which shows the report already made for that link, or says what to do.
- **A text without a link**, or with more around its link than a headline (a
  WhatsApp chain, a post), opens `/analyser#text=…&via=appli` in the TWA, where
  the analysis starts on its own; a short text is analysed as a message. A text
  too short to claim anything stays in the field with a sentence that says why.
- **Screenshots**, one or several, go to the site's share target
  (`share_target` in `web/public/manifest.webmanifest`): the browser posts them
  to the site's service worker, which keeps them on the phone for the page to
  read, as a share to the installed web app does. Until the app has opened the
  site once, the worker is not there yet, so the first share opens the page
  with its "Importer un fichier" instead of posting the images.
- **A PDF** takes the same way as screenshots: the page reads its text on the
  phone with pdf.js (`web/src/pdf.ts`), and a scanned PDF's pages with the
  screenshots' OCR. Before the site's first opening, the page offers its
  "Importer un fichier".

The paper's page is shown as it is, the text is never kept, and our server
never fetches the article: the same invariants as the extension and the bookmark.

## Build

Needs JDK 17, the Android SDK (`ANDROID_HOME`, or `sdk.dir` in
`local.properties`), and the repository's `npm ci`: the build bundles the
bookmark from the web app's source with esbuild (`favori.mjs`).

```sh
cd android
./gradlew assembleDebug
# app/build/outputs/apk/debug/app-debug.apk, signed with this machine's debug key
```

Install on a phone or an emulator with `adb install -r` on that file, or copy
the file to the phone and open it (allow installing from that app once).

## Install it on a phone (no store)

For someone who just wants the app:

1. On the phone, open the latest "Squiggle for Android" release at
   <https://github.com/TheGlitching/Squiggle/releases> and touch the
   `squiggle-android-….apk` file.
2. Chrome asks to allow installing apps from it: touch "Settings", switch the
   permission on once, go back.
3. Touch "Install", then "Open". Squiggle is on the home screen.

The same link works to send it to someone else.

## Release build

The Android workflow (`.github/workflows/android.yml`) builds the signed APK
and attaches it to a GitHub release, on a manual run or on a tag
`android-v<versionName>`. Nothing is built on a developer machine. The signing
key is in the repository secrets `ANDROID_KEYSTORE_BASE64`,
`ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEY_ALIAS`; keep a copy of it outside
GitHub, because an update only installs over an app signed with the same key.
Raise `versionCode` and `versionName` in `app/build.gradle.kts` for each
release.

## Digital Asset Links

`web/public/.well-known/assetlinks.json` lists the certificates whose builds
may show squiggle.fr without the browser's address bar. It holds the debug
key the test builds are signed with and the release key the workflow signs
with; the Play signing key's fingerprint is added there before a store release. A build signed with another key still
works: the report then opens with the address bar showing.
