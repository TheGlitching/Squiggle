/**
 * The posts: which source fills which slot, the drafting, the two checks, and
 * the scheduling in Postiz.
 *
 * Every post adapts a page that is already online and reviewed; the model
 * writes the words, never the substance. A post passes the deterministic
 * filter, then a separate review that sees only the text, its source, its
 * image and the editorial line, without the drafting context. A post refused by
 * either is rewritten with the reason, and checked again, up to `POST_TRIES`
 * times; one still refused then leaves its slot empty.
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { CALENDAR, fillWindow, resolvePillar, rotate, slotAt, weeksToFill, withoutVideo, type Angle, type Pillar, type Slot, type Usage } from './calendar';
import { FACEBOOK_LINKS_PER_MONTH, FRESH_NOTICE_HOURS, NETWORKS, ORIGIN, X_PRICES, type Network } from './config';
import { addDays, day, weekOf, type Ctx } from './context';
import { contentReasons, filterPost, linkPolicy, type LinkPolicy } from './filter';
import { weekTags } from './hashtags';
import { askJson, BudgetExceeded } from './llm';
import { avoided, consigne, directives, lessonsBlock, networkDirective, type Directive } from './memory';
import { Postiz, type Integration } from './postiz';
import { EVERY_NETWORK, testValue, weekGuidance } from './strategy';
import { ARTICLE_SOURCES, NOTION_SOURCES, PRODUCT_PAGES, TEACHER_PAGES, imagesFor, isVideo, online, pageSource, still, type Image, type Source } from './sources';

export interface PostRow {
  id: string;
  week: string;
  network: Network;
  slot_at: string;
  pillar: Pillar;
  angle: Angle;
  source_id: string;
  source_title: string | null;
  text: string;
  image_url: string | null;
  alt: string | null;
  /** `en_attente`: held until the owner says « ok » (D8); `sans_accord`: its hour came first, it did not go out. */
  status: 'propose' | 'refuse' | 'en_attente' | 'programme' | 'brouillon_postiz' | 'retire' | 'publie' | 'echec' | 'rendu' | 'supprime' | 'sans_accord';
  reason: string | null;
  postiz_id: string | null;
  created_at: string;
  num: number | null;
  /** How many versions the drafting wrote before this one was kept or set aside; null before the rewrites existed. */
  attempts: number | null;
}

/** The posts that count as being in the queue or out: what rotation and repeats are judged on. */
const LIVE = "('propose', 'en_attente', 'programme', 'brouillon_postiz', 'publie')";

export function journal(ctx: Pick<Ctx, 'db'>, since: Date): PostRow[] {
  return ctx.db.all<PostRow>(`SELECT * FROM posts WHERE slot_at >= ? AND status IN ${LIVE} ORDER BY slot_at`, since.toISOString());
}

/** The site's live paths, from its sitemap: a link may only point to one of them. */
export async function sitePaths(ctx: Ctx): Promise<Set<string>> {
  const response = await ctx.fetch(`${ORIGIN}/sitemap.xml`, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`sitemap : HTTP ${response.status}`);
  const xml = await response.text();
  return new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname.replace(/\/$/, '') || '/'));
}

/** The running tests' effect on a network (`strategy.ts`): an hour moved, a closing question, an image, one picture or several, a link, hashtags. */
export interface Tweaks {
  minutes: number;
  question: 'avec' | 'sans' | null;
  image: 'avec' | 'sans' | null;
  format?: 'image' | 'carrousel' | null;
  link?: 'avec' | 'sans' | null;
  tags?: 'avec' | 'sans' | null;
}

export function tweaks(ctx: Pick<Ctx, 'db'>, network: Network, at: Date): Tweaks {
  const rows = ctx.db.all<{ network: string; kind: string; value: string; start: string }>(
    "SELECT network, kind, value, start FROM tests WHERE network IN (?, ?) AND status = 'en_cours' AND start <= ? AND end >= ?",
    network,
    EVERY_NETWORK,
    day(at),
    day(at),
  );
  const t: Tweaks = { minutes: 0, question: null, image: null, format: null, link: null, tags: null };
  const either = (v: string | null) => (v === 'avec' || v === 'sans' ? v : null);
  for (const r of rows) {
    const v = testValue(r, network, at);
    if (r.kind === 'heure' && v) t.minutes = Math.max(-180, Math.min(180, Number(v) || 0));
    if (r.kind === 'question_finale') t.question = either(v);
    if (r.kind === 'image') t.image = either(v);
    if (r.kind === 'lien') t.link = either(v);
    if (r.kind === 'mots_diese') t.tags = either(v);
    if (r.kind === 'format') t.format = v === 'image' || v === 'carrousel' ? v : null;
  }
  return t;
}

export interface Planned {
  slot: Slot;
  at: Date;
  week: string;
  pillar: Pillar;
  angle: Angle;
  source: Source;
  /** The post this one takes the place of (`upgradeVideoSlots`): its text does not count as a repeat, and its story stays. */
  replaces?: string;
}

/** Search Console impressions of a source's page over 28 days: what puts a known notion first in rotation. */
type Weight = (sourceId: string) => number;

