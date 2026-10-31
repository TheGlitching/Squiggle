/**
 * The Monday report: possibly the only thing the owner reads to judge the
 * week, often on a phone. So it says the essential first, in plain French, then
 * what is expected of the owner, then a few figures with what they mean, then
 * every post entering the queue as it will look, each with a short number to
 * answer « retire 4 ». No internal name, no file, no command.
 *
 * One structure, two renderings: an HTML e-mail in the site's colours, one
 * column, readable in a dark or a light mail client, and a plain-text version
 * for clients that show no HTML. Every figure is computed by the program; the
 * model wrote only the summary sentences, checked against the same figures.
 */
import { CAPS, NETWORKS, ORIGIN, type Network } from './config';
import type { Step } from './context';
import type { DeepResult } from './deep';
import type { Lesson } from './memory';
import type { PostRow } from './posts';
import type { CommentRow } from './replies';
import type { Facts, StrategyResult } from './strategy';

export const NETWORK_NAME: Record<Network, string> = { bluesky: 'Bluesky', threads: 'Threads', facebook: 'Facebook', instagram: 'Instagram', x: 'X' };
/** Each network's own colour, for its dot: what the eye looks for in a list of posts. */
const NETWORK_DOT: Record<Network, string> = { bluesky: '#1185fe', threads: '#1c1b1f', facebook: '#1877f2', instagram: '#e1306c', x: '#1c1b1f' };
const PILLAR_NAME: Record<string, string> = { notion: 'notion du glossaire', fond: 'contenu de la semaine', produit: 'le site', classe: 'pour les enseignants' };

const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', ...o });
const DAY_LONG = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
const DAY_SHORT = fmt({ day: 'numeric', month: 'long' });
const HOUR = fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const firstOf = (s: string) => s.replace(/^1 /, '1er ');
export const parisDay = (iso: string) => cap(firstOf(DAY_LONG.format(new Date(iso)).replace(/ 1 /, ' 1er ')));
export const parisHour = (iso: string) => HOUR.format(new Date(iso)).replace(':', ' h ').replace(/ h 00$/, ' h');
export const parisDate = (iso: string) => `${DAY_LONG.format(new Date(iso))} à ${parisHour(iso)}`;
const shortDay = (iso: string) => firstOf(DAY_SHORT.format(new Date(iso)));
const money = (n: number) => (Number.isFinite(n) ? `${n.toFixed(2).replace('.', ',')} $` : 'inconnu');
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;

export interface Health {
  reserve: Record<Network, string | null>;
  failed: PostRow[];
  disconnected: string[];
  spend: { openrouter: number; x: number };
  paused: boolean;
  draftMode: boolean;
}

export interface ReportInput {
  facts: Facts | null;
  strategy: StrategyResult | null;
  deep: DeepResult | null;
  entering: PostRow[];
  comments: CommentRow[];
  toRead: Record<string, number>;
  lessons: Lesson[];
  mail: Array<{ text: string; outcome: string }>;
  health: Health;
  steps: Step[];
  now: Date;
  dry: boolean;
  /** The first weeks, when the queue is filled a week at a time with a short review window. */
  ramping?: boolean;
}

export interface Summary {
  essentiel: string[];
  lecture: string;
}

export interface Decision {
  letter: string;
  kind: 'article' | 'strategie';
  /** What the owner decides, in one sentence. */
  title: string;
  /** How to answer, from a phone. */
  answer: string;
  link?: { href: string; label: string };
  /** The pull request's number, or the proposal it is about. */
  ref: string;
}

export function reserveDays(reserve: Record<Network, string | null>, now: Date): Record<Network, number> {
  return Object.fromEntries(NETWORKS.map((n) => [n, reserve[n] ? Math.max(0, Math.floor((Date.parse(reserve[n]!) - now.getTime()) / 86_400_000)) : 0])) as Record<Network, number>;
}

