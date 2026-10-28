# The iPhone shortcut "Analyser avec Squiggle"

`page.ts` is the script the shortcut runs in a Safari page; `build.mjs` bundles
it, writes the shortcut and signs it. The signed file is served from
`web/public/raccourci/Analyser avec Squiggle.shortcut` and offered on `/raccourci`.

## Signing

An iPhone only imports a signed shortcut file. Signing runs on a Mac, with an
Apple account signed in (Réglages Système, then the account at the top of the
list); without one, `shortcuts sign` stops with "you must be signed into iCloud".

```sh
npm install
node web/shortcut/build.mjs
```

The script runs `shortcuts sign --mode anyone`, so anyone can import the file
without an iCloud link. Commit the signed file it writes: nothing else can sign
it, so CI does not rebuild it. Rebuild and commit it whenever `page.ts`,
`build.mjs` or the extension's extractor changes.

## Checking it on an iPhone

- "Ajouter le raccourci" on `/raccourci` downloads the file, and opening it from
  Safari's downloads offers to add it in Raccourcis.
- With "Autoriser l'exécution de scripts" on, sharing a Safari article to it
  asks once to allow the site, then opens `/analyser` with the title, the text
  and the address filled in.
- Sharing several screenshots from Photos opens `/analyser` with their text, one
  capture after the other.
- A long article (10 000 words) still arrives whole: the text travels in the
  address, after the `#`.
