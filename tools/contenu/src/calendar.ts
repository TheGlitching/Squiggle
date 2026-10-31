/**
 * The weekly calendar and how its slots are filled. The starting strategy
 * speaks first to the curious general public (Threads, Instagram, Facebook, X,
 * Bluesky alike), teachers being one audience among others: the glossary's
 * questions are worded for any reader, and teachers get one slot in two weeks.
 *
 * Starting shares, over a week of 13 posts: a glossary notion about half, the
 * week's piece of substance about a quarter (more when one has just been
 * merged), product and teachers the rest. They are starting points: a test
 * moves an hour, the owner moves a share (rule 7).
 */
import type { Network } from './config';
import { addDays, day } from './context';

export type Pillar = 'notion' | 'fond' | 'produit' | 'classe';
/** Which side of a notion a post shows (`blog-declinaison`): its example, how to spot it, its question; or the whole card. */
export type Angle = 'exemple' | 'reperer' | 'question' | 'long' | 'carrousel' | 'page';

export interface Slot {
  network: Network;
  /** 1 Monday to 7 Sunday. */
  weekday: number;
  /** Paris time, `HH:MM`. */
  time: string;
  pillar: Pillar | 'produit-ou-classe';
  angle: Angle;
  /** Two notions a week: `A` across the networks, `B` once, so Friday does not repeat Monday. */
  notion?: 'A' | 'B';
}

export const CALENDAR: readonly Slot[] = [
  { network: 'x', weekday: 1, time: '12:00', pillar: 'notion', angle: 'exemple', notion: 'A' },
  { network: 'bluesky', weekday: 1, time: '12:15', pillar: 'notion', angle: 'exemple', notion: 'A' },
  { network: 'threads', weekday: 1, time: '18:30', pillar: 'notion', angle: 'question', notion: 'A' },
  { network: 'facebook', weekday: 2, time: '18:30', pillar: 'notion', angle: 'long', notion: 'A' },
  { network: 'bluesky', weekday: 3, time: '12:15', pillar: 'fond', angle: 'page' },
  { network: 'threads', weekday: 3, time: '18:30', pillar: 'fond', angle: 'page' },
  { network: 'instagram', weekday: 3, time: '19:00', pillar: 'notion', angle: 'carrousel', notion: 'A' },
  { network: 'x', weekday: 4, time: '12:00', pillar: 'fond', angle: 'page' },
  { network: 'bluesky', weekday: 4, time: '18:30', pillar: 'notion', angle: 'reperer', notion: 'A' },
  { network: 'facebook', weekday: 4, time: '18:30', pillar: 'fond', angle: 'page' },
  { network: 'bluesky', weekday: 5, time: '12:15', pillar: 'produit-ou-classe', angle: 'page' },
  { network: 'threads', weekday: 5, time: '18:30', pillar: 'notion', angle: 'exemple', notion: 'B' },
  { network: 'instagram', weekday: 5, time: '19:00', pillar: 'produit-ou-classe', angle: 'page' },
];

/** A post enters the queue at least this far ahead: three weeks to say no before it goes out (D2). */
export const REVIEW_DAYS = 21;

/** The UTC instant of a wall-clock time in Paris, on a `YYYY-MM-DD` day, daylight saving included. */
export function parisTime(dayStr: string, time: string): Date {
  const [h, m] = time.split(':').map(Number);
  const guess = new Date(`${dayStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(guess);
  const local = Number(parts.find((p) => p.type === 'hour')!.value) * 60 + Number(parts.find((p) => p.type === 'minute')!.value);
  let offset = local - (h * 60 + m);
  if (offset < -720) offset += 1440;
  if (offset > 720) offset -= 1440;
  // `offset` is how far Paris is ahead of UTC at that instant (60 or 120 minutes).
  return new Date(guess.getTime() - offset * 60_000);
}

/** The Mondays whose slots may be filled now: from the first one far enough ahead, to four weeks out. */
export function weeksToFill(now: Date, mondayOfThisWeek: string): string[] {
  const out: string[] = [];
  for (let w = 1; w <= 4; w += 1) {
    const monday = day(addDays(new Date(`${mondayOfThisWeek}T00:00:00Z`), 7 * w));
    const first = Math.min(...CALENDAR.map((s) => slotAt(monday, s).getTime()));
    if (first >= addDays(now, REVIEW_DAYS).getTime()) out.push(monday);
  }
  return out;
}

export function slotAt(monday: string, slot: Pick<Slot, 'weekday' | 'time'>): Date {
  return parisTime(day(addDays(new Date(`${monday}T00:00:00Z`), slot.weekday - 1)), slot.time);
}

/** Product or teachers, alternating by week, and the opposite on the two networks that share the slot. */
export function resolvePillar(slot: Slot, monday: string): Pillar {
  if (slot.pillar !== 'produit-ou-classe') return slot.pillar;
  const week = Math.floor(Date.parse(`${monday}T00:00:00Z`) / (7 * 86_400_000));
  const even = (week + (slot.network === 'instagram' ? 1 : 0)) % 2 === 0;
  return even ? 'produit' : 'classe';
}

export interface Usage {
  sourceId: string;
  network: Network;
  slotAt: string;
}

/**
 * The next sources in rotation: never used first, then the least recently
 * used, then those Search Console shows most, so a notion people already find
 * gets posts that bring them back.
 */
export function rotate(ids: readonly string[], usage: readonly Usage[], weight: (id: string) => number, exclude: ReadonlySet<string>): string[] {
  const last = new Map<string, string>();
  for (const u of usage) if ((last.get(u.sourceId) ?? '') < u.slotAt) last.set(u.sourceId, u.slotAt);
  return ids
    .filter((id) => !exclude.has(id))
    .sort((a, b) => (last.get(a) ?? '').localeCompare(last.get(b) ?? '') || weight(b) - weight(a) || a.localeCompare(b));
}
