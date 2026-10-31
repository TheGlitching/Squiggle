# The content routine

Every Monday, on the VPS that runs Postiz, this reads the week's figures, rewrites a
strategy note, proposes one piece of substance as a pull request, fills the social
queue four weeks ahead, drafts replies to comments, and e-mails a report to
contact@squiggle.fr. A daily check watches for failures in between. The model is
DeepSeek V4.1 Flash through OpenRouter, on a key capped at 5 $ a month.

The editorial line the model reads is `consignes/ligne-editoriale.md`. Its rule 7 is
the one exception to « nothing goes out without the owner »: a post that adapts a page
already reviewed and online enters the queue at least three weeks before it goes out,
the report shows it in full that Monday, and silence is consent.

## What runs when

| When (Paris) | Command | What it does |
|---|---|---|
| Monday 5:00 | `contenu hebdo` | collect, comments and lessons, strategy note, piece of substance, posts, report |
| every day 7:00 | `contenu quotidien` | owner's replies, failed posts, disconnected networks, thin reserve, spending, merged content (its posts go out within the week, at least 48 h after an e-mail that shows them) |

Monday in order:

1. **Collection**: Search Console (7 and 28 complete days, final data, plus the fresh
   days apart), Cloudflare Web Analytics (GraphQL), `/admin/metrics` with the read-only
   `METRICS_TOKEN`, Postiz statistics, Bluesky's public API. A source that fails is
   filed as not collected, never replaced by last week's.
2. **Comments**: Bluesky replies are read and classed in a closed list (question,
   objection, correction, subject asked for, praise, hostile, other); a reply is
   drafted where `consignes/reponses.md` calls for one, never sent. Subjects go to the
   waiting list, objections and corrections become lessons.
3. **Strategy note** (`src/strategy.ts`): the program computes every figure and applies
   the decision rules (a test changes one thing on one network for four weeks; under 20
   visits, no verdict; a winner brings 30 % more visits per post); the model writes the
   sentences, and a sentence carrying a number the program did not compute blocks the
   note. Changing the strategy itself is only ever proposed.
4. **Piece of substance** (`src/deep.ts`): a notion with impressions and no clicks is
   enriched; else a query no page answers gets an article or a synonym; else the
   waiting list; else a draft already in `web/src/blog/`; else nothing. Always a pull
   request from `contenu/<slug>`, at most two open, no audience figure in it, with
   Squiggle's own analysis of the text in its description.
5. **Posts** (`src/posts.ts`, `src/calendar.ts`): 13 slots a week on Bluesky, Threads,
   Facebook, Instagram and X, filled for every week at least three weeks out. Each post
   is drafted from one online page, passes the deterministic filter (`src/filter.ts`),
   then a separate review that sees only the text, its source, its image and the
   editorial line. A refused post leaves its slot empty and is never rewritten.
6. **Report** (`src/report.ts`): the figures, the note, the pull request, every post
   entering the queue in full, the reply drafts, what was learned, health and spending.

## What it learns

Lessons (`src/memory.ts`) are read by every drafting call. They come from comments,
from posts the owner removed from the queue, from reply drafts the owner changed before
posting, from content pull requests edited before merging or closed, and from the
owner's replies to the report. A writing lesson applies at once; one that would touch
the strategy is proposed. `contenu etat` lists them, `contenu lecon-retirer <id>` stops one.

## Stopping it

| | |
|---|---|
| one post | delete it in Postiz, or reply to the report describing it |
| one network | disable the channel in Postiz: the routine stops filling it |
| everything | reply « stop » to any e-mail, or `contenu pause` on the VPS (`contenu reprendre`, or a reply « reprendre », to resume) |
| everything, now | `contenu vider-la-file`: pauses and deletes every future post the routine scheduled |
| last resort | switch the VPS off from OVH's app |

More than two removals in a week switch the routine to draft mode: posts enter Postiz
as drafts until `contenu liberer`.

## On the VPS

```
~/contenu/.env                 secrets (never in the repository)
~/contenu/search-console.json  the service account's key
~/contenu/depot/               a clone of this repository, updated before every run
~/contenu/donnees/             the SQLite database and the PAUSE file
~/contenu/bin/contenu          the runner (a copy of bin/contenu)
```

The runner updates the clone, installs the routine's three dependencies when the
lockfile changes, bundles `src/main.ts` with esbuild and runs it in a `node` container
on the host network. Install or update the runner and the timers from the clone:

```
sh ~/contenu/depot/tools/contenu/bin/installer
sudo systemctl enable --now contenu-quotidien.timer contenu-hebdo.timer   # only once reviewed
```

Every command takes `--a-blanc`: a dry run collects, calls the model, filters, reviews
and sends the report, but writes nothing to Postiz or GitHub, on a database of its own.

`.env` holds `POSTIZ_API_KEY`, `POSTIZ_API_URL`, `CF_API_TOKEN`, `CF_ACCOUNT_ID`,
`SQUIGGLE_METRICS_TOKEN`, `OPENROUTER_API_KEY`, `BREVO_API_KEY`, `GITHUB_TOKEN`,
`GSC_CREDENTIALS` (the key file's path), `GSC_SITE`, and, once the reply address is set
up, `CF_KV_REPONSES`.

## Replies by e-mail

The report's Reply-To is `routine@squiggle.fr`. That address is routed to the Worker in
`worker/`, which keeps only mail from the owner's addresses (`src/owners.ts`) that
Cloudflare authenticated (the checks of `server/src/mail/authenticated.ts`), strips the
quoted report and attachments, and files the text in a KV namespace. The daily check
reads it through Cloudflare's API and classes it in a closed list (`src/inbox.ts`):
« stop » and « reprendre » act the same day; removing a post, leaving a subject alone,
one network less or more this week are applied and confirmed in the next report; a
remark on the writing becomes a lesson; a request touching the strategy is restated
and put back to the owner. The text is data: nothing else can happen.

Setting it up, once, in the Cloudflare dashboard and from a checkout:

1. `npx wrangler kv namespace create routine-reponses`, and put its id in
   `worker/wrangler.jsonc` in place of `PENDING_KV_NAMESPACE_ID`.
2. `npx wrangler deploy -c tools/contenu/worker/wrangler.jsonc`.
3. Cloudflare, squiggle.fr, Email, Email Routing, Routing rules: a custom address
   `routine@squiggle.fr`, action « Send to a Worker », `squiggle-routine-reponses`.
4. Add the permission *Account, Workers KV Storage, Read* to the routine's Cloudflare
   token (the one in `.env`, which already reads Account Analytics).
5. Add `CF_KV_REPONSES=<the namespace id>` to `~/contenu/.env` on the VPS.
6. Reply « etat » to a report: the next daily check files it as « autre », and the next
   report shows it under « Ce que la routine a appris ».

## Not yet

- Meta comments (Threads, Facebook, Instagram) and X mentions: only their counts are
  read for now; their text needs the read permissions on Meta's app, and X mentions
  cost money.
- The database is not backed up yet; Postiz's own databases are not either.
- Short videos (Remotion), after the carousels.
