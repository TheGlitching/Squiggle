# Security

## What this extension handles

Squiggle holds one thing worth protecting: the API key you give it for your own
LLM provider. Everything else it touches is the public text of the page you are
reading.

There is no backend. No account, no telemetry, no server belonging to this
project. The key is encrypted with AES-GCM and kept in your browser's extension
storage; it leaves your machine only as an `Authorization` header on a request to
the provider you chose, and only when you ask for an analysis.

## What it can read

The extension reads the article in the tab you point it at, and sends that text to
your provider so it can be analysed. During the research stage it also asks your
provider to search the web for the factual claims the audit questioned. That is
the whole data flow: your page, your provider, your key.

It requests `activeTab` rather than blanket host permissions, so it can only read a
page you have deliberately asked it to analyse.

## Reporting a vulnerability

Open a [security advisory](https://github.com/TheGlitching/Squiggle/security/advisories/new)
rather than a public issue, and give it a few days before disclosing.

Things worth reporting:

- any path by which a stored key could be read by a page, another extension, or a
  provider other than the one it was saved for
- any way the content script could be induced to execute page-controlled script
- a way a crafted article could make the extension send more than that article's
  own text to a provider

Things that are known and intended:

- the key is recoverable by anyone with access to your unlocked browser profile.
  Extension storage is not a secret store, and the encryption protects against
  casual inspection of storage, not against someone already inside your session.
- article text is sent to a third-party provider. That is the entire point of a
  bring-your-own-key tool, and which provider sees it is your choice.