/** The decisions waiting for the owner: a page to review, and what the routine only proposes. */
export function decisionsFor(input: ReportInput): Decision[] {
  const out: Decision[] = [];
  const next = () => String.fromCharCode(65 + out.length);
  const d = input.deep;
  if (d?.subject && d.production && (d.pr || input.dry)) {
    const letter = next();
    out.push({
      letter,
      kind: 'article',
      title: `Relire ${d.production.label}, proposé pour le site.`,
      answer: d.pr
        ? `Pour le publier, appuyez sur « Merge » en bas de la page de relecture. Pour le refuser, répondez « non ${letter} ».`
        : 'Version d’essai : rien n’a été proposé, la page de relecture n’existe pas.',
      link: d.pr ? { href: `${d.pr.url}/files`, label: 'Ouvrir la relecture sur GitHub' } : undefined,
      ref: d.pr ? String(d.pr.number) : '',
    });
  }
  const proposals = [...(input.strategy?.note?.propositions ?? []), ...input.lessons.filter((x) => x.status === 'proposee').map((l) => l.text)];
  for (const title of proposals) {
    const letter = next();
    out.push({ letter, kind: 'strategie', title, answer: `Répondez « oui ${letter} » ou « non ${letter} ».`, ref: title });
  }
  return out;
}

/** What the owner is expected to do, in one line. */
export function expectation(decisions: Decision[], paused: boolean): string {
  if (paused) return 'La routine est suspendue. Répondez « reprendre » pour qu’elle reprenne.';
  if (decisions.length === 0) return 'Rien à faire cette semaine : si les publications vous conviennent, elles partiront seules.';
  return decisions.length === 1 ? 'Une décision vous attend, juste en dessous.' : `${plural(decisions.length, 'décision')} vous attendent, juste en dessous.`;
}

/** A refused post's reason, said plainly. */
export function plainReason(reason: string | null): string {
  const r = reason ?? '';
  if (r.startsWith('relecture')) {
    const why = r.replace(/^relecture : /, '');
    return /impossible/.test(why) ? 'la relecture n’a pas pu se faire' : `refusée à la relecture : ${why.slice(0, 160)}`;
  }
  const rules: Array<[RegExp, string]> = [
    [/trop long pour/, 'trop longue pour ce réseau'],
    [/trop court/, 'trop courte'],
    [/même accroche/, 'commençait comme une autre publication'],
    [/déjà une publication sur cette source/, 'même sujet le même jour'],
    [/texte déjà publié/, 'déjà publiée'],
    [/chiffre absent/, 'un chiffre qui n’est pas sur la page'],
    [/nom de média|sigle|mention d’un compte/, 'un nom propre qui n’a pas sa place'],
    [/note ou classement/, 'ressemblait à une note ou un classement'],
    [/annonce l’exemple comme inventé/, 'disait que l’exemple était inventé'],
    [/fait passer l’exemple pour réel/, 'faisait passer l’exemple pour réel'],
    [/lien/, 'un lien incorrect'],
    [/« je »|propriétaire|tiret|guillemets|mots-dièse/, 'une question de forme'],
    [/aucune image pour Instagram/, 'pas d’image pour Instagram'],
    [/réseau désactivé/, 'réseau désactivé dans Postiz'],
    [/rédaction impossible/, 'n’a pas pu être rédigée'],
    [/programmation impossible/, 'n’a pas pu être programmée'],
  ];
  return `refusée par le contrôle : ${rules.find(([re]) => re.test(r))?.[1] ?? 'une règle de la ligne éditoriale'}`;
}

/** Posts in order, grouped under their day in Paris. */
function byDay(posts: PostRow[]): Array<{ day: string; posts: PostRow[] }> {
  const days = new Map<string, PostRow[]>();
  for (const x of posts) days.set(parisDay(x.slot_at), [...(days.get(parisDay(x.slot_at)) ?? []), x]);
  return [...days].map(([day, list]) => ({ day, posts: list }));
}

/** A change against the weeks before, said plainly; nothing when there is nothing to compare. */
function trend(now: number, before: number | null): string {
  if (before === null) return '';
  if (before === 0) return now === 0 ? 'comme les semaines d’avant' : 'contre aucune les semaines d’avant';
  const pct = Math.round(((now - before) / before) * 100);
  return pct === 0 ? 'stable' : `${pct > 0 ? '+' : ''}${pct} % par rapport aux semaines d’avant`;
}

