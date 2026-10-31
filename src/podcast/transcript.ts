/**
 * A podcast episode's own transcript, read in the reader's browser.
 *
 * Many podcast feeds publish, for each episode, the address of its
 * transcript (the `podcast:transcript` tag of the Podcasting 2.0 namespace).
 * On an episode's page the extension finds the page's feed, the episode in
 * it and that address, and reads the transcript: from the reader's browser,
 * on the reader's click, as the podcast's own apps do. The server never
 * fetches the feed, the transcript or the episode; it receives the text, as
 * it receives an article's.
 *
 * The feed is plain RSS, and a service worker has no XML parser, so it is
 * read with patterns over its `<item>` elements: what is taken from it is
 * three addresses and a title, nothing that needs a tree.
 */
import { readTranscript } from '@squiggle/shared';

import type { CaptionCue } from '../video/youtube';

/** What an episode's page offers to find its transcript: its feeds, and the sound it plays. */
export interface PodcastPage {
  url: string;
  title: string;
  feeds: string[];
  audio: string[];
}

export interface PublishedTranscript {
  url: string;
  type: string;
  /** The episode's title in its feed. */
  title: string;
}

/**
 * Runs in the page's world (`UnifiedRuntime.runInPage`), so it is
 * serialised: it may use nothing but the page's globals. Null on a page
 * that names no feed or plays no sound, which is every article that is not
 * an episode, so that no feed is fetched for them.
 */
export function probePodcastPage(): PodcastPage | null {
  // The feed a page declares, then the addresses that read as a feed in its
  // markup: a podcast host's page often carries its feed's address only in
  // the data its player is built from (Ausha's does).
  const declared = [
    ...document.querySelectorAll<HTMLLinkElement>('link[rel~="alternate"][type="application/rss+xml"][href]'),
  ].map((link) => link.href);
  const named = (document.documentElement.innerHTML.match(/https?:\/\/[^\s"'<>\\]+/g) ?? []).filter(
    (href) => /(^https?:\/\/(feeds?|rss)\.)|\/(feeds?|rss)(\/|\.xml|\.rss|$)|\.rss$/i.test(href) && !/\/comments\/feed/i.test(href),
  );
  const feeds = [...new Set([...declared, ...named])].filter((href) => /^https?:/.test(href)).slice(0, 3);
  if (!feeds.length) return null;
  const audio = [
    ...[...document.querySelectorAll<HTMLMediaElement>('audio[src], audio source[src]')].map(
      (el) => (el as HTMLMediaElement & { src: string }).src,
    ),
    ...[...document.querySelectorAll<HTMLMetaElement>('meta[property="og:audio"], meta[property="og:audio:url"]')].map(
      (meta) => meta.content,
    ),
    ...[...document.querySelectorAll<HTMLAnchorElement>('a[href]')]
      .map((a) => a.href)
      .filter((href) => /\.(mp3|m4a|aac|ogg|opus)(\?|$)/i.test(href)),
  ].filter(Boolean);
  // A player embedded from a podcast host, when the page has no audio element of its own.
  const player = document.querySelector('iframe[src*="podcast" i], iframe[src*="audio" i], iframe[src*="player" i]');
  if (!audio.length && !player) return null;
  const title =
    document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content || document.title || '';
  return { url: location.href, title: title.trim(), feeds, audio: audio.slice(0, 20) };
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function xmlText(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
      if (name[0] === '#') {
        const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
        return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
      }
      return ENTITIES[name.toLowerCase()] ?? whole;
    })
    .trim();
}

function attr(tag: string, name: string): string {
  const match = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return match ? xmlText(match[2] ?? match[3] ?? '') : '';
}

function element(xml: string, name: string): string {
  const match = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(xml);
  return match ? xmlText(match[1]) : '';
}

/** An address as two pages naming the same thing would both write it. */
function sameAddress(a: string, b: string, keepQuery: boolean): boolean {
  try {
    const x = new URL(a);
    const y = new URL(b);
    const path = (u: URL) => u.pathname.replace(/\/+$/, '');
    return (
      x.hostname.replace(/^www\./, '') === y.hostname.replace(/^www\./, '') &&
      path(x) === path(y) &&
      (!keepQuery || x.search === y.search)
    );
  } catch {
    return false;
  }
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** The formats read, best first: those with times, then the rest. */
const TYPES = ['text/vtt', 'application/x-subrip', 'application/srt', 'text/srt', 'application/json', 'text/html', 'text/plain'];

/**
 * The transcript the feed publishes for the episode this page shows, or null.
 * The episode is the feed's item that links to this page, plays the sound the
 * page plays, or bears its title; the first that does, in that order of trust.
 */
export function transcriptInFeed(feed: string, page: PodcastPage): PublishedTranscript | null {
  const items = feed.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  const parsed = items.map((xml) => ({
    xml,
    title: element(xml, 'title'),
    link: element(xml, 'link'),
    enclosure: attr(/<enclosure\b[^>]*>/i.exec(xml)?.[0] ?? '', 'url'),
  }));
  const pageTitle = fold(page.title);
  const episode =
    parsed.find((item) => item.link && sameAddress(item.link, page.url, false)) ??
    parsed.find((item) => item.enclosure && page.audio.some((src) => sameAddress(src, item.enclosure, false))) ??
    parsed.find((item) => {
      const title = fold(item.title);
      return title.length >= 12 && (pageTitle === title || pageTitle.includes(title));
    });
  if (!episode) return null;
  const offered = (episode.xml.match(/<podcast:transcript\b[^>]*>/gi) ?? [])
    .map((tag) => ({ url: attr(tag, 'url'), type: attr(tag, 'type').toLowerCase() }))
    .filter((t) => /^https?:\/\//.test(t.url));
  const rank = (type: string) => {
    const i = TYPES.indexOf(type);
    return i < 0 ? TYPES.length : i;
  };
  const best = offered.sort((a, b) => rank(a.type) - rank(b.type))[0];
  return best ? { ...best, title: episode.title } : null;
}

/** The speech of a transcript file, as timed passages, whatever its format. */
export function transcriptCues(body: string, type: string): CaptionCue[] {
  let text = body;
  if (type === 'application/json') {
    try {
      // The Podcasting 2.0 JSON transcript: `{ segments: [{ startTime, body }] }`.
      const segments = (JSON.parse(body) as { segments?: Array<{ startTime?: unknown; body?: unknown }> }).segments ?? [];
      return segments
        .filter((s) => typeof s.body === 'string' && s.body.trim())
        .map((s) => ({ start: typeof s.startTime === 'number' ? s.startTime : 0, text: (s.body as string).trim() }));
    } catch {
      return [];
    }
  }
  if (type === 'text/html' || /^\s*</.test(body)) {
    text = xmlText(
      body
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
        .replace(/<br\s*\/?>|<\/(p|div|li|h\d|cite|time|span)>/gi, '\n')
        .replace(/<[^>]+>/g, ''),
    );
  }
  const timed = readTranscript(text);
  if (timed) return timed.map((p) => ({ start: p.at, text: p.text }));
  return text
    .split(/\n\s*\n|\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((line) => ({ start: 0, text: line }));
}
