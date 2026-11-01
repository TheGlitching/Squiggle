/**
 * Mastodon's hashtags, chosen each week on what people there actually use.
 * Mastodon has no ranking feed: a hashtag someone follows is one of the few
 * ways a stranger meets a post, so a tag nobody uses (#ÉducationAuxMédias had
 * no user in a week on three French-speaking instances) reaches nobody.
 *
 * The candidates are a closed list the owner reviews; the program only orders
 * it, on the public tag API (no key), by the accounts that used each tag over
 * the last seven days, and the drafting is given the most used three.
 */
import { fetchJson, weekOf, type Ctx } from './context';

/** The closed list, in the order of the measure of 1 November 2026. Changing it is the owner's call (rule 7). */
export const MASTODON_TAGS = ['Désinformation', 'Éducation', 'FactChecking', 'Enseignement', 'EspritCritique'] as const;

/** French-speaking instances whose usage counts, Squiggle's own first. */
export const TAG_INSTANCES = ['mastodon.social', 'piaille.fr', 'mamot.fr'] as const;

export const TAGS_PER_POST = 3;

interface TagHistory {
  history?: Array<{ day: string; uses: string; accounts: string }>;
}

interface WeekTags {
  week: string;
  tags: string[];
  /** Accounts that used each tag over seven days, summed over the instances. */
  usage: Record<string, number>;
}

/** The most used tags of the list, ties in the list's order; a tag nobody used is left out. */
export function pickTags(usage: Readonly<Record<string, number>>, n = TAGS_PER_POST): string[] {
  return MASTODON_TAGS.filter((t) => (usage[t] ?? 0) > 0)
    .sort((a, b) => (usage[b] ?? 0) - (usage[a] ?? 0))
    .slice(0, n);
}

const ascii = (tag: string) => tag.normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * This week's tags: measured once a week and kept. When the measure fails, last
 * week's choice stands (a choice, not a figure the report shows), else the
 * list's head.
 */
export async function weekTags(ctx: Ctx): Promise<string[]> {
  const week = weekOf(ctx.now);
  const known = ctx.db.getKv<WeekTags>('mots_diese');
  if (known?.week === week) return known.tags;
  const usage: Record<string, number> = {};
  try {
    for (const tag of MASTODON_TAGS) {
      usage[tag] = 0;
      for (const host of TAG_INSTANCES) {
        const data = await fetchJson<TagHistory>(ctx, `Mastodon (${host})`, `https://${host}/api/v1/tags/${encodeURIComponent(ascii(tag))}`, { signal: AbortSignal.timeout(20_000) });
        // The API gives the last seven days, today included.
        for (const d of data.history ?? []) usage[tag] += Number(d.accounts) || 0;
      }
    }
  } catch (error) {
    ctx.log(`  mots-dièse non mesurés : ${(error as Error).message}`);
    return known?.tags ?? MASTODON_TAGS.slice(0, TAGS_PER_POST);
  }
  const tags = pickTags(usage);
  ctx.log(`  mots-dièse : ${tags.map((t) => `#${t} (${usage[t]})`).join(' ')}`);
  if (!ctx.dry) ctx.db.setKv('mots_diese', { week, tags, usage } satisfies WeekTags);
  return tags.length ? tags : (known?.tags ?? MASTODON_TAGS.slice(0, TAGS_PER_POST));
}
