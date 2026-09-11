# The extension bridge contract

How a keyless reader connects the Squiggle extension to their web account. The
web half lives here (`src/bridge.ts`, `src/pages/Pont.tsx`, `src/api.ts`); the
extension half is `squiggle-auth.html` (the Chromium landing page) and
`src/hosted/session.ts` (Firefox's code redeem and the signed account read).
The typed version of the URL shapes is `src/bridge.ts` — if this file and that
module disagree, the module wins for the bytes and this file is the bug.

The reader holds no key: the server mints an extension token from the web
session. Two paths exist because Firefox refuses the web→extension navigation
that Chromium allows.

## 1. What the extension sends the web app

The extension opens a tab at

```
https://<web-app>/pont?ext=<extension-id>&pub=<public-key-jwk>
```

- `ext` — the extension id, i.e. the `<id>` in `chrome-extension://<id>/…`.
- `pub` — the install's **P-256 public key as a JWK**, JSON-stringified and then
  percent-encoded once (ordinary `encodeURIComponent`). The web app passes the
  decoded string through verbatim, so the extension hashes the same bytes it
  generated. The JWK is `{ kty, crv, x, y }`.

Both parameters are required. Missing either drops the reader on the
"open this page from the extension" message.

## 2. Chromium — automatic

1. If not signed in, the web app sends the reader to
   `/connexion?next=<encoded /pont… URL>`; after login it resumes the bridge.
   The bridge query survives in `next`.
2. The web app `POST`s `/auth/claim` with `credentials: 'include'` and body
   `{ "publicKeyJwk": { "kty": "EC", "crv": "P-256", "x": …, "y": … } }`.
   The endpoint requires the session cookie and a matching `Origin`.
3. On success the server answers
   `{ "ok": true, "token": …, "keyId": …, "userId": … }`.
4. The web app navigates to

   ```
   chrome-extension://<ext>/squiggle-auth.html?token=<token>&pub=<pub>&keyId=<keyId>
   ```

   All three values are percent-encoded (`URLSearchParams`). `pub` is the exact
   decoded string received in step 1. The `.html` suffix is required: MV3 serves
   extension pages by path, and `/squiggle-auth` alone resolves to nothing. The
   page is listed in the extension's `web_accessible_resources` so this
   navigation is allowed.
5. The extension reads `token`, `pub`, `keyId`, stores the token against its own
   key, checks that `pub` equals the key it generated, then closes the tab.

## 3. Firefox — manual code

Firefox will not navigate to `chrome-extension://`, so the web app offers a
short code instead of step 4:

1. The web app `POST`s `/web/bridge/code` with the session cookie, `Origin`, and
   body `{ "publicKeyJwk": … }` (same shape as `/auth/claim`).
2. The server answers `{ "ok": true, "code": "ABCD2345", "expiresAt": <epoch ms> }`.
3. The reader types the code into the extension.
4. The extension `POST`s `/auth/bridge/redeem` with body `{ "code": "ABCD2345" }`.
   **No session cookie is sent** — the code is the credential.
5. The server answers
   `{ "ok": true, "token": …, "keyId": …, "userId": …, "publicKeyJwk": "…" }`.
   The extension verifies that `publicKeyJwk` matches its own key before storing
   the token.

### Code lifecycle

- **Alphabet** `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no `I`, `O`, `0`, `1`).
- **Length** 8 characters, 40 bits. Short by design: it is read off one screen
  and typed into another immediately.
- **TTL** 10 minutes from issue.
- **Single use**, enforced atomically in the database: two racing redeems
  cannot both win.
- **Rate limit** 30 redeem attempts per IP per hour.
- **Normalization** on redeem: trim, uppercase, and strip spaces and dashes.
  `abcd-2345` and `ABCD2345` are the same code.
- The raw code is never stored: the row holds only its SHA-256 digest, the
  issuing session's hash, and the public key. **No token exists until a redeem.**
- A redeem that *does* carry a web session cookie must carry the session that
  issued the code; any other session is refused. The extension sends none.

## 4. Errors

Body is `{ "ok": false, "error": "<code>", "message": "…" }`. The codes the
extension must handle:

| HTTP | `error`             | Meaning / what the extension does                     |
| ---- | ------------------- | ----------------------------------------------------- |
| 400  | `invalid_code`      | Unknown or malformed code. Ask again.                 |
| 400  | `invalid_key`       | `publicKeyJwk` is not a valid P-256 JWK. Do not retry.|
| 400  | `link_already_used` | Code already redeemed. Ask for a new one.             |
| 401  | `invalid_session`   | Web session missing/expired, or a foreign session.    |
| 403  | `origin_not_allowed`| Issuing request came from an untrusted Origin.        |
| 410  | `expired_link`      | Code older than its 10-minute TTL. Ask for a new one. |
| 429  | `rate_limited`      | Too many redeem attempts from this IP. Back off.      |

`/auth/claim` and `/auth/bridge/redeem` both return the same success shape minus
`publicKeyJwk`, so the extension can share its "store a token" path.

## 5. Security properties to preserve

- The web app never sees or holds a token beyond handing it to the extension in
  the navigation URL; it never stores one.
- `pub` is never trusted as authority: the server re-validates it as a P-256 JWK
  and imports it before minting anything.
- A leaked `bridge_codes` row yields a hash, a session hash and a public key —
  nothing usable to sign a request.
- Issuing (`/web/bridge/code`) is Origin-required and session-authenticated;
  redeeming is code-authenticated, single-use and rate-limited. Do not relax
  one because the other is strong.
