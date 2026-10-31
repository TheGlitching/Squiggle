/**
 * The deterministic filter every post passes before anything else looks at it.
 * No model is involved: these are the editorial line's absolute rules written as
 * code, so a post that breaks one is refused whatever a reviewer would have said.
 * A refused post leaves its slot empty; it is never rewritten automatically.
 *
 * The filter first sets the site's typography (straight apostrophes, spaces
 * inside « », a narrow space before `: ; ? !`), which is form, not content.
 */
import { typo } from '../../../web/src/glossaire';
import { ORIGIN, REPO, type Network } from './config';

/** Longest text each network takes, counted in graphemes, link included. */
export const MAX_LENGTH: Record<Network, number> = {
  x: 280,
  bluesky: 300,
  threads: 500,
  facebook: 2000,
  instagram: 2200,
};

/** Where a link to the site is required, refused, or only the bare domain is allowed. */
export const LINK_POLICY: Record<Network, 'required' | 'none' | 'domain'> = {
  bluesky: 'required',
  threads: 'required',
  facebook: 'required',
  // An Instagram caption has no clickable link: « lien dans la bio ».
  instagram: 'domain',
  // A post with a link costs X's API about thirteen times more (D5): none at all.
  x: 'none',
};

/**
 * Outlets, parties and public figures a post never names. Case-sensitive where
 * the name is also an ordinary phrase (« le monde », « faire le point »),
 * case-insensitive where it is not. A floor, not a complete list: the separate
 * review reads for the rest, and any acronym is refused below.
 */
const NAMED: RegExp[] = [
  /\b(Le Monde|Le Point|Libération|Les Échos|L[’']Express|L[’']Obs|Le Parisien|La Croix|L[’']Humanité|Marianne|Challenges|Arte|Le Canard enchaîné|Paris Match|Valeurs actuelles|Courrier international|Sud Ouest|Ouest-France|La Dépêche|Nice-Matin|Le Dauphiné|La Voix du Nord|Le Progrès|Quotidien|Brut|Konbini|Slate|Télérama|Closer|Voici|Gala|Renaissance|Horizons|Reconquête|Ensemble|Le JDD|Le Journal du dimanche)\b/u,
  /\b(figaro|mediapart|franceinfo|france ?info|france ?inter|france ?culture|france ?t[ée]l[ée]visions|france ?[2-5]|bfm ?tv|bfm|cnews|lci|tf1|m6|rmc|rtl|europe ?1|c8|tmc|huffpost|huffington|20 ?minutes|afp|reuters|associated press|le figaro|lib[ée]ration\.fr|youtube|tiktok|twitch)\b/iu,
  /\b(la france insoumise|rassemblement national|front national|les r[ée]publicains|parti socialiste|parti communiste|europe [ée]cologie|les [ée]cologistes|nouveau front populaire|mouvement d[ée]mocrate|modem)\b/iu,
  /\b(macron|le pen|m[ée]lenchon|bardella|zemmour|attal|bayrou|barnier|retailleau|darmanin|hollande|sarkozy|chirac|mitterrand|trump|biden|kamala|poutine|putin|zelensky|musk|zuckerberg|bollor[ée]|hanouna|ruffin|glucksmann|tondelier|lecornu|[ée]douard philippe|wauquiez|ciotti|p[ée]cresse|hidalgo|netanyahou|netanyahu|meloni|orb[aá]n|milei|xi jinping)\b/iu,
];

/** Capitals that are not someone's acronym. */
const ALLOWED_ACRONYMS = new Set(['PDF', 'IA', 'QR']);

const RATING: RegExp[] = [
  /\d+\s*\/\s*\d+/,
  /\b(note|notes|noté|notée|notés|notées|classement|classements|palmarès)\b/iu,
  /\b(le|la|les) (pire|pires|meilleur|meilleure|meilleurs|meilleures)\b/iu,
];

/** A number as relecture_fr.py reads one: digits, thousands separators, a decimal part, a unit. */
const NUMBER = /(?<![\p{L}\p{N}-])\d+(?:[\u00a0\u202f .,]\d+)*(?:\s?%| ?€| ?\$)?/gu;
const normNumber = (s: string) => s.replace(/[\u00a0\u202f .]/g, '').replace(',', '.').replace(/[%€$]/g, '').trim();

/** A full address, or a bare domain such as `squiggle.fr/glossaire`. */
const LINK =
  /https?:\/\/[^\s<>«»"]+|(?<![\p{L}\p{N}@./-])(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:fr|com|org|net|io|app|eu|be|ch|ca|info|social|xyz|ly|co)(?:\/[^\s<>«»"]*)?/giu;

export interface FilterInput {
  network: Network;
  text: string;
  /** The text of the page the post is drawn from: every number of the post must be in it. */
  source: string;
  /** The site's live paths (the sitemap's), so a link can only point to a page that exists. */
  sitePaths: ReadonlySet<string>;
  /** The posts already accepted in this batch, and the recent journal, for repeats. */
  others: ReadonlyArray<{ network: Network; text: string; day: string; sourceId: string }>;
  day: string;
  sourceId: string;
}

export interface FilterResult {
  text: string;
  reasons: string[];
}

function graphemes(text: string): number {
  return [...new Intl.Segmenter('fr', { granularity: 'grapheme' }).segment(text)].length;
}

/** The site's typography, outside links: `’`, `« … »` with narrow spaces, a narrow space before `: ; ? !`. */
export function typography(text: string): string {
  const links: string[] = [];
  const masked = text.replace(LINK, (m) => `\u0000${links.push(m) - 1}\u0000`);
  const set = typo(
    masked
      .replace(/'/g, '’')
      .replace(/"([^"\n]+)"/g, '« $1 »')
      .replace(/«\s*/g, '« ')
      .replace(/\s*»/g, ' »')
      .replace(/(\S)([;?!])/g, '$1 $2')
      // A colon between digits is a time or a ratio, not punctuation.
      .replace(/([^\s\d])(:)/g, '$1 $2')
      .replace(/[ \t]+/g, ' '),
  );
  return set.replace(/\u0000(\d+)\u0000/g, (_, i) => links[Number(i)]);
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** The opening sentence, folded: two posts never open on the same words. */
export function hook(text: string): string {
  return fold(text.split(/[.?!…\n]/)[0] ?? '');
}

function checkLinks(input: FilterInput, links: string[]): string[] {
  const reasons: string[] = [];
  const policy = LINK_POLICY[input.network];
  let siteLinks = 0;
  for (const raw of links) {
    const link = raw.replace(/[.,;:!?)\]]+$/, '');
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(link) ? link : `https://${link}`);
    } catch {
      reasons.push(`lien illisible : ${link}`);
      continue;
    }
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'github.com' && url.pathname.toLowerCase().startsWith(`/${REPO.toLowerCase()}`)) {
      if (policy === 'none') reasons.push(`aucun lien sur ${input.network} : ${link}`);
      continue;
    }
    if (host !== new URL(ORIGIN).hostname) {
      reasons.push(`lien hors de squiggle.fr et du dépôt : ${link}`);
      continue;
    }
    if (policy === 'none') {
      reasons.push(`aucun lien sur ${input.network} : ${link}`);
      continue;
    }
    if (policy === 'domain') {
      if (url.pathname !== '/' || url.search) reasons.push(`sur ${input.network}, seulement « squiggle.fr », le lien est dans la bio : ${link}`);
      continue;
    }
    siteLinks += 1;
    const path = url.pathname.replace(/\/$/, '') || '/';
    if (!input.sitePaths.has(path)) reasons.push(`lien vers une page qui n’existe pas : ${path}`);
    if (url.search !== `?ref=${input.network}`) reasons.push(`le lien doit finir par ?ref=${input.network} : ${link}`);
    if (url.hash) reasons.push(`lien avec une ancre : ${link}`);
  }
  if (policy === 'required' && siteLinks !== 1) reasons.push(`un lien vers squiggle.fr exactement, il y en a ${siteLinks}`);
  return reasons;
}