async function liveFirst(ctx: Ctx, ids: string[], resolve: (id: string) => Promise<Source | null>): Promise<Source | null> {
  for (const id of ids) {
    const source = await resolve(id);
    if (source && (await online(ctx, source.path))) return source;
  }
  return null;
}

/** Which source fills each empty slot of a week. */
export async function planWeek(ctx: Ctx, monday: string, taken: ReadonlySet<string>, weight: Weight, list: readonly Directive[]): Promise<Planned[]> {
  const usage: Usage[] = journal(ctx, addDays(ctx.now, -84)).map((p) => ({ sourceId: p.source_id, network: p.network, slotAt: p.slot_at }));
  const exclude = new Set([...NOTION_SOURCES, ...ARTICLE_SOURCES].filter((s) => avoided(list, s)).map((s) => s.id));
  const byId = new Map([...NOTION_SOURCES, ...ARTICLE_SOURCES].map((s) => [s.id, s]));
  const notions = rotate(NOTION_SOURCES.map((s) => s.id), usage, weight, exclude);
  const a = await liveFirst(ctx, notions, async (id) => byId.get(id) ?? null);
  const b = await liveFirst(ctx, notions.filter((id) => id !== a?.id), async (id) => byId.get(id) ?? null);
  const c = await liveFirst(ctx, notions.filter((id) => id !== a?.id && id !== b?.id), async (id) => byId.get(id) ?? null);

  // The piece of substance: the newest article not posted on that network these eight weeks, else a third notion.
  const recent = (network: Network, id: string) => usage.some((u) => u.sourceId === id && u.network === network && u.slotAt >= addDays(ctx.now, -56).toISOString());
  const pages = new Map<string, Source | null>();
  const page = async (path: string) => {
    if (!pages.has(path)) pages.set(path, await pageSource(ctx, path).catch(() => null));
    return pages.get(path)!;
  };

  const planned: Planned[] = [];
  const slots = [...CALENDAR];
  // « Plus de X cette semaine » adds one notion post on Saturday morning.
  for (const network of NETWORKS) {
    if (networkDirective(list, network) === 'plus') slots.push({ network, weekday: 6, time: '11:00', pillar: 'notion', angle: network === 'instagram' ? 'carrousel' : 'exemple', notion: 'B' });
  }
  for (const slot of slots) {
    // « Moins de X cette semaine » keeps only the piece of substance on that network.
    if (networkDirective(list, slot.network) === 'moins' && slot.pillar !== 'fond') continue;
    const t = tweaks(ctx, slot.network, slotAt(monday, slot));
    const at = new Date(slotAt(monday, slot).getTime() + t.minutes * 60_000);
    if (taken.has(`${slot.network}@${at.toISOString()}`)) continue;
    const pillar = resolvePillar(slot, monday);
    let source: Source | null = null;
    let angle = slot.angle;
    if (pillar === 'notion') source = slot.notion === 'B' ? b : a;
    if (pillar === 'fond') {
      source = ARTICLE_SOURCES.find((s) => !exclude.has(s.id) && !recent(slot.network, s.id)) ?? null;
      if (source && !(await online(ctx, source.path))) source = null;
      if (!source) {
        source = c;
        angle = slot.network === 'facebook' ? 'long' : 'exemple';
      }
    }
    if (pillar === 'produit' || pillar === 'classe') {
      const paths = pillar === 'produit' ? PRODUCT_PAGES : TEACHER_PAGES;
      const ids = rotate(paths.map((p) => `page${p === '/' ? '/accueil' : p}`), usage, () => 0, new Set());
      for (const id of ids) {
        source = await page(id === 'page/accueil' ? '/' : id.slice(4));
        if (source) break;
      }
    }
    if (source) planned.push({ slot, at, week: monday, pillar, angle, source });
  }
  return planned;
}

const ANGLE_BRIEF: Record<Angle, string> = {
  exemple: 'Angle « l’exemple » : l’article de la fiche en une ou deux phrases, montré comme un passage à lire, sans dire qu’il est inventé ni le faire passer pour réel, puis ce qui cloche, en une phrase.',
  reperer: 'Angle « comment le repérer » : les signes de la fiche (champ « Comment le repérer »), tels quels ou condensés.',
  question: 'Angle « la question » : la question de la fiche, posée au lecteur, avec juste assez de l’exemple pour y répondre.',
  long: 'Angle « texte long » : trois à six phrases, l’exemple puis sa lecture.',
  carrousel: 'Légende d’un carrousel qui montre la fiche en images : deux ou trois phrases qui donnent envie de faire défiler, puis « Lien dans la bio ».',
  video:
    'Légende d’une courte vidéo sans voix qui montre l’exemple de la fiche, marque le passage fautif, puis nomme le piège : une ou deux phrases qui invitent à le chercher avant la fin, sans le nommer ni recopier les mots de la vidéo, puis la question de la fiche posée au lecteur.',
  page: 'Ce que la page apporte au lecteur, en partant d’un exemple ou d’un geste qu’elle contient.',
  story: 'Une story : l’image parle seule, sans légende.',
};

