/**
 * The launch (owner's decision): rather than wait three weeks for the first
 * reviewed post, a handful of posts drawn from the carousels go out in the days
 * that follow, one or two a network, an Instagram story included. They pass the
 * same filter and the same review, are sent to the owner in a launch e-mail, and
 * are only put into Postiz once the owner answers « ok » (or « ok sauf 3 »),
 * never before. Approving starts the routine's ramp (`fillWindow`).
 *
 * Since D8 every week works the same way: Monday's posts, and a fresh page's,
 * are held too, and the same « ok » puts into Postiz everything that waits.
 */
import { CALENDAR, parisTime, rotate, type Slot } from './calendar';
import type { Network } from './config';
import { addDays, day, weekOf, type Ctx } from './context';
import { sendMail } from './mail';
import { avoided, directives } from './memory';
import { journal, publishHeld, schedule, writePosts, type Planned, type PostRow } from './posts';
import { Postiz } from './postiz';
import { buildLaunch } from './report';
import { NOTION_SOURCES, imagesFor, online, type Source } from './sources';

/** Which network posts what, and when, from the second day on: X and Bluesky first, Instagram and Facebook the next evening, Threads after. */
const PLAN: ReadonlyArray<{ network: Network; offset: number; notion: 'A' | 'B'; angle: Planned['angle'] }> = [
  { network: 'x', offset: 2, notion: 'A', angle: 'exemple' },
  { network: 'bluesky', offset: 2, notion: 'A', angle: 'exemple' },
  { network: 'instagram', offset: 3, notion: 'A', angle: 'carrousel' },
  { network: 'facebook', offset: 3, notion: 'B', angle: 'long' },
  { network: 'threads', offset: 4, notion: 'B', angle: 'question' },
];

/** The calendar's hour for a network: the time its readers already get Squiggle's posts at. */
function hourOf(network: Network): Slot {
  return CALENDAR.find((s) => s.network === network && s.pillar === 'notion')!;
}

/** A post approved less than this before its hour is too late to schedule. */
const APPROVAL_MARGIN_MS = 2 * 3_600_000;

/** Every post waiting for the owner's « ok »: the launch's, each week's, a fresh page's. */
export function pendingApproval(ctx: Pick<Ctx, 'db'>): PostRow[] {
  return ctx.db.all<PostRow>("SELECT * FROM posts WHERE status = 'en_attente' ORDER BY slot_at");
}

/**
 * A held post whose hour came without an « ok » does not go out (D8): it leaves
 * the queue as `sans_accord`, and its slot stays empty. Returns how many.
 */
export function expireHeld(ctx: Pick<Ctx, 'db' | 'now' | 'dry'>): number {
  const late = ctx.db.all<PostRow>("SELECT * FROM posts WHERE status = 'en_attente' AND slot_at <= ?", new Date(ctx.now.getTime() + APPROVAL_MARGIN_MS).toISOString());
  if (!ctx.dry) for (const p of late) ctx.db.run("UPDATE posts SET status = 'sans_accord', reason = 'arrivée à son heure sans votre accord', checked_at = ? WHERE id = ?", ctx.now.toISOString(), p.id);
  return late.length;
}


/** Prepares the launch posts, holds them, and sends them to the owner. */
export async function prepareLaunch(ctx: Ctx): Promise<PostRow[]> {
  if (pendingApproval(ctx).length) throw new Error('des publications attendent déjà votre accord : répondez « ok », ou `contenu lancement-ok`');
  const list = directives(ctx, ctx.now);
  // Notions whose carousel the build has drawn: the launch is made of them.
  const usage = journal(ctx, addDays(ctx.now, -84)).map((p) => ({ sourceId: p.source_id, network: p.network, slotAt: p.slot_at }));
  const ids = rotate(NOTION_SOURCES.map((s) => s.id), usage, () => 0, new Set(NOTION_SOURCES.filter((s) => avoided(list, s)).map((s) => s.id)));
  const chosen: Source[] = [];
  for (const id of ids) {
    const source = NOTION_SOURCES.find((s) => s.id === id)!;
    if ((await online(ctx, source.path)) && (await imagesFor(ctx, source)).slides.length) chosen.push(source);
    if (chosen.length === 2) break;
  }
  if (chosen.length < 2) throw new Error('pas assez de notions avec leur carrousel en ligne');
  const planned: Planned[] = PLAN.map((p) => {
    const slot = { ...hourOf(p.network), angle: p.angle };
    const at = parisTime(day(addDays(ctx.now, p.offset)), slot.time);
    return { slot, at, week: weekOf(at), pillar: 'notion', angle: p.angle, source: chosen[p.notion === 'A' ? 0 : 1] };
  });
  const rows = await schedule(ctx, await writePosts(ctx, planned, ''), [], true);
  const launch = buildLaunch(rows, ctx.dry);
  await sendMail(ctx, launch.subject, launch.text, launch.html);
  return rows;
}

/**
 * The owner's « ok » (D8): every held post goes into Postiz, but those set
 * aside. A post whose hour came while it waited does not go out (`expireHeld`).
 */
export async function approveHeld(ctx: Ctx, except: number[]): Promise<string> {
  const late = expireHeld(ctx);
  const held = pendingApproval(ctx).filter((p) => p.slot_at > new Date(ctx.now.getTime() + APPROVAL_MARGIN_MS).toISOString());
  if (!held.length) return late ? `${late} publication${late > 1 ? 's' : ''} arrivée${late > 1 ? 's' : ''} à son heure sans accord, rien d’autre en attente` : 'aucune publication en attente';
  const integrations = await new Postiz(ctx).integrations();
  let scheduled = 0;
  let setAside = 0;
  const failed: string[] = [];
  for (const row of held) {
    if (row.num !== null && except.includes(row.num)) {
      if (!ctx.dry) ctx.db.run("UPDATE posts SET status = 'retire', reason = 'écartée à votre demande', checked_at = ? WHERE id = ?", ctx.now.toISOString(), row.id);
      setAside += 1;
      continue;
    }
    if (ctx.dry) continue;
    try {
      await publishHeld(ctx, row, integrations);
      scheduled += 1;
    } catch (error) {
      failed.push(`${row.num} (${(error as Error).message})`);
    }
  }
  if (!ctx.dry && scheduled && !ctx.db.getKv('demarrage')) ctx.db.setKv('demarrage', weekOf(ctx.now));
  if (ctx.dry) return `(à blanc) ${held.length - setAside} publications auraient été programmées`;
  return [
    `${scheduled} publication${scheduled > 1 ? 's' : ''} programmée${scheduled > 1 ? 's' : ''}`,
    setAside ? `${setAside} écartée${setAside > 1 ? 's' : ''}` : '',
    late ? `${late} arrivée${late > 1 ? 's' : ''} à son heure sans accord, non partie${late > 1 ? 's' : ''}` : '',
    failed.length ? `non programmées, à reprendre dans Postiz : ${failed.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join(', ');
}

