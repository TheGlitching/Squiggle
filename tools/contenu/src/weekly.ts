/**
 * Monday, from 5:00 Paris time, in the order of the plan (3.3): collection,
 * comments and lessons, the strategy note, the piece of substance, the posts
 * four weeks out, then the report. Each step can fail on its own; the report
 * always leaves, and says which step is missing. Content pull requests are
 * followed by the daily check, which drafts their posts once they are online.
 */
import { weeksToFill } from './calendar';
import { collectAll } from './collect';
import { gscPath } from './collect/gsc';
import { NETWORKS } from './config';
import { addDays, paused, step, weekOf, type Ctx } from './context';
import { spendThisMonth } from './daily';
import { weeklyDeep } from './deep';
import { readOwnerMail } from './inbox';
import { lessonsSince } from './memory';
import { Postiz } from './postiz';
import { draftMode, fillQueue, reconcile, reserve } from './posts';
import { buildReport } from './report';
import { classifyComments, collectComments, commentsToRead, learnFromRemovals, learnFromReplies, signals } from './replies';
import { sendMail } from './mail';
import { startTests, weekGuidance, writeStrategy } from './strategy';

export async function weekly(ctx: Ctx): Promise<void> {
  const since = addDays(ctx.now, -7).toISOString();
  const isPaused = paused(ctx);
  await step(ctx, 'réponses du propriétaire', () => readOwnerMail(ctx));
  const rec = await step(ctx, 'état de la file', () => reconcile(ctx));
  const removed = ctx.db.all<{ network: string; text: string; source_id: string }>("SELECT network, text, source_id FROM posts WHERE status = 'retire' AND checked_at >= ?", since);
  await step(ctx, 'leçons des publications retirées', () => learnFromRemovals(ctx, removed));

  const week = await collectAll(ctx);

  await step(ctx, 'commentaires', async () => {
    const added = await collectComments(ctx, week);
    await classifyComments(ctx);
    await learnFromReplies(ctx);
    return added;
  }, (n) => `${n} nouveaux`);

  const strategy = await step(ctx, 'note de stratégie', () => writeStrategy(ctx, week, signals(ctx)), (s) => (s.problem ? `note bloquée : ${s.problem}` : 'réécrite'));

  const deep = isPaused ? null : await step(ctx, 'contenu de fond', () => weeklyDeep(ctx, week.gsc), (d) => d.pr?.url ?? d.why);

  const impressions = new Map((week.gsc?.pages28 ?? []).map((r) => [gscPath(r.keys[0]), r.impressions]));
  const weight = (id: string) => impressions.get(`/${id}`) ?? 0;
  const entering = isPaused ? [] : ((await step(ctx, 'publications', () => fillQueue(ctx, weekGuidance(ctx), weight), (r) => `${r.filter((p) => p.status !== 'refuse').length} acceptées, ${r.filter((p) => p.status === 'refuse').length} refusées`)) ?? []);
  if (strategy && !isPaused) startTests(ctx, strategy.newTests, weeksToFill(ctx.now, weekOf(ctx.now))[0]);

  const health = await step(ctx, 'santé', async () => {
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
  const report = buildReport({
    facts: strategy?.facts ?? null,
    strategy: strategy ?? null,
    deep: deep ?? null,
    entering,
    comments,
    toRead: commentsToRead(week),
    lessons: lessonsSince(ctx, since),
    mail,
    health: health ?? { reserve: Object.fromEntries(NETWORKS.map((n) => [n, null])) as never, failed: [], disconnected: [], spend: { openrouter: NaN, x: NaN }, paused: isPaused, draftMode: draftMode(ctx) },
    steps: ctx.steps,
    now: ctx.now,
    dry: ctx.dry,
  });
  await sendMail(ctx, report.subject, report.text);
  for (const m of mail) ctx.db.run('UPDATE owner_mail SET reported = 1 WHERE key = ?', m.key);
  ctx.db.setKv('dernier_compte_rendu', report);
}