const LINK_RULE: Record<Network, (url: string) => string> = {
  bluesky: (url) => `Termine par ce lien, recopié exactement : ${url}`,
  mastodon: (url) => `Mets ce lien, recopié exactement, avant les mots-dièse : ${url}`,
  threads: (url) => `Mets ce lien, recopié exactement, en fin de texte : ${url}`,
  facebook: (url) => `Mets ce lien, recopié exactement, en fin de texte : ${url}`,
  instagram: () => 'Aucune adresse : termine par « Lien dans la bio. »',
  x: () => 'Aucun lien ni aucune adresse, pas même « squiggle.fr » : le texte se suffit.',
};

const FORMAT: Record<Network, string> = {
  bluesky: '300 caractères au plus, lien compris.',
  mastodon: '500 caractères au plus, lien et mots-dièse compris.',
  threads: '500 caractères au plus, ton de conversation.',
  facebook: '3 à 6 phrases.',
  instagram: 'Une légende de 2 à 4 phrases.',
  x: '260 caractères au plus.',
};

/** How many pictures one post may carry on each network. */
const MAX_IMAGES: Record<Network, number> = { bluesky: 4, mastodon: 4, x: 4, threads: 10, facebook: 10, instagram: 10 };

/**
 * The images a post carries: its video on a video slot; on Instagram the
 * carousel, elsewhere one picture or none when the link shows its card. A format
 * test turns a post that carries a picture into the carousel, or the carousel
 * into its one picture; it leaves a video as it is.
 */
export function chooseImages(network: Network, angle: Angle, imgs: { slides: Image[]; card: Image | null; video?: Image | null }, t: Tweaks, link: LinkPolicy): Image[] {
  if (angle === 'video') return imgs.video ? [imgs.video] : [];
  const chosen = defaultImages(network, angle, imgs, t, link);
  if (network === 'instagram' || !t.format || chosen.length === 0) return chosen;
  if (t.format === 'image') return chosen.slice(0, 1);
  return imgs.slides.length > 1 ? imgs.slides.slice(0, MAX_IMAGES[network]) : chosen;
}

function defaultImages(network: Network, angle: Angle, imgs: { slides: Image[]; card: Image | null }, t: Tweaks, link: LinkPolicy): Image[] {
  const example = imgs.slides[1] ?? imgs.card;
  if (network === 'instagram') return imgs.slides.length ? imgs.slides.slice(0, 10) : imgs.card ? [imgs.card] : [];
  // X shows no link, so the picture carries the page; Bluesky shows no card unless one is given.
  if (network === 'x' || network === 'bluesky') return example ? [angle === 'reperer' && imgs.slides[3] ? imgs.slides[3] : example] : [];
  // Without a link there is no card: Facebook shows the carousel, Threads one picture (an image beats a link on both).
  if (link === 'none' && t.image !== 'sans') return network === 'facebook' && imgs.slides.length ? imgs.slides.slice(0, 10) : example ? [example] : [];
  // With one, Threads, Facebook and Mastodon draw the page's card from it, unless a test says otherwise.
  return t.image === 'avec' && example ? [example] : [];
}

export interface Draft {
  planned: Planned;
  text: string;
  images: Image[];
  status: 'propose' | 'refuse';
  /** Why it was refused; for a post accepted on a later try, why its first version was. */
  reason: string | null;
  /** How many versions were written: 1 when the first passed. */
  attempts: number;
}

/** A version that was refused, handed to the next try. */
export interface Retry {
  text: string;
  reason: string;
}

/** How many versions of a post are written before its slot is left empty: the first and two rewrites. */
export const POST_TRIES = 3;

/** What the two checks say of one version: its text once filtered, and why it was refused, if it was. */
export interface Check {
  text: string;
  reason: string | null;
  /** The review laid the refusal on the picture, not the words. */
  image?: boolean;
}

/**
 * One slot's post: written, checked, and on a refusal rewritten with the
 * reason, up to `POST_TRIES` versions. When the review lays the refusal on the
 * picture, the next version tries the next set of `fallbacks` (another picture,
 * or none where a post may go without). A call that fails (the model, the
 * review) leaves the slot empty at once: a rewrite would not mend it. Throws
 * `BudgetExceeded` so the caller stops drafting.
 */
export async function settle(
  images: Image[],
  fallbacks: Image[][],
  write: (retry: Retry | null) => Promise<string>,
  check: (text: string, images: Image[]) => Promise<Check>,
): Promise<Pick<Draft, 'text' | 'images' | 'status' | 'reason' | 'attempts'>> {
  let retry: Retry | null = null;
  let first: string | null = null;
  let pictures = images;
  const others = fallbacks.slice();
  for (let attempt = 1; ; attempt += 1) {
    let text: string;
    try {
      text = await write(retry);
    } catch (error) {
      if (error instanceof BudgetExceeded) throw error;
      return { text: retry?.text ?? '', images: pictures, status: 'refuse', reason: `rédaction impossible : ${(error as Error).message}`, attempts: attempt };
    }
    let verdict: Check;
    try {
      verdict = await check(text, pictures);
    } catch (error) {
      if (error instanceof BudgetExceeded) throw error;
      return { text, images: pictures, status: 'refuse', reason: `relecture impossible : ${(error as Error).message}`, attempts: attempt };
    }
    if (!verdict.reason) return { text: verdict.text, images: pictures, status: 'propose', reason: first, attempts: attempt };
    first ??= verdict.reason;
    if (attempt >= POST_TRIES) return { text: verdict.text, images: pictures, status: 'refuse', reason: verdict.reason, attempts: attempt };
    if (verdict.image && others.length) pictures = others.shift()!;
    retry = { text: verdict.text, reason: verdict.reason };
  }
}

