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
- **Back** from the report returns to the article in the web view. A reader
  who has just signed in to their paper there touches **Vérifier cet
  article** to read it again.
- **A YouTube link** has no page to read here: it opens `/analyser?url=…`,
  which shows the report already made for that link, or says what to do.

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

## Digital Asset Links

`web/public/.well-known/assetlinks.json` lists the certificates whose builds
may show squiggle.fr without the browser's address bar. It holds the debug
key the test builds are signed with; the Play signing key's fingerprint is
added there before a store release. A build signed with another key still
works: the report then opens with the address bar showing.
