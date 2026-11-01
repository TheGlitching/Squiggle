/**
 * Monday, from 5:00 Paris time, in the order of the plan (3.3): collection,
 * lessons, the strategy note, the piece of substance, the posts four weeks out,
 * held for the owner's « ok » (D8), then the report. Each step can fail on its
 * own; the report always leaves, and says which step is missing. Comments are
 * read every day by the daily check (`daily.ts`), which also follows content
 * pull requests and drafts their posts once they are online.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { fillWindow, weeksToFill } from './calendar';
import { collectAll } from './collect';
import { gscPath } from './collect/gsc';
import { NETWORKS } from './config';
import { addDays, paused, step, weekOf, type Ctx } from './context';
import { spendThisMonth } from './daily';
import { weeklyDeep } from './deep';
import { readOwnerMail } from './inbox';
import { expireHeld, pendingApproval } from './launch';
import { lessonsSince } from './memory';
import { Postiz } from './postiz';
import { draftMode, fillQueue, reconcile, reserve, startedOn } from './posts';
import { buildReport, decisionsFor, type ReportInput } from './report';
import { summarize } from './summary';
import { commentsToRead, learnFromRemovals, signals } from './replies';
import { sendMail } from './mail';
import { startTests, weekGuidance, writeStrategy } from './strategy';

export async function weekly(ctx: Ctx): Promise<void> {
  const since = addDays(ctx.now, -7).toISOString();
  const isPaused = paused(ctx);
  await step(ctx, 'réponses du propriétaire', () => readOwnerMail(ctx));
  const rec = await step(ctx, 'état de la file', () => reconcile(ctx));
  const expired = expireHeld(ctx);
  const removed = ctx.db.all<{ network: string; text: string; source_id: string }>("SELECT network, text, source_id FROM posts WHERE status = 'retire' AND checked_at >= ?", since);
  await step(ctx, 'leçons des publications retirées', () => learnFromRemovals(ctx, removed));

  const week = await collectAll(ctx);

  const strategy = await step(ctx, 'note de stratégie', () => writeStrategy(ctx, week, signals(ctx)), (s) => (s.problem ? `note bloquée : ${s.problem}` : 'réécrite'));

  const deep = isPaused ? null : await step(ctx, 'contenu de la semaine', () => weeklyDeep(ctx, week.gsc), (d) => d.pr?.url ?? d.why);

  const impressions = new Map((week.gsc?.pages28 ?? []).map((r) => [gscPath(r.keys[0]), r.impressions]));
  const weight = (id: string) => impressions.get(`/${id}`) ?? 0;
  const entering = isPaused ? [] : ((await step(ctx, 'rédaction des publications', () => fillQueue(ctx, weekGuidance(ctx), weight), (r) => `${r.filter((p) => p.status !== 'refuse').length} acceptées, ${r.filter((p) => p.status === 'refuse').length} refusées`)) ?? []);
  if (strategy && !isPaused) startTests(ctx, strategy.newTests, weeksToFill(ctx.now, weekOf(ctx.now), startedOn(ctx))[0]);

  const health = await step(ctx, 'état de la file et des réseaux', async () => {
    const integrations = await new Postiz(ctx).integrations();
    return {
      reserve: await reserve(ctx),
      failed: rec?.failed ?? [],
      disconnected: NETWORKS.filter((n) => integrations.some((i) => i.identifier === n && i.disabled)),
      spend: await spendThisMonth(ctx),
      paused: isPaused,
      draftMode: draftMode(ctx),
    };
  });
  const mail = ctx.db.all<{ key: string; text: string; outcome: string }>('SELECT key, text, outcome FROM owner_mail WHERE reported = 0 ORDER BY received_at');
  const comments = ctx.db.all<Parameters<typeof buildReport>[0]['comments'][number]>("SELECT * FROM comments WHERE seen_at >= ? OR draft_status = 'propose' ORDER BY created_at", since);
  const input: ReportInput = {
    facts: strategy?.facts ?? null,
    strategy: strategy ?? null,
    deep: deep ?? null,
    entering,
    waiting: pendingApproval(ctx),
    expired,
    comments,
    toRead: commentsToRead(week),
    lessons: lessonsSince(ctx, since),
    mail,
    health: health ?? { reserve: Object.fromEntries(NETWORKS.map((n) => [n, null])) as never, failed: [], disconnected: [], spend: { openrouter: NaN, x: NaN }, paused: isPaused, draftMode: draftMode(ctx) },
    steps: ctx.steps,
    now: ctx.now,
    dry: ctx.dry,
    ramping: fillWindow(ctx.now, startedOn(ctx)).ramping,
  };
  const summary = await step(ctx, 'résumé du compte rendu', () => summarize(ctx, input, decisionsFor(input)), (s) => (s ? 'écrit' : 'phrases du programme'));
  const report = buildReport(input, summary ?? null);
  // The report on disk too, private like the rest of the data: what was sent, as it was sent.
  const folder = join(ctx.paths.data, 'comptes-rendus');
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, `${weekOf(ctx.now)}${ctx.dry ? '-a-blanc' : ''}.html`), report.html);
  // One report a week: a run started again the same week keeps its report on the server and sends nothing.
  const sentFor = ctx.db.getKv<string>('compte_rendu_envoye');
  if (sentFor === weekOf(ctx.now) && !ctx.dry) ctx.log('  compte rendu déjà envoyé cette semaine : gardé sur le serveur, pas renvoyé');
  else {
    await sendMail(ctx, report.subject, report.text, report.html);
    ctx.db.setKv('compte_rendu_envoye', weekOf(ctx.now));
  }
  // What « oui B » refers to, until the next report.
  ctx.db.setKv('decisions', report.decisions);
  for (const m of mail) ctx.db.run('UPDATE owner_mail SET reported = 1 WHERE key = ?', m.key);
}
