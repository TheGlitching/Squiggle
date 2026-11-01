/**
 * The posts: which source fills which slot, the drafting, the two checks, and
 * the scheduling in Postiz.
 *
 * Every post adapts a page that is already online and reviewed; the model
 * writes the words, never the substance. A post passes the deterministic
 * filter, then a separate review that sees only the text, its source, its
 * image and the editorial line, without the drafting context. A post refused by
 * either leaves its slot empty: it is never rewritten automatically.
 */
import { randomUUID } from 'node:crypto';

import { CALENDAR, fillWindow, resolvePillar, rotate, slotAt, weeksToFill, type Angle, type Pillar, type Slot, type Usage } from './calendar';
import { FACEBOOK_LINKS_PER_MONTH, FRESH_NOTICE_HOURS, NETWORKS, ORIGIN, X_PRICES, type Network } from './config';
import { addDays, day, weekOf, type Ctx } from './context';
import { contentReasons, filterPost, linkPolicy, type LinkPolicy } from './filter';
import { weekTags } from './hashtags';
import { askJson, BudgetExceeded } from './llm';
import { avoided, consigne, directives, lessonsBlock, networkDirective, type Directive } from './memory';
import { Postiz, type Integration } from './postiz';
import { EVERY_NETWORK, testValue } from './strategy';
import { ARTICLE_SOURCES, NOTION_SOURCES, PRODUCT_PAGES, TEACHER_PAGES, imagesFor, online, pageSource, type Image, type Source } from './sources';

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
 * The images a post carries: on Instagram the carousel, elsewhere one picture
 * or none when the link shows its card. A format test turns a post that carries
 * a picture into the carousel, or the carousel into its one picture.
 */
export function chooseImages(network: Network, angle: Angle, imgs: { slides: Image[]; card: Image | null }, t: Tweaks, link: LinkPolicy): Image[] {
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
  reason: string | null;
}

async function draft(ctx: Ctx, p: Planned, thisWeek: string, t: Tweaks, link: LinkPolicy, tags: readonly string[]): Promise<string> {
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
      'Réponds {"texte": "..."}.',
    ]
      .filter(Boolean)
      .join('\n\n'),
    maxTokens: 2500,
  });
  return String(answer.texte ?? '');
}

/** The separate review: only the text, its source, its images and the editorial line. */
async function review(ctx: Ctx, network: Network, text: string, source: Source, images: Image[]): Promise<{ conforme: boolean; raison: string }> {
  const answer = await askJson<{ conforme: boolean; raison?: string }>(ctx, {
    purpose: 'relecture',
    system: `${consigne(ctx, 'ligne-editoriale')}\n\n---\n\n${consigne(ctx, 'relecture')}`,
    user: [
      `Publication pour ${network} :\n"""\n${text}\n"""`,
      `Page source :\n"""\n${source.text.slice(0, 6000)}\n"""`,
      images.length ? `Images jointes (${images.length}), texte alternatif : ${images.map((i) => i.alt).join(' | ')}` : 'Aucune image.',
      'Réponds {"conforme": true} ou {"conforme": false, "raison": "..."}.',
    ].join('\n\n'),
    images: images.slice(0, 2).map((i) => i.url),
    maxTokens: 4000,
  });
  return { conforme: answer.conforme === true, raison: String(answer.raison ?? '') };
}

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
  const others = journal(ctx, addDays(ctx.now, -56)).map((p) => ({ network: p.network, text: p.text, day: p.slot_at.slice(0, 10), sourceId: p.source_id }));
  const tags = planned.some((p) => p.slot.network === 'mastodon') ? await weekTags(ctx) : [];
  const drafts: Draft[] = [];
  for (const p of planned) {
    const t = tweaks(ctx, p.slot.network, p.at);
    const link = linkFor(ctx, p, others, t);
    const postTags = t.tags === 'sans' ? [] : tags;
    const images = chooseImages(p.slot.network, p.angle, await imagesFor(ctx, p.source), t, link);
    if (p.slot.network === 'instagram' && images.length === 0) {
      drafts.push({ planned: p, text: '', images, status: 'refuse', reason: 'aucune image pour Instagram' });
      continue;
    }
    let text = '';
    try {
      text = await draft(ctx, p, thisWeek, t, link, postTags);
    } catch (error) {
      drafts.push({ planned: p, text: '', images, status: 'refuse', reason: `rédaction impossible : ${(error as Error).message}` });
      if (error instanceof BudgetExceeded) break;
      continue;
    }
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
    if (filtered.reasons.length) {
      drafts.push({ planned: p, text: filtered.text, images, status: 'refuse', reason: `filtre : ${filtered.reasons.join(' ; ')}` });
      continue;
    }
    const verdict = await review(ctx, p.slot.network, filtered.text, p.source, images).catch((e: Error) => ({ conforme: false, raison: `relecture impossible : ${e.message}` }));
    if (!verdict.conforme) {
      drafts.push({ planned: p, text: filtered.text, images, status: 'refuse', reason: `relecture : ${verdict.raison || 'non conforme'}` });
      continue;
    }
    drafts.push({ planned: p, text: filtered.text, images, status: 'propose', reason: null });
    others.push({ network: p.slot.network, text: filtered.text, day: day(p.at), sourceId: p.source.id });
    // A post on Instagram or Facebook gets its story the same evening, when the build drew one.
    const story = (p.slot.network === 'instagram' || p.slot.network === 'facebook') && p.source.kind !== 'page' ? (await imagesFor(ctx, p.source)).story : null;
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
  if (reasons.length) return { planned, text: story.alt, images: [story], status: 'refuse', reason: `filtre : ${reasons.join(' ; ')}` };
  const verdict = await review(ctx, p.slot.network, `Story (une image plein écran, sans légende). Son texte : ${story.alt}`, p.source, [story]).catch((e: Error) => ({
    conforme: false,
    raison: `relecture impossible : ${e.message}`,
  }));
  return { planned, text: story.alt, images: [story], status: verdict.conforme ? 'propose' : 'refuse', reason: verdict.conforme ? null : `relecture : ${verdict.raison || 'non conforme'}` };
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
      `INSERT INTO posts (id, week, network, slot_at, pillar, angle, source_id, source_title, text, image_url, alt, status, reason, postiz_id, created_at, num)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