const TEST_NAME: Record<string, (v: string) => string> = {
  heure: (v) => `publier ${v.startsWith('-') ? 'plus tôt' : 'plus tard'} (${v.replace(/^[+-]/, '')} minutes)`,
  question_finale: (v) => (v === 'avec' ? 'finir par une question' : 'ne pas finir par une question'),
  image: (v) => (v === 'avec' ? 'ajouter une image' : 'sans image'),
};

/** Everything both renderings say, already in plain French. */
export interface ReportModel {
  subject: string;
  banner: string | null;
  period: string;
  essentiel: string[];
  expectation: string;
  decisions: Decision[];
  figures: Array<{ label: string; value: string; trend: string }>;
  bars: Array<{ label: string; value: number }>;
  lecture: string;
  tooEarly: string | null;
  tests: string[];
  article: string;
  queue: { intro: string; days: Array<{ day: string; posts: PostRow[] }> } | null;
  replies: string[];
  learned: string[];
  footer: string[];
  stop: string[];
}

export function reportModel(input: ReportInput, summary: Summary | null): ReportModel {
  const f = input.facts;
  const accepted = input.entering.filter((x) => x.status !== 'refuse' && x.num !== null).sort((a, b) => a.slot_at.localeCompare(b.slot_at));
  const refused = input.entering.filter((x) => x.status === 'refuse');
  const decisions = decisionsFor(input);
  // The seven days the figures cover: from a week ago to yesterday.
  const period = `du ${shortDay(new Date(input.now.getTime() - 7 * 86_400_000).toISOString())} au ${shortDay(new Date(input.now.getTime() - 86_400_000).toISOString())}`;

  const figures: ReportModel['figures'] = [];
  if (f?.networkVisits) figures.push({ label: 'Visites venues des réseaux', value: String(f.networkVisits.week), trend: trend(f.networkVisits.week, f.networkVisits.previous) });
  if (f?.google) figures.push({ label: 'Visites venues de Google', value: String(f.google.clicks), trend: `pour ${plural(f.google.impressions, 'apparition')} dans les résultats` });
  if (f?.accounts) figures.push({ label: 'Comptes créés sur le site', value: String(f.accounts.week), trend: trend(f.accounts.week, f.accounts.previous) });


  const d = input.deep;
  const article = !d
    ? 'Le contenu de la semaine n’a pas pu être préparé.'
    : !d.subject
      ? `Pas de nouveau contenu cette semaine : ${d.why}.`
      : `${cap(d.production?.label ?? d.subject.slug)}. Pourquoi : ${d.why}.${input.dry ? ' Version d’essai : il n’a pas été proposé.' : ''}`;

  const replies = [
    ...input.comments.filter((c) => c.draft).map((c) => `${NETWORK_NAME[c.network as Network] ?? c.network} : « ${c.text.slice(0, 200)} ». Réponse proposée : « ${c.draft} ». ${c.post_ref}`),
    ...Object.entries(input.toRead).map(([n, k]) => `${NETWORK_NAME[n as Network] ?? n} : ${plural(k, 'commentaire')} à lire dans l’appli.`),
  ];
  const learned = [...input.lessons.filter((l) => l.status === 'active').map((l) => l.text), ...input.mail.map((m) => `Votre réponse « ${m.text.slice(0, 100)} » : ${m.outcome}.`)];

  const reserve = reserveDays(input.health.reserve, input.now);
  const started = Object.values(input.health.reserve).some(Boolean);
  const minReserve = Math.min(...NETWORKS.map((n) => reserve[n]));
  const problems = [
    input.health.failed.length ? `${plural(input.health.failed.length, 'publication')} en échec` : '',
    input.health.disconnected.length ? `à reconnecter dans Postiz : ${input.health.disconnected.map((n) => NETWORK_NAME[n as Network] ?? n).join(', ')}` : '',
    started && minReserve < 14 ? `la file ne couvre plus que ${plural(minReserve, 'jour')}` : '',
  ].filter(Boolean);
  const failedSteps = input.steps.filter((s) => !s.ok);
  const footer = [
    refused.length
      ? `Publications laissées de côté (${refused.length}), leur créneau reste vide : ${refused.map((x) => `${NETWORK_NAME[x.network]} ${parisDay(x.slot_at).toLowerCase()}, ${plainReason(x.reason)}`).join(' ; ')}.`
      : 'Publications laissées de côté : aucune.',
    problems.length ? `Santé : ${problems.join(', ')}.` : `Santé : tout va bien.${started ? ` La file couvre ${plural(minReserve, 'jour')}.` : ''}`,
    `Dépenses du mois : ${money(input.health.spend.openrouter)} pour la rédaction (plafond ${money(CAPS.openrouterMonthly)}), ${money(input.health.spend.x)} pour X (plafond ${money(CAPS.xMonthly)}).`,
    ...(failedSteps.length ? [`À noter : ${failedSteps.map((s) => s.name).join(', ')} n’${failedSteps.length > 1 ? 'ont' : 'a'} pas pu se faire cette semaine.`] : []),
    ...(input.health.draftMode ? ['Après plusieurs retraits la même semaine, les publications entrent dans Postiz en brouillon, à valider vous-même.'] : []),
  ];

  const visits = f?.networkVisits?.week;
  const fallback: Summary = {
    essentiel: [
      visits === undefined ? 'Les chiffres de la semaine n’ont pas pu être lus.' : `La semaine dernière, ${plural(visits, 'visite')} ${visits > 1 ? 'sont venues' : 'est venue'} des réseaux.`,
      accepted.length ? `${plural(accepted.length, 'publication')} entrent dans la file, à partir du ${shortDay(accepted[0].slot_at)}.` : 'Aucune publication n’entre dans la file cette semaine.',
      d?.subject && d.production ? `Un contenu est proposé pour le site : ${d.production.label}.` : 'Pas de nouveau contenu pour le site cette semaine.',
    ],
    lecture: '',
  };
  const s = summary ?? fallback;

  return {
    subject: `Squiggle, votre semaine ${period}${decisions.length ? ` : ${plural(decisions.length, 'décision')} à prendre` : ''}`,
    banner: input.dry ? 'Version d’essai : rien n’a été publié, programmé ni proposé. Ce qui suit montre ce qui serait parti.' : null,
    period,
    essentiel: s.essentiel,
    expectation: expectation(decisions, input.health.paused),
    decisions,
    figures,
    bars: f ? NETWORKS.map((n) => ({ label: NETWORK_NAME[n], value: f.networks[n].visits })) : [],
    lecture: s.lecture,
    tooEarly: f && f.weeksOfData < 4 ? 'Il y a encore trop peu de semaines de publications pour tirer des conclusions : ces chiffres servent de point de départ.' : null,
    tests: (f?.tests ?? []).map((t) => `Essai en cours sur ${NETWORK_NAME[t.network]} : ${(TEST_NAME[t.kind] ?? (() => t.kind))(t.value)}, semaine ${t.week} sur 4${t.verdict ? `, résultat : ${t.verdict}` : ''}.`),
    article,
    queue: accepted.length
      ? {
          intro: `${plural(accepted.length, 'publication')} entrent dans la file. Elles partiront du ${shortDay(accepted[0].slot_at)} au ${shortDay(accepted[accepted.length - 1].slot_at)}. Pour en retirer une, répondez « retire » et son numéro (par exemple « retire ${accepted[0].num} »), ou supprimez-la dans Postiz.${input.ramping ? ' La routine démarre : la file se remplit une semaine à la fois, et le délai avant parution remonte chaque lundi jusqu’à quatre semaines.' : ''}`,
          days: byDay(accepted),
        }
      : null,
    replies,
    learned,
    footer,
    stop: [
      'Tout suspendre : répondez « stop » à cet e-mail. Plus rien n’est ajouté, ce qui est déjà prévu continue de partir. « reprendre » relance.',
      'Retirer une publication : supprimez-la dans l’appli Postiz, ou répondez « retire » et son numéro.',
      'En dernier recours : éteignez le serveur depuis l’appli OVH. Plus rien ne part.',
    ],
  };
}