/**
 * The rules that hold for any text of Squiggle, a post or a page: numbers from
 * the source only, nobody real named, no mark, no first person, no owner.
 * `prose` is the text without its links.
 */
export function contentReasons(prose: string, source: string): string[] {
  const reasons: string[] = [];
  const known = new Set([...source.matchAll(NUMBER)].map((m) => normNumber(m[0])));
  for (const m of prose.matchAll(NUMBER)) {
    if (!known.has(normNumber(m[0]))) reasons.push(`chiffre absent de la source : ${m[0].trim()}`);
  }

  for (const pattern of NAMED) {
    const m = pattern.exec(prose);
    if (m) reasons.push(`nom de média, de parti ou de personnalité : ${m[0]}`);
  }
  for (const m of prose.matchAll(/(?<![\p{L}])[A-ZÀ-Ý]{2,}(?![\p{L}])/gu)) {
    if (!ALLOWED_ACRONYMS.has(m[0])) reasons.push(`sigle : ${m[0]}`);
  }
  const mention = /(^|[^\p{L}\p{N}.])@[\p{L}\p{N}_-]+(?:\.[\p{L}\p{N}_-]+)*/u.exec(prose);
  if (mention) reasons.push(`mention d’un compte : ${mention[0].trim()}`);
  for (const pattern of RATING) {
    const m = pattern.exec(prose);
    if (m) reasons.push(`note ou classement : ${m[0]}`);
  }
  if (/(^|[^\p{L}])(je(?![\p{L}])|j’)/iu.test(prose)) reasons.push('« je » : Squiggle parle sans première personne');
  if (/\b(denis|fonteneau)\b/iu.test(prose)) reasons.push('le propriétaire n’apparaît jamais');
  if (/[—]/.test(prose)) reasons.push('tiret cadratin');
  if (/["]/.test(prose)) reasons.push('guillemets droits');
  return reasons;
}

export function filterPost(input: FilterInput): FilterResult {
  const text = typography(input.text.trim());
  const reasons: string[] = [];

  const length = graphemes(text);
  if (length > MAX_LENGTH[input.network]) reasons.push(`trop long pour ${input.network} : ${length} sur ${MAX_LENGTH[input.network]}`);
  if (length < 40) reasons.push('trop court pour dire quelque chose');

  const links = text.match(LINK) ?? [];
  reasons.push(...checkLinks(input, links));
  const prose = text.replace(LINK, ' ');

  reasons.push(...contentReasons(prose, input.source));
  if ((prose.match(/#[\p{L}\p{N}_]+/gu) ?? []).length > 3) reasons.push('plus de trois mots-dièse');

  const opening = hook(text);
  for (const other of input.others) {
    if (other.network === input.network && other.day === input.day && other.sourceId === input.sourceId) {
      reasons.push('déjà une publication sur cette source ce jour-là sur ce réseau');
    }
    if (opening && hook(other.text) === opening) reasons.push('même accroche qu’une autre publication');
    if (other.network === input.network && fold(other.text) === fold(text)) reasons.push('texte déjà publié sur ce réseau');
  }

  return { text, reasons: [...new Set(reasons)] };
}

/** The numbers a text contains, as the filter reads them: what the strategy note's prose is checked with too. */
export function numbersIn(text: string): string[] {
  return [...text.replace(LINK, ' ').matchAll(NUMBER)].map((m) => normNumber(m[0]));
}
