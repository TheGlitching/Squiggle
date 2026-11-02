# The content routine

Every Monday, on the VPS that runs Postiz, this reads the week's figures, rewrites a
strategy note, proposes one piece of substance as a pull request, prepares the social
posts four weeks ahead, and e-mails a report to contact@squiggle.fr; the posts go into
Postiz only once the owner answers « ok ». Every morning, a daily check reads the
comments, e-mails each new one with a reply to post by hand, and watches for failures.
The model is DeepSeek V4.1 Flash through OpenRouter, on a key capped at 5 $ a month.

The editorial line the model reads is `consignes/ligne-editoriale.md`. On the networks,
as on the carousels, the example is shown as a passage to read and never announced as
made up (nor passed off as real); the filter refuses either. Its rule 7 holds for
the networks too: a post that adapts a page already reviewed and online is prepared at
least three weeks before it goes out, the report shows it in full, and it is scheduled
only after the owner's explicit « ok ». Without one it waits, and a post whose hour
comes first does not go out.

## What runs when

| When (Paris) | Command | What it does |
|---|---|---|
| Monday 5:00 | `contenu hebdo` | collect, comments and lessons, strategy note, piece of substance, posts, report |
| once, at the start | `contenu lancement` | prepares 5 posts from the carousels for the coming days (and the Instagram story), sends them for review; nothing is scheduled until the owner answers « ok » (or « ok sauf 3 »), or `contenu lancement-ok` is run |
| every day 7:00 | `contenu quotidien` | owner's replies, comments (an e-mail when there are new ones), failed posts, disconnected networks, thin reserve, spending, merged content (its posts are shown at least 48 h ahead and wait for « ok » too) |

Monday in order:

1. **Collection**: Search Console (7 and 28 complete days, final data, plus the fresh
   days apart), Cloudflare Web Analytics (GraphQL), `/admin/metrics` with the read-only
   `METRICS_TOKEN`, Postiz statistics (followers, and per post likes, comments, shares,
   saves, reach), the public APIs of Bluesky and Mastodon (followers, and per post
   replies, reposts, likes). A source that fails is filed as not collected, never
   replaced by last week's.
2. **Lessons** from the posts the owner removed, and from the owner's replies.
3. **Strategy note** (`src/strategy.ts`): the program computes every figure, the
   followers gained and the conversation (replies and shares per post) of each network
   beside the visits, and applies the decision rules. A test changes one thing for
   eight weeks: a network's own setting (hour, link, hashtags) on that network against
   the eight weeks before, a matter of content (closing question, picture, one picture
   or several) on every network at once, one week each way. The visits stay the goal,
   but under 20 of them a test is judged on the conversation, then on the followers
   gained; under 20 of each, « pas encore de signal »; 30 % more per post wins. The
   model writes the sentences, and a sentence carrying a number the program did not
   compute blocks the note. Changing the strategy itself is only ever proposed.
4. **Piece of substance** (`src/deep.ts`): a notion with impressions and no clicks is
   enriched; else a query no page answers gets an article or a synonym; else the
   waiting list; else a draft already in `web/src/blog/`; else nothing. Always a pull
   request from `contenu/<slug>`, at most two open, no audience figure in it, with
   Squiggle's own analysis of the text in its description.