/** The pictures a post may fall back on when the review finds its own off topic: another one, or none where the slot allows it. */
export function imageFallbacks(network: Network, angle: Angle, chosen: Image[], imgs: { slides: Image[]; card: Image | null }): Image[][] {
  // A video slot keeps its video: only its words are rewritten.
  if (angle === 'video' || chosen.length === 0) return [];
  const used = new Set(chosen.map((i) => i.url));
  const other = [imgs.card, ...imgs.slides].find((i): i is Image => !!i && !used.has(i.url));
  return [...(other ? [[other]] : []), ...(network === 'instagram' ? [] : [[]])];
}

async function draft(ctx: Ctx, p: Planned, thisWeek: string, t: Tweaks, link: LinkPolicy, tags: readonly string[], retry: Retry | null): Promise<string> {
  const url = `${ORIGIN}${p.source.path}?ref=${p.slot.network}`;
  const question = t.question === 'avec' ? 'Termine par une question au lecteur.' : t.question === 'sans' ? 'Ne termine pas par une question.' : '';
  const answer = await askJson<{ texte: string }>(ctx, {
    purpose: 'rédaction',
    system: [consigne(ctx, 'ligne-editoriale'), consigne(ctx, 'publications'), lessonsBlock(ctx), thisWeek].filter(Boolean).join('\n\n---\n\n'),
    user: [
      `Réseau : ${p.slot.network}. ${FORMAT[p.slot.network]}`,
      ANGLE_BRIEF[p.angle],
      link === 'none' ? LINK_RULE.x(url) : LINK_RULE[p.slot.network](url),
      p.slot.network === 'mastodon' ? (tags.length ? `Termine par ces mots-dièse, exactement et dans cet ordre : ${tags.map((tag) => `#${tag}`).join(' ')}` : 'Aucun mot-dièse.') : '',
      question,
      `Source, la seule matière permise (page ${p.source.path}) :\n"""\n${p.source.text.slice(0, 6000)}\n"""`,
      retry ? `Une version précédente a été refusée :\n"""\n${retry.text}\n"""\nMotif : ${retry.reason}. Réécris la publication en corrigeant ce point, sans enfreindre aucune autre consigne.` : '',
      'Réponds {"texte": "..."}.',
    ]
      .filter(Boolean)
      .join('\n\n'),
    maxTokens: 2500,
  }, z.object({ texte: z.string().min(1) }));
  return answer.texte;
}

/** The separate review: only the text, its source, its images and the editorial line. */
async function review(ctx: Ctx, network: Network, text: string, source: Source, images: Image[]): Promise<{ conforme: boolean; raison: string; image: boolean }> {
  const answer = await askJson(ctx, {
    purpose: 'relecture',
    system: `${consigne(ctx, 'ligne-editoriale')}\n\n---\n\n${consigne(ctx, 'relecture')}`,
    user: [
      `Publication pour ${network} :\n"""\n${text}\n"""`,
      `Page source :\n"""\n${source.text.slice(0, 6000)}\n"""`,
      images.some((i) => isVideo(i.url))
        ? `Vidéo jointe, sans voix ; son image finale est montrée. Tous les mots qu’elle affiche : ${images.map((i) => i.alt).join(' | ')}`
        : images.length
          ? `Images jointes (${images.length}), texte alternatif : ${images.map((i) => i.alt).join(' | ')}`
          : 'Aucune image.',
      'Réponds {"conforme": true} ou {"conforme": false, "raison": "...", "image": true si seule l’image est en cause, false sinon}.',
    ].join('\n\n'),
    images: images.slice(0, 2).map((i) => still(i.url)),
    maxTokens: 4000,
  }, Verdict);
  return { conforme: answer.conforme, raison: answer.raison ?? '', image: answer.image === true };
}

const Verdict = z.object({ conforme: z.boolean(), raison: z.string().optional(), image: z.boolean().optional() });

type Other = { network: Network; text: string; day: string };

/**
 * Whether a post carries its link: its network and pillar (`linkPolicy`), then
 * on Facebook the monthly cap, counted on the posts already in the queue or out
 * that month. A Facebook link post that failed this month (`reconcile`) is read
 * as the cap reached: the rest of the month goes out native.
 */
export function linkFor(ctx: Pick<Ctx, 'db'>, p: Pick<Planned, 'slot' | 'pillar' | 'at'>, others: readonly Other[], t: Pick<Tweaks, 'link'> = {}): LinkPolicy {
  // A link test only runs where a link is optional (`TEST_NETWORKS.lien`), never on Facebook and its cap.
  if (t.link === 'sans') return 'none';
  if (t.link === 'avec') return 'required';
  const policy = linkPolicy(p.slot.network, p.pillar);
  if (p.slot.network !== 'facebook' || policy !== 'required') return policy;
  const month = day(p.at).slice(0, 7);
  if (ctx.db.getKv<string>('facebook_sans_lien') === month) return 'none';
  const used = others.filter((o) => o.network === 'facebook' && o.day.startsWith(month) && /\?ref=facebook/.test(o.text)).length;
  return used < FACEBOOK_LINKS_PER_MONTH ? 'required' : 'none';
}

/** Drafts, filters and reviews a list of planned posts, in order, each judged against those already accepted. */
export async function writePosts(ctx: Ctx, planned: Planned[], thisWeek: string): Promise<Draft[]> {
  const paths = await sitePaths(ctx);
  const replaced = new Set(planned.map((p) => p.replaces));
  // A story is the picture that goes with a post, not a post of its own: it never makes another one a repeat.
  const others = journal(ctx, addDays(ctx.now, -56))
    .filter((p) => !replaced.has(p.id) && p.angle !== 'story')
    .map((p) => ({ network: p.network, text: p.text, day: p.slot_at.slice(0, 10), sourceId: p.source_id }));
  const tags = planned.some((p) => p.slot.network === 'mastodon') ? await weekTags(ctx) : [];
  const drafts: Draft[] = [];
  for (const next of planned) {
    const imgs = await imagesFor(ctx, next.source);
    // A notion whose video is not online, or shows older words than the glossary's, keeps the slot's format from before the videos.
    const p = next.angle === 'video' && !imgs.video ? { ...next, angle: withoutVideo(next.slot.network) } : next;
    const t = tweaks(ctx, p.slot.network, p.at);
    const link = linkFor(ctx, p, others, t);
    const postTags = t.tags === 'sans' ? [] : tags;
    const images = chooseImages(p.slot.network, p.angle, imgs, t, link);
    if (p.slot.network === 'instagram' && images.length === 0) {
      drafts.push({ planned: p, text: '', images, status: 'refuse', reason: 'aucune image pour Instagram', attempts: 0 });
      continue;
    }
    let settled: Awaited<ReturnType<typeof settle>>;
    try {
      settled = await settle(
        images,
        imageFallbacks(p.slot.network, p.angle, images, imgs),
        (retry) => draft(ctx, p, thisWeek, t, link, postTags, retry),
        async (text, pictures) => {
          const filtered = filterPost({
            network: p.slot.network,
            text,
            source: p.source.text,
            sitePaths: paths,
            others,
            day: day(p.at),
            sourceId: p.source.id,
            link,
            hashtags: p.slot.network === 'mastodon' ? postTags : undefined,
          });
          if (filtered.reasons.length) return { text: filtered.text, reason: `filtre : ${filtered.reasons.join(' ; ')}` };
          const verdict = await review(ctx, p.slot.network, filtered.text, p.source, pictures);
          return { text: filtered.text, reason: verdict.conforme ? null : `relecture : ${verdict.raison || 'non conforme'}`, image: verdict.image };
        },
      );
    } catch (error) {
      drafts.push({ planned: p, text: '', images, status: 'refuse', reason: `rédaction impossible : ${(error as Error).message}`, attempts: 1 });
      break;
    }
    if (settled.attempts > 1) ctx.log(`  ${p.slot.network} ${day(p.at)} : ${settled.status === 'propose' ? `réécrite, acceptée au ${settled.attempts}e essai` : `laissée de côté après ${settled.attempts} essais`}`);
    drafts.push({ planned: p, ...settled });
    if (settled.status !== 'propose') continue;
    others.push({ network: p.slot.network, text: settled.text, day: day(p.at), sourceId: p.source.id });
    // A post on Instagram or Facebook gets its story the same evening, when the build drew one.
    const story = (p.slot.network === 'instagram' || p.slot.network === 'facebook') && p.source.kind !== 'page' && !p.replaces ? imgs.story : null;
    if (story) drafts.push(await storyDraft(ctx, p, story));
  }
  return drafts;
}

/**
 * The story that goes with a post: the build's 9:16 image, whose words are the
 * site's own, so its text (the image's alternative text) passes the rules every
 * text of Squiggle does, then the same separate review, image included.
 */
async function storyDraft(ctx: Ctx, p: Planned, story: Image): Promise<Draft> {
  const at = new Date(p.at.getTime() + STORY_DELAY_HOURS * 3_600_000);
  const planned: Planned = { ...p, at, angle: 'story', slot: { ...p.slot, angle: 'story' } };
  const reasons = contentReasons(story.alt.replace(/squiggle\.fr\/\S+/g, ' '), p.source.text);
  // Its words are the image's own: there is nothing to rewrite, so a story is judged once.
  if (reasons.length) return { planned, text: story.alt, images: [story], status: 'refuse', reason: `filtre : ${reasons.join(' ; ')}`, attempts: 1 };
  const verdict = await review(ctx, p.slot.network, `Story (une image plein écran, sans légende). Son texte : ${story.alt}`, p.source, [story]).catch((e: Error) => ({
    conforme: false,
    image: false,
    raison: `relecture impossible : ${e.message}`,
  }));
  return { planned, text: story.alt, images: [story], status: verdict.conforme ? 'propose' : 'refuse', reason: verdict.conforme ? null : `relecture : ${verdict.raison || 'non conforme'}`, attempts: 1 };
}

/** A story goes out the same day as its post, in the evening, when stories are watched. */
const STORY_DELAY_HOURS = 2;

export function draftMode(ctx: Pick<Ctx, 'db'>): boolean {
  return ctx.db.getKv<boolean>('mode_brouillon') === true;
}

/**
 * Records every draft in the journal and, outside a dry run, schedules the
 * accepted ones in Postiz. With `hold`, accepted posts wait for the owner's
 * « ok » instead (D8: the launch, each week, a fresh page), and Postiz is not called.
 */
export async function schedule(ctx: Ctx, drafts: Draft[], integrations: Integration[], hold = false): Promise<PostRow[]> {
  const postiz = new Postiz(ctx);
  const asDraft = draftMode(ctx);
  const rows: PostRow[] = [];
  for (const d of drafts) {
    const p = d.planned;
    const row: PostRow = {
      id: randomUUID(),
      week: p.week,
      network: p.slot.network,
      slot_at: p.at.toISOString(),
      pillar: p.pillar,
      angle: p.angle,
      source_id: p.source.id,
      source_title: p.source.title,
      text: d.text,
      image_url: d.images.map((i) => i.url).join(' ') || null,
      alt: d.images.map((i) => i.alt).join(' | ') || null,
      status: d.status,
      reason: d.reason,
      postiz_id: null,
      created_at: new Date().toISOString(),
      num: null,
      attempts: d.attempts,
    };
    if (d.status === 'propose' && hold) row.status = 'en_attente';
    else if (d.status === 'propose' && !ctx.dry) {
      const integration = integrations.find((i) => i.identifier === p.slot.network && !i.disabled);
      if (!integration) {
        row.status = 'refuse';
        row.reason = 'réseau désactivé dans Postiz';
      } else {
        try {
          const media = [];
          for (const image of d.images) media.push(await postiz.media(image.url, image.alt));
          row.postiz_id = await postiz.create({ integrationId: integration.id, network: p.slot.network, at: p.at, text: d.text, images: media, draft: asDraft, story: p.angle === 'story' });
          row.status = asDraft ? 'brouillon_postiz' : 'programme';
          if (p.slot.network === 'x') ctx.db.run("INSERT INTO spend (at, service, usd, run_id) VALUES (?, 'x', ?, ?)", p.at.toISOString(), X_PRICES.post, ctx.runId);
        } catch (error) {
          row.status = 'refuse';
          row.reason = `programmation impossible : ${(error as Error).message}`;
        }
      }
    }
    // Every post that enters the queue gets the next short number, never reused.
    if (row.status !== 'refuse') row.num = (ctx.db.get<{ n: number | null }>('SELECT MAX(num) AS n FROM posts')?.n ?? 0) + 1;
    ctx.db.run(
      `INSERT INTO posts (id, week, network, slot_at, pillar, angle, source_id, source_title, text, image_url, alt, status, reason, postiz_id, created_at, num, attempts)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id,
      row.week,
      row.network,
      row.slot_at,
      row.pillar,
      row.angle,
      row.source_id,
      row.source_title,
      row.text,
      row.image_url,
      row.alt,
      row.status,
      row.reason,
      row.postiz_id,
      row.created_at,
      row.num,
      row.attempts,
    );
    rows.push(row);
  }
  return rows;
}

/** Puts one held post into Postiz, at its time: what approving the launch does. */
export async function publishHeld(ctx: Ctx, row: PostRow, integrations: Integration[]): Promise<PostRow> {
  const integration = integrations.find((i) => i.identifier === row.network && !i.disabled);
  if (!integration) throw new Error(`${row.network} est désactivé dans Postiz`);
  const postiz = new Postiz(ctx);
  const media = [];
  const urls = row.image_url ? row.image_url.split(' ') : [];
  const alts = row.alt ? row.alt.split(' | ') : [];
  for (const [i, url] of urls.entries()) media.push(await postiz.media(url, alts[i] ?? ''));
  const asDraft = draftMode(ctx);
  const id = await postiz.create({ integrationId: integration.id, network: row.network, at: new Date(row.slot_at), text: row.text, images: media, draft: asDraft, story: row.angle === 'story' });
  const status = asDraft ? 'brouillon_postiz' : 'programme';
  ctx.db.run('UPDATE posts SET status = ?, postiz_id = ?, slot_at = ? WHERE id = ?', status, id, row.slot_at, row.id);
  if (row.network === 'x') ctx.db.run("INSERT INTO spend (at, service, usd, run_id) VALUES (?, 'x', ?, ?)", row.slot_at, X_PRICES.post, ctx.runId);
  return { ...row, status, postiz_id: id };
}

/** The slots already held, by network and instant: our journal, and anything the owner scheduled by hand. */
async function takenSlots(ctx: Ctx, from: Date, to: Date): Promise<Set<string>> {
  const taken = new Set(journal(ctx, from).map((p) => `${p.network}@${p.slot_at}`));
  const queue = await new Postiz(ctx).posts(from, to);
  for (const p of queue) {
    // A post placed by hand within two hours of a slot holds that slot.
    const at = Date.parse(p.publishDate);
    for (const slot of CALENDAR) {
      if (slot.network !== p.integration.providerIdentifier) continue;
      const monday = weekOf(new Date(at));
      const slotTime = slotAt(monday, slot).getTime();
      if (Math.abs(slotTime - at) <= 2 * 3_600_000) taken.add(`${slot.network}@${new Date(slotTime).toISOString()}`);
    }
  }
  return taken;
}

/** The Monday the routine first filled the queue for real, which the start's ramp counts from. */
export function startedOn(ctx: Pick<Ctx, 'db'>): string | null {
  return ctx.db.getKv<string>('demarrage') ?? null;
}

/** Monday's step: fills the weeks the window allows (`fillWindow`), up to four weeks out, held for the owner's « ok » (D8). */
export async function fillQueue(ctx: Ctx, thisWeek: string, weight: Weight): Promise<PostRow[]> {
  const start = startedOn(ctx);
  const weeks = weeksToFill(ctx.now, weekOf(ctx.now), start);
  if (weeks.length === 0) return [];
  const list = directives(ctx, ctx.now);
  const taken = await takenSlots(ctx, addDays(fillWindow(ctx.now, start).from, -1), addDays(new Date(`${weeks[weeks.length - 1]}T00:00:00Z`), 8));
  const rows: PostRow[] = [];
  for (const monday of weeks) {
    const planned = await planWeek(ctx, monday, taken, weight, list);
    rows.push(...(await schedule(ctx, await writePosts(ctx, planned, thisWeek), [], true)));
  }
  if (!start && !ctx.dry && rows.some((r) => r.status !== 'refuse')) ctx.db.setKv('demarrage', weekOf(ctx.now));
  return rows;
}

/**
 * A piece of substance just went online (3.4): its posts take the « contenu de
 * la semaine » slots of the next seven days, at least 48 hours after the e-mail
 * that shows them, and wait for the owner's « ok » like every other (D8). A post already in such a slot is taken out of Postiz and
 * goes back to the journal as `rendu`; nothing the owner placed by hand is moved.
 */
export async function declineFresh(ctx: Ctx, source: Source): Promise<PostRow[]> {
  const earliest = addDays(ctx.now, FRESH_NOTICE_HOURS / 24);
  const integrations = await new Postiz(ctx).integrations();
  const planned: Planned[] = [];
  for (let d = 0; d < 9; d += 1) {
    const monday = weekOf(addDays(earliest, d));
    for (const slot of CALENDAR.filter((s) => s.pillar === 'fond')) {
      const at = slotAt(monday, slot);
      if (at < earliest || at > addDays(earliest, 7) || planned.some((p) => p.slot === slot && p.at.getTime() === at.getTime())) continue;
      planned.push({ slot, at, week: monday, pillar: 'fond', angle: 'page', source });
    }
  }
  const drafts = await writePosts(ctx, planned, '');
  const postiz = new Postiz(ctx);
  for (const d of drafts.filter((x) => x.status === 'propose')) {
    const held = ctx.db.get<PostRow>("SELECT * FROM posts WHERE network = ? AND slot_at = ? AND status IN ('programme', 'brouillon_postiz')", d.planned.slot.network, d.planned.at.toISOString());
    if (held && !ctx.dry) {
      if (held.postiz_id) await postiz.delete(held.postiz_id).catch(() => undefined);
      ctx.db.run("UPDATE posts SET status = 'rendu', reason = ? WHERE id = ?", `cède la place à ${source.id}`, held.id);
    }
  }
  return schedule(ctx, drafts, integrations, true);
}

/**
 * A video slot filled while its notion had no video online (`withoutVideo`)
 * takes the video once it is there (`contenu videos`): same notion, same hour,
 * redrafted as a video. The new post waits for the owner's « ok » like every
 * other (D8), so only slots at least 48 hours out are redone; the post it
 * replaces leaves Postiz and goes back to the journal as `rendu`, and stays
 * where its video was refused. `except` keeps some posts as they are, by number.
 */
export async function upgradeVideoSlots(ctx: Ctx, except: readonly number[]): Promise<PostRow[]> {
  const earliest = addDays(ctx.now, FRESH_NOTICE_HOURS / 24).toISOString();
  const held = ctx.db.all<PostRow>("SELECT * FROM posts WHERE slot_at >= ? AND status IN ('en_attente', 'programme', 'brouillon_postiz') ORDER BY slot_at", earliest);
  const planned: Planned[] = [];
  for (const row of held) {
    const slot = videoSlotOf(row);
    const source = NOTION_SOURCES.find((s) => s.id === row.source_id);
    if (!slot || !source || (row.num !== null && except.includes(row.num))) continue;
    if (!(await imagesFor(ctx, source)).video) continue;
    planned.push({ slot, at: new Date(row.slot_at), week: row.week, pillar: 'notion', angle: 'video', source, replaces: row.id });
  }
  const postiz = new Postiz(ctx);
  const replacing: Draft[] = [];
  for (const d of await writePosts(ctx, planned, weekGuidance(ctx))) {
    if (d.status !== 'propose' || d.planned.angle !== 'video') continue;
    const old = held.find((r) => r.id === d.planned.replaces)!;
    if (!ctx.dry) {
      try {
        if (old.postiz_id) await postiz.delete(old.postiz_id);
      } catch (error) {
        ctx.log(`  ${old.network} ${day(new Date(old.slot_at))} : gardée, Postiz ne l’a pas supprimée (${(error as Error).message})`);
        continue;
      }
      ctx.db.run("UPDATE posts SET status = 'rendu', reason = 'cède la place à sa vidéo' WHERE id = ?", old.id);
    }
    replacing.push(d);
  }
  return schedule(ctx, replacing, [], true);
}

/** The calendar's video slot a notion post holds without its video, if it holds one: the same network, within two hours (a test may move it). */
export function videoSlotOf(row: Pick<PostRow, 'network' | 'week' | 'slot_at' | 'pillar' | 'angle'>): Slot | null {
  if (row.pillar !== 'notion' || row.angle === 'video' || row.angle === 'story') return null;
  const at = Date.parse(row.slot_at);
  return CALENDAR.find((s) => s.angle === 'video' && s.network === row.network && Math.abs(slotAt(row.week, s).getTime() - at) <= 2 * 3_600_000) ?? null;
}

/** The stop lever: every future post the routine scheduled is deleted from Postiz. Posts placed by hand stay. */
export async function emptyQueue(ctx: Ctx): Promise<number> {
  const postiz = new Postiz(ctx);
  const future = ctx.db.all<PostRow>("SELECT * FROM posts WHERE slot_at > ? AND status IN ('programme', 'brouillon_postiz') AND postiz_id IS NOT NULL", ctx.now.toISOString());
  let deleted = 0;
  for (const p of future) {
    if (ctx.dry) continue;
    await postiz.delete(p.postiz_id!);
    ctx.db.run("UPDATE posts SET status = 'supprime', reason = 'arrêt demandé' WHERE id = ?", p.id);
    deleted += 1;
  }
  return deleted;
}

/**
 * Reads the queue back. A post of ours that left Postiz before its date was
 * removed by the owner: the routine never schedules it again, and the removal
 * becomes a lesson. A post that went out is marked published, one that failed, failed.
 */
export async function reconcile(ctx: Ctx): Promise<{ removed: PostRow[]; failed: PostRow[]; published: number }> {
  const ours = ctx.db.all<PostRow>("SELECT * FROM posts WHERE status IN ('programme', 'brouillon_postiz') AND postiz_id IS NOT NULL");
  if (ours.length === 0) return { removed: [], failed: [], published: 0 };
  const from = new Date(Math.min(...ours.map((p) => Date.parse(p.slot_at))) - 86_400_000);
  const to = new Date(Math.max(...ours.map((p) => Date.parse(p.slot_at))) + 86_400_000);
  const queue = new Map((await new Postiz(ctx).posts(from, to)).map((p) => [p.id, p]));
  const removed: PostRow[] = [];
  const failed: PostRow[] = [];
  let published = 0;
  for (const p of ours) {
    const live = queue.get(p.postiz_id!);
    if (!live) {
      if (Date.parse(p.slot_at) > ctx.now.getTime()) {
        ctx.db.run("UPDATE posts SET status = 'retire', checked_at = ? WHERE id = ?", ctx.now.toISOString(), p.id);
        removed.push(p);
      }
      continue;
    }
    if (live.state === 'PUBLISHED') {
      ctx.db.run("UPDATE posts SET status = 'publie', checked_at = ? WHERE id = ?", ctx.now.toISOString(), p.id);
      published += 1;
    }
    if (live.state === 'ERROR') {
      // ponytail: any failure of a Facebook link post counts as Meta's link cap, since its error text is not documented;
      // a failure for another reason only costs that month's remaining links.
      if (p.network === 'facebook' && /\?ref=facebook/.test(p.text)) ctx.db.setKv('facebook_sans_lien', p.slot_at.slice(0, 7));
      ctx.db.run("UPDATE posts SET status = 'echec', reason = ?, checked_at = ? WHERE id = ?", live.error ?? 'échec', ctx.now.toISOString(), p.id);
      failed.push({ ...p, reason: live.error ?? 'échec' });
    }
  }
  return { removed, failed, published };
}

/** The last instant each network has something queued: the reserve. */
export async function reserve(ctx: Ctx): Promise<Record<Network, string | null>> {
  const queue = await new Postiz(ctx).posts(ctx.now, addDays(ctx.now, 70));
  const out = Object.fromEntries(NETWORKS.map((n) => [n, null])) as Record<Network, string | null>;
  for (const p of queue) {
    const n = p.integration.providerIdentifier as Network;
    if (!NETWORKS.includes(n) || (p.state !== 'QUEUE' && p.state !== 'DRAFT')) continue;
    if (!out[n] || out[n]! < p.publishDate) out[n] = p.publishDate;
  }
  return out;
}