// ---------- Plain text ----------

function imagesLine(x: PostRow): string | null {
  const images = x.image_url ? x.image_url.split(' ') : [];
  if (!images.length) return null;
  return `Image : ${images[0]}${images.length > 1 ? ` (et ${images.length - 1} de plus)` : ''}`;
}

export function renderText(m: ReportModel): string {
  const out: string[] = [];
  if (m.banner) out.push(`[ ${m.banner} ]`, '');
  out.push(`SQUIGGLE, VOTRE SEMAINE ${m.period.toUpperCase()}`, '', ...m.essentiel, '', `> ${m.expectation}`, '');
  if (m.decisions.length) {
    out.push('LES DÉCISIONS', '');
    for (const d of m.decisions) out.push(`${d.letter}. ${d.title}`, `   ${d.answer}`, ...(d.link ? [`   ${d.link.label} : ${d.link.href}`] : []), '');
  }
  out.push('LES CHIFFRES DE LA SEMAINE', '');
  for (const f of m.figures) out.push(`${f.label} : ${f.value}${f.trend ? ` (${f.trend})` : ''}`);
  if (m.bars.length) out.push(`Par réseau : ${m.bars.map((b) => `${b.label} ${b.value}`).join(', ')}`);
  if (m.lecture) out.push('', m.lecture);
  if (m.tooEarly) out.push('', m.tooEarly);
  out.push(...m.tests, '', 'LE CONTENU DE LA SEMAINE', '', m.article, '', 'CE QUI VA PARTIR', '');
  if (!m.queue) out.push('Rien de nouveau dans la file cette semaine.', '');
  else {
    out.push(m.queue.intro, '');
    for (const day of m.queue.days) {
      out.push(`--- ${day.day} ---`);
      for (const x of day.posts) {
        out.push('', `[${x.num}] ${NETWORK_NAME[x.network]}${x.angle === 'story' ? ' story' : ''}, ${parisHour(x.slot_at)}`, x.text);
        const img = imagesLine(x);
        if (img) out.push(img);
      }
      out.push('');
    }
  }
  out.push('RÉPONSES À FAIRE', '', ...(m.replies.length ? m.replies : ['Rien cette semaine.']), '');
  out.push('CE QUE LA ROUTINE A APPRIS', '', ...(m.learned.length ? m.learned : ['Rien cette semaine.']), '');
  out.push('EN BREF', '', ...m.footer, '', 'ARRÊTER', '', ...m.stop);
  return out.join('\n');
}