5. **Posts** (`src/posts.ts`, `src/calendar.ts`): 17 slots a week on Bluesky, Mastodon,
   Threads, Facebook, Instagram and X, each post held until the owner's « ok » (D8,
   `src/launch.ts`). At the start the queue fills one week at a time,
   two days ahead at the least, and each Monday one week further, until it reaches four
   weeks and the three-week review window (`fillWindow`). A post on Instagram or Facebook
   gets its story the same evening (`post_type: story`), the 9:16 image the site's build
   draws beside each carousel (`/og/social/<slug>/story.png`). Facebook and Threads
   bury links, so there only the piece of substance carries one (on Facebook two a
   month at most, Meta's cap for Pages); every other post goes out native, with the
   carousel on Facebook and one picture on Threads. Mastodon's hashtags are the three
   most used of a closed list (`src/hashtags.ts`), measured each Monday on the public
   tag API of three French-speaking instances. Each notion of the week also goes out
   as its short video, silent, every word on screen: an Instagram Reel, and the notion
   slots on Bluesky, Facebook and Threads that showed its example
   (`/og/social/<slug>/video.mp4`, rendered once per notion on a computer by
   `npm run reels -w @squiggle/web` and published by the build while it shows the
   glossary's current words). A notion without one keeps the slot's format from before
   (`withoutVideo`). On Bluesky the video goes out in its spoken version, where a
   synthetic voice reads its question and its answer (Gemini TTS through Google Cloud,
   generated with the videos on that computer, with `SQUIGGLE_TTS_PROJECT` set; no key
   on the VPS); a `voix` test sets it against the silent one, a week each way. Meta asks
   for its « AI info » label on a synthetic voice and Postiz cannot set it yet, so
   Instagram, Facebook and Threads get the silent version (`SPOKEN_NETWORKS`). Each post
   is drafted from one online page, passes the deterministic filter (`src/filter.ts`),
   then a separate review that sees only the text, its source, its image and the
   editorial line. A refused post leaves its slot empty and is never rewritten.
6. **Report** (`src/report.ts`, `src/summary.ts`): an HTML e-mail in the site's colours,
   one column for a phone, with a plain-text version. It opens on three or four sentences
   in plain French (the model's, checked: only computed numbers, no internal word) and on
   what is expected of the owner (the « ok » the posts wait for), then the decisions, each
   with the answer to send; a few figures with their trend; the week's piece of substance;
   every post waiting for approval as it will look, this week's and any still unanswered,
   grouped by day, with its thumbnail and a short number; then the week's comments,
   lessons, refused posts, health and spending, one line each. It is also kept on the VPS
   under `donnees/comptes-rendus/`. One report a week at most: a run started again the
   same week keeps its report there and sends nothing.

## Comments, every day

Each morning the daily check reads the replies under the posts of the last four weeks
on Bluesky and Mastodon, through their public APIs, and classes each new one in a
closed list (question, objection, correction, subject asked for, praise, hostile,
other); a reply is drafted where `consignes/reponses.md` calls for one. On Threads,
Facebook and Instagram, Postiz gives only each post's number of comments: the routine
says which posts have new ones. When anything new arrived, one e-mail lists each
message with its link and the proposed reply. The owner answers from the network's app
the same day; the routine never sends a reply (D1), and replying elsewhere is the
owner's own choice, by hand (D6). Subjects asked for go to the waiting list,
objections and corrections become lessons, and the owner's reply, read back the next
day, teaches the routine how it differed from the draft.

## What it learns

Lessons (`src/memory.ts`) are read by every drafting call. They come from comments,
from posts the owner removed from the queue, from reply drafts the owner changed before
posting, from content pull requests edited before merging or closed, and from the
owner's replies to the report. A writing lesson applies at once; one that would touch
the strategy is proposed. `contenu etat` lists them, `contenu lecon-retirer <id>` stops one.

## Stopping it

| | |
|---|---|
| one post | before the « ok »: reply « ok sauf 4 »; after: delete it in Postiz, or reply « retire 4 » with its number in the report |
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
reads it through Cloudflare's API (`src/inbox.ts`). Short answers are read without a
model: « ok » (or « ok sauf 3 ») schedules every post waiting for approval, the launch's
or the week's (an « ok » under the comments e-mail or an alert approves nothing),
« retire 4 » (several numbers allowed) removes those posts, « oui B » or « non B »
answers decision B of the last report (« non » on a page to review closes it). Each may be
written naturally (« ok tout part », « parfait, merci », « oui pour la B »); one followed by a
reserve or a negation (« ok mais pas la 3 ») is not acted on, and the next report says it was
not understood, as it says when posts still wait for their « ok ». The rest
is classed in a closed list: « stop » and « reprendre » act the same day; removing a post, leaving a subject alone,
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

- The text of Meta comments (Threads, Facebook, Instagram): only their counts are read
  for now; their text needs the read permissions on Meta's app. X is not read at all:
  its mentions cost money, and X is kept to posting.
- A link in the first comment: the `lien` test only compares a link in the text with
  none, since Postiz would have to post the comment after the post.
- The database is not backed up yet; Postiz's own databases are not either.