// ---------- HTML ----------

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The site's tokens (web/src/index.css); a post is shown on the paper the site's figures use. */
const C = {
  bg: '#0a0a0b',
  surface: '#141417',
  border: '#2a2a2f',
  fg: '#ece9e3',
  muted: '#a8a39b',
  accent: '#9061f0',
  accentSoft: '#1a1330',
  accentInk: '#cdbdfb',
  accentFg: '#0a0a0b',
  paper: '#f2f1ee',
  paperInk: '#1c1b1f',
  paperMuted: '#5c5b61',
  paperEdge: '#c9c6bf',
};
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";

const h2 = (title: string) => `<h2 class="fg" style="margin:36px 0 12px;font:700 21px/1.3 ${SANS};color:${C.fg};letter-spacing:-0.01em">${esc(title)}</h2>`;
const para = (text: string, size = 16) => `<p class="fg" style="margin:0 0 12px;font:400 ${size}px/1.55 ${SANS};color:${C.fg}">${esc(text)}</p>`;
const small = (text: string) => `<p class="muted" style="margin:0 0 10px;font:400 15px/1.5 ${SANS};color:${C.muted}">${esc(text)}</p>`;
const card = (inner: string, pad = '14px 16px') => `<div class="card" style="margin:0 0 10px;padding:${pad};border-radius:10px;background:${C.surface};border:1px solid ${C.border}">${inner}</div>`;

function postCard(x: PostRow): string {
  const images = x.image_url ? x.image_url.split(' ') : [];
  const alts = x.alt ? x.alt.split(' | ') : [];
  const thumb = images.length
    ? `<td width="88" valign="top" style="padding:0 0 0 12px"><a href="${esc(images[0])}"><img src="${esc(images[0])}" width="88" alt="${esc(alts[0] ?? '')}" style="display:block;width:88px;height:auto;border-radius:6px;border:1px solid ${C.paperEdge}"></a>${
        images.length > 1 ? `<div style="font:400 12px/1.4 ${SANS};color:${C.paperMuted};text-align:center;padding-top:4px">+${images.length - 1} image${images.length > 2 ? 's' : ''}</div>` : ''
      }</td>`
    : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;background:${C.paper};border-radius:10px;border:1px solid ${C.paperEdge}"><tr><td style="padding:14px 16px">
<div style="font:700 15px/1.4 ${SANS};color:${C.paperInk}"><span style="display:inline-block;min-width:22px;padding:1px 6px;margin-right:8px;border-radius:6px;background:${C.paperInk};color:${C.paper};text-align:center">${x.num}</span><span style="display:inline-block;width:10px;height:10px;border-radius:5px;background:${NETWORK_DOT[x.network]};margin-right:6px"></span>${esc(NETWORK_NAME[x.network])}${x.angle === 'story' ? ' story' : ''}<span style="font-weight:400;color:${C.paperMuted}"> · ${esc(parisHour(x.slot_at))}</span></div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px"><tr><td valign="top" style="font:400 16px/1.5 ${SERIF};color:${C.paperInk};overflow-wrap:anywhere;word-break:break-word">${x.angle === 'story' ? `<span style="font:600 14px/1.4 ${SANS};color:${C.paperMuted}">Story, l’image seule. Ce qu’elle dit :</span><br>` : ''}${esc(x.text).replace(/\n/g, '<br>')}</td>${thumb}</tr></table>
<div style="margin-top:10px;font:400 13px/1.4 ${SANS};color:${C.paperMuted}">${esc(cap(PILLAR_NAME[x.pillar] ?? x.pillar))} : ${esc(x.source_title ?? x.source_id)}</div>
</td></tr></table>`;
}

function bars(items: ReportModel['bars']): string {
  const max = Math.max(1, ...items.map((b) => b.value));
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 14px">${items
    .map(
      (b) => `<tr><td width="88" class="fg" style="padding:5px 8px 5px 0;font:400 15px/1.3 ${SANS};color:${C.fg}">${esc(b.label)}</td>
<td style="padding:5px 0"><div style="height:14px;width:${Math.max(2, Math.round((b.value / max) * 100))}%;background:${b.value ? C.accent : C.border};border-radius:3px"></div></td>
<td width="36" align="right" class="fg" style="padding:5px 0 5px 8px;font:700 15px/1.3 ${SANS};color:${C.fg}">${b.value}</td></tr>`,
    )
    .join('')}</table>`;
}

export function renderHtml(m: ReportModel, notice = false): string {
  const parts: string[] = [];
  if (m.banner) parts.push(`<div style="margin:0 0 20px;padding:12px 14px;border-radius:8px;background:#1f1608;border:1px solid #d97706;font:600 15px/1.45 ${SANS};color:#fbbf24">${esc(m.banner)}</div>`);
  if (notice) {
    parts.push(...m.essentiel.map((s) => para(s, 17)));
    if (m.expectation) parts.push(`<div class="note" style="margin:16px 0 0;padding:12px 14px;border-radius:8px;background:${C.accentSoft};border-left:4px solid ${C.accent};font:600 16px/1.45 ${SANS};color:${C.accentInk}">${esc(m.expectation)}</div>`);
    for (const day of m.queue?.days ?? []) parts.push(`<div class="fg" style="margin:22px 0 10px;font:700 17px/1.3 ${SANS};color:${C.fg}">${esc(day.day)}</div>`, ...day.posts.map(postCard));
    return shell(m.subject, parts);
  }
  parts.push(`<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px"><tr>
<td valign="middle" style="padding-right:12px"><img src="${ORIGIN}/icons/icon-192.png" width="44" height="44" alt="Squiggle" style="display:block;border-radius:10px"></td>
<td valign="middle"><div class="fg" style="font:800 24px/1.15 ${SANS};color:${C.fg};letter-spacing:-0.02em">Votre semaine</div><div class="muted" style="font:400 15px/1.4 ${SANS};color:${C.muted}">${esc(cap(m.period))}</div></td>
</tr></table>`);
  parts.push(...m.essentiel.map((s) => para(s, 17)));
  parts.push(`<div class="note" style="margin:16px 0 0;padding:12px 14px;border-radius:8px;background:${C.accentSoft};border-left:4px solid ${C.accent};font:600 16px/1.45 ${SANS};color:${C.accentInk}">${esc(m.expectation)}</div>`);

  if (m.decisions.length) {
    parts.push(h2('Les décisions'));
    for (const d of m.decisions) {
      parts.push(
        card(`<div class="fg" style="font:700 16px/1.45 ${SANS};color:${C.fg}"><span class="accent" style="color:${C.accentInk}">${d.letter}.</span> ${esc(d.title)}</div>
<div class="muted" style="margin-top:6px;font:400 15px/1.5 ${SANS};color:${C.muted}">${esc(d.answer)}</div>
${d.link ? `<a href="${esc(d.link.href)}" style="display:inline-block;margin-top:12px;padding:11px 16px;border-radius:8px;background:${C.accent};color:${C.accentFg};font:700 15px/1.2 ${SANS};text-decoration:none">${esc(d.link.label)}</a>` : ''}`),
      );
    }
  }

  parts.push(h2('Les chiffres de la semaine'));
  for (const f of m.figures) {
    parts.push(
      card(`<div class="muted" style="font:400 14px/1.4 ${SANS};color:${C.muted}">${esc(f.label)}</div>
<div class="fg" style="font:800 28px/1.2 ${SANS};color:${C.fg}">${esc(f.value)}</div>${f.trend ? `<div class="muted" style="font:400 14px/1.4 ${SANS};color:${C.muted}">${esc(f.trend)}</div>` : ''}`, '12px 16px'),
    );
  }
  if (m.bars.length) parts.push(`<div style="height:6px"></div>`, small('Visites venues de chaque réseau'), bars(m.bars));
  if (m.lecture) parts.push(para(m.lecture));
  if (m.tooEarly) parts.push(small(m.tooEarly));
  parts.push(...m.tests.map(small));

  parts.push(h2('Le contenu de la semaine'), para(m.article));

  parts.push(h2('Ce qui va partir'));
  if (!m.queue) parts.push(para('Rien de nouveau dans la file cette semaine.'));
  else {
    parts.push(para(m.queue.intro));
    for (const day of m.queue.days) parts.push(`<div class="fg" style="margin:22px 0 10px;font:700 17px/1.3 ${SANS};color:${C.fg}">${esc(day.day)}</div>`, ...day.posts.map(postCard));
  }

  parts.push(h2('Réponses à faire'), ...(m.replies.length ? m.replies.map((r) => para(r)) : [small('Rien cette semaine.')]));
  parts.push(h2('Ce que la routine a appris'), ...(m.learned.length ? m.learned.map((r) => para(r)) : [small('Rien cette semaine.')]));
  parts.push(h2('En bref'), ...m.footer.map(small));
  parts.push(h2('Arrêter'), ...m.stop.map(small));
  return shell(m.subject, parts);
}

function shell(subject: string, parts: string[]): string {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${esc(subject)}</title>
<style>
  /* The site is dark; a mail client set to light gets the site's paper instead, at the same contrasts. */
  @media (prefers-color-scheme: light) {
    .bg { background: #f2f1ee !important; }
    .fg { color: #1c1b1f !important; }
    .muted { color: #55545a !important; }
    .accent { color: #5b2fc9 !important; }
    .card { background: #ffffff !important; border-color: #c9c6bf !important; }
    .note { background: #ece6fd !important; color: #3d1d8f !important; }
  }
</style></head>
<body class="bg" style="margin:0;padding:0;background:${C.bg}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="bg" style="background:${C.bg}"><tr><td align="center" style="padding:24px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;table-layout:fixed"><tr><td align="left" style="text-align:left;overflow-wrap:anywhere;word-break:break-word">
${parts.join('\n')}
</td></tr></table>
</td></tr></table>
</body></html>`;
}

/** The launch e-mail: the first posts, each to read, none scheduled until the owner says « ok ». */
export function buildLaunch(posts: PostRow[], dry: boolean): { subject: string; text: string; html: string } {
  const held = posts.filter((x) => x.status === 'en_attente').sort((a, b) => a.slot_at.localeCompare(b.slot_at));
  const set = posts.filter((x) => x.status === 'refuse');
  const example = held.find((x) => x.angle !== 'story')?.num ?? 1;
  const model: ReportModel = {
    subject: 'Squiggle : les premières publications, à valider',
    banner: dry ? 'Version d’essai : rien ne sera programmé, même avec votre accord.' : null,
    period: '',
    essentiel: [
      `Voici les premières publications de Squiggle sur les réseaux, pour les jours qui viennent : ${plural(held.length, 'publication')}, tirées des carrousels du glossaire.`,
      'Elles ont passé les mêmes contrôles que toutes les autres. Rien ne partira sans votre accord.',
      ...(set.length ? [`${plural(set.length, 'autre')} ${set.length > 1 ? 'ont été écartées' : 'a été écartée'} par le contrôle : ${set.map((x) => `${NETWORK_NAME[x.network]}, ${plainReason(x.reason)}`).join(' ; ')}.`] : []),
    ],
    expectation: `Répondez « ok » pour tout programmer, ou « ok sauf ${example} » pour en écarter une. Sans réponse, rien ne part.`,
    decisions: [],
    figures: [],
    bars: [],
    lecture: '',
    tooEarly: null,
    tests: [],
    article: '',
    queue: { intro: '', days: byDay(held) },
    replies: [],
    learned: [],
    footer: [],
    stop: [],
  };
  const text = [
    ...(model.banner ? [`[ ${model.banner} ]`, ''] : []),
    ...model.essentiel,
    '',
    `> ${model.expectation}`,
    '',
    ...held.map((x) => `[${x.num}] ${NETWORK_NAME[x.network]}${x.angle === 'story' ? ' story' : ''}, ${parisDate(x.slot_at)}\n${x.text}\n`),
  ].join('\n');
  return { subject: model.subject, text, html: renderHtml(model, true) };
}

/** The short e-mail that shows a fresh page's posts, 48 hours before the first goes out. */
export function buildNotice(title: string, path: string, posts: PostRow[], dry: boolean): { subject: string; text: string; html: string } {
  const list = posts.filter((x) => x.num !== null).sort((a, b) => a.slot_at.localeCompare(b.slot_at));
  const intro = `« ${title} » est en ligne sur le site. ${plural(list.length, 'publication')} ${list.length > 1 ? 'vont' : 'va'} la faire connaître cette semaine, la première au plus tôt dans 48 heures. Pour en retirer une, répondez « retire » et son numéro, ou supprimez-la dans Postiz.`;
  const model: ReportModel = {
    subject: `Squiggle : « ${title} » part sur les réseaux`,
    banner: dry ? 'Version d’essai : rien n’a été programmé.' : null,
    period: '',
    essentiel: [intro],
    expectation: 'Rien à faire si elles vous conviennent.',
    decisions: [],
    figures: [],
    bars: [],
    lecture: '',
    tooEarly: null,
    tests: [],
    article: `${ORIGIN}${path}`,
    queue: { intro: '', days: byDay(list) },
    replies: [],
    learned: [],
    footer: [],
    stop: [],
  };
  const text = [intro, '', ...list.map((x) => `[${x.num}] ${NETWORK_NAME[x.network]}, ${parisDate(x.slot_at)}\n${x.text}\n`)].join('\n');
  return { subject: model.subject, text, html: renderHtml(model, true) };
}

export function buildReport(input: ReportInput, summary: Summary | null): { subject: string; text: string; html: string; decisions: Decision[] } {
  const model = reportModel(input, summary);
  return { subject: model.subject, text: renderText(model), html: renderHtml(model), decisions: model.decisions };
}
