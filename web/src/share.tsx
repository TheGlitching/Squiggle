/**
 * The image a shared link shows: one 1200 x 630 card per page that has its own
 * (`share` in `src/seo.ts`), written as a PNG by the build beside the page.
 *
 * Satori lays the card out and turns its text into paths, resvg rasterises it, so
 * no browser and no service is involved and the same build always draws the same
 * card. The drawings are the site's own (`components/Iso.tsx`), rendered to SVG
 * markup with the few classes they use written out, since resvg reads no
 * stylesheet but the one inside the SVG.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

import { Resvg } from '@resvg/resvg-js';
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import satori, { type SatoriNode } from 'satori';

import { PUBLISHED, dateLongue, type Article, type Texte } from './blog';
import { ClassFigure, GuideFigure, HeroFigure, StepFigure, squiggle } from './components/Iso';
import { SEVERITY_COLORS } from './demo';
import { NOTIONS, famille, typo, type Notion, type Segments } from './glossaire';
import type { PublicPage, ShareCard } from './seo';

export const SHARE_WIDTH = 1200;
export const SHARE_HEIGHT = 630;

const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8');
/** The palette, from the `@theme` block: a drawing names its colours `var(--color-…)`. */
const TOKENS = Object.fromEntries([...css.matchAll(/--color-(\w+):\s*(#[0-9a-f]{3,8});/gi)].map((m) => [m[1], m[2]]));
function color(name: string): string {
  if (!TOKENS[name]) throw new Error(`no --color-${name} in index.css`);
  return TOKENS[name];
}

/** The drawings' classes (`.iso-*` in `index.css`), without the entrance animations. */
const ISO_STYLE = `
  .iso-face { stroke-width: 1; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
  .iso-paper { fill: ${color('paper')}; stroke: ${color('paperEdge')}; }
  .iso-paper-edge { fill: ${color('paperEdge')}; stroke: ${color('paperEdge')}; }
  .iso-solid { fill: #17171a; stroke: #55555d; }
  .iso-solid-side { fill: #0f0f11; stroke: #55555d; }
  .iso-glass { fill: ${color('accent')}; fill-opacity: 0.1; stroke: ${color('accent')}; }
  .iso-line { fill: none; stroke-width: 1; vector-effect: non-scaling-stroke; }
`;

const FIGURES: Record<NonNullable<ShareCard['figure']>, () => ReactElement> = {
  classe: () => <ClassFigure />,
  lecture: () => <StepFigure step="lecture" />,
  rapport: () => <StepFigure step="rapport" />,
  sources: () => <StepFigure step="sources" />,
  ouvrir: () => <GuideFigure step="ouvrir" />,
  telecharger: () => <GuideFigure step="telecharger" />,
};

/** A drawing as a standalone SVG `data:` URL, at `width` pixels wide. */
function drawing(figure: ReactElement, width: number): { src: string; width: number; height: number } {
  const markup = renderToStaticMarkup(figure)
    .replace(/var\(--color-(\w+)\)/g, (_, name: string) => color(name))
    .replace(/var\(--font-(sans|display)\)/g, 'Bricolage Grotesque');
  const box = /viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/.exec(markup);
  if (!box) throw new Error('a share drawing has no viewBox');
  const height = Math.round((width * Number(box[4])) / Number(box[3]));
  const svg = markup
    .replace(/^<svg /, `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" `)
    .replace(/(<svg[^>]*>)/, `$1<style>${ISO_STYLE}</style>`);
  return { src: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`, width, height };
}

const font = (file: string) => readFileSync(new URL(`../../node_modules/@fontsource/${file}`, import.meta.url));
const bricolage = (weight: number) => font(`bricolage-grotesque/files/bricolage-grotesque-latin-${weight}-normal.woff`);

/** Satori's faces: it reads WOFF and turns the card's text into paths. */
const FONTS = [
  { name: 'Bricolage Grotesque', weight: 500, data: bricolage(500) },
  { name: 'Bricolage Grotesque', weight: 600, data: bricolage(600) },
  { name: 'Newsreader', weight: 400, data: font('newsreader/files/newsreader-latin-400-normal.woff') },
  { name: 'Newsreader', weight: 600, data: font('newsreader/files/newsreader-latin-600-normal.woff') },
].map(({ name, weight, data }) => ({
  name,
  weight: weight as 400 | 500 | 600,
  style: 'normal' as const,
  data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
}));

/**
 * A WOFF file as the plain TrueType font inside it: resvg, which draws the text of
 * a drawing's labels, reads only TrueType and OpenType files.
 */
function sfnt(woff: Buffer): Buffer {
  const count = woff.readUInt16BE(12);
  const tables = Array.from({ length: count }, (_, i) => {
    const at = 44 + i * 20;
    const [offset, compressed, size] = [woff.readUInt32BE(at + 4), woff.readUInt32BE(at + 8), woff.readUInt32BE(at + 12)];
    const raw = woff.subarray(offset, offset + compressed);
    return { tag: woff.subarray(at, at + 4), checksum: woff.readUInt32BE(at + 16), data: compressed < size ? inflateSync(raw) : raw };
  });
  const header = Buffer.alloc(12 + count * 16);
  const log = Math.floor(Math.log2(count));
  header.writeUInt32BE(woff.readUInt32BE(4), 0);
  header.writeUInt16BE(count, 4);
  header.writeUInt16BE(16 * 2 ** log, 6);
  header.writeUInt16BE(log, 8);
  header.writeUInt16BE(count * 16 - 16 * 2 ** log, 10);
  const body: Buffer[] = [];
  let offset = header.length;
  tables.forEach(({ tag, checksum, data }, i) => {
    tag.copy(header, 12 + i * 16);
    header.writeUInt32BE(checksum, 16 + i * 16);
    header.writeUInt32BE(offset, 20 + i * 16);
    header.writeUInt32BE(data.length, 24 + i * 16);
    const padded = Buffer.alloc(Math.ceil(data.length / 4) * 4);
    data.copy(padded);
    body.push(padded);
    offset += padded.length;
  });
  return Buffer.concat([header, ...body]);
}

const DRAWING_FONTS = (() => {
  const dir = fileURLToPath(new URL('../node_modules/.cache/share-fonts/', import.meta.url));
  mkdirSync(dir, { recursive: true });
  return [500, 600, 700].map((weight) => {
    const file = join(dir, `bricolage-${weight}.ttf`);
    writeFileSync(file, sfnt(bricolage(weight)));
    return file;
  });
})();

/** The R2-02 badge (`components/Brand.tsx`), as an image Satori can place. */
const BADGE = `data:image/svg+xml;base64,${Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="4 4 120 120" width="52" height="52">' +
    '<rect x="4" y="4" width="120" height="120" rx="30" fill="#9061f0"/>' +
    '<rect x="30" y="30" width="68" height="13" rx="6.5" fill="#faf9f5"/>' +
    '<rect x="30" y="52" width="50" height="13" rx="6.5" fill="#faf9f5"/>' +
    '<path d="M35 87 Q45 73 55 87 Q65 101 75 87 Q85 73 95 87" fill="none" stroke="#faf9f5" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>',
).toString('base64')}`;

/**
 * A translucent tint as the opaque colour it makes on `base`: side by side, two
 * boxes Satori rounded to the same pixel would otherwise show a darker seam.
 */
function solid(rgba: string, base: string): string {
  const [r, g, b, alpha] = rgba.match(/[\d.]+/g)!.map(Number);
  const under = [1, 3, 5].map((at) => parseInt(base.slice(at, at + 2), 16));
  return `#${[r, g, b].map((value, index) => Math.round(under[index] + (value - under[index]) * alpha).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * A name marked as the example article marks a passage (`.hero-hl` in `index.css`):
 * the tint behind each line of it, the severity's underline under it. Satori draws
 * no inline box per line, so each word carries its own, half a space wide on each
 * side: side by side they read as one mark per line.
 */
function Marked({ text, size }: { text: string; size: number }) {
  const { color: underline } = SEVERITY_COLORS.warning;
  const tint = solid(SEVERITY_COLORS.warning.tint, color('background'));
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', margin: '0 -0.13em', rowGap: 10, fontSize: size, lineHeight: 1.1, letterSpacing: -size * 0.025 }}>
      {text.split(' ').map((word, index) => (
        <div key={index} style={{ display: 'flex', whiteSpace: 'nowrap', background: tint, padding: '0 0.13em 0.04em', borderBottom: `4px solid ${underline}` }}>
          {word}
        </div>
      ))}
    </div>
  );
}

function Card({ card }: { card: ShareCard }) {
  const figure = card.figure ? drawing(FIGURES[card.figure](), 470) : undefined;
  const textWidth = figure ? 600 : 1056;
  const titleSize = card.mark ? (card.title.length > 24 ? 76 : 92) : card.title.length > 44 ? 58 : 66;
  return (
    <div
      style={{
        width: SHARE_WIDTH,
        height: SHARE_HEIGHT,
        display: 'flex',
        position: 'relative',
        background: color('background'),
        color: color('foreground'),
        fontFamily: 'Bricolage Grotesque',
        padding: '64px 72px 56px',
      }}
    >
      {figure ? (
        <img
          src={figure.src}
          width={figure.width}
          height={figure.height}
          style={{ position: 'absolute', right: 56, top: (SHARE_HEIGHT - figure.height) / 2 - 10 }}
        />
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column', width: textWidth, height: '100%' }}>
        <div style={{ display: 'flex', fontSize: 28, fontWeight: 500, color: color('accentInk') }}>{card.kicker}</div>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 28, fontWeight: 600 }}>
          {card.mark ? (
            <Marked text={card.title} size={titleSize} />
          ) : (
            <div style={{ display: 'flex', fontSize: titleSize, lineHeight: 1.06, letterSpacing: -titleSize * 0.025 }}>
              {card.title}
            </div>
          )}
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 30,
            fontFamily: 'Newsreader',
            fontSize: card.mark ? 40 : 34,
            lineHeight: 1.3,
            color: color('foreground'),
            opacity: 0.86,
          }}
        >
          {card.text}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 'auto', gap: 14 }}>
          <img src={BADGE} width={52} height={52} />
          <div style={{ display: 'flex', fontSize: 34, fontWeight: 600, letterSpacing: -0.6 }}>squiggle</div>
          <div style={{ display: 'flex', fontSize: 26, fontWeight: 500, color: color('muted'), marginLeft: 18 }}>
            squiggle.fr
          </div>
        </div>
      </div>
    </div>
  );
}

/** The page's card as a PNG. */
export async function shareImage(page: PublicPage): Promise<Buffer> {
  if (!page.share) throw new Error(`${page.path} has no share card`);
  const svg = await satori(<Card card={page.share} />, {
    width: SHARE_WIDTH,
    height: SHARE_HEIGHT,
    fonts: FONTS,
  });
  return png(svg, SHARE_WIDTH);
}

function png(svg: string, width: number): Buffer {
  return new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: { fontFiles: DRAWING_FONTS, loadSystemFonts: false, defaultFontFamily: 'Bricolage Grotesque' },
  })
    .render()
    .asPng();
}

/*
 * The social carousels: one per glossary notion and per published article, as
 * 1080 x 1350 slides (4:5, the tallest a feed shows whole), written by the build
 * under `/og/social/<slug>/`. Every word on them is the glossary's or the
 * article's own; no model draws or writes any of it.
 */

export const SLIDE_WIDTH = 1080;
export const SLIDE_HEIGHT = 1350;

/** A glossary notion or a published article: what a carousel is made from. */
export type SocialSource = Notion | Article;

/** Every carousel the build draws. */
export const SOCIAL_SOURCES: readonly SocialSource[] = [...NOTIONS, ...PUBLISHED];

/** Where the build writes a carousel: `/og/social/faux-dilemme/1.png` and on. */
export const socialPath = (source: SocialSource) => `/og/social/${source.slug}`;

export interface SocialSlide {
  /** The image's alternative text, from the same fields as its words. */
  alt: string;
  png: Buffer;
}

const PAGE_MARGIN = 72;
/** The four captions sit in this band; the slide's own content stays inside it. */
const CAPTION_BAND = 128;
const PASSAGE = SEVERITY_COLORS.warning;

type Run = { text: string; marked: boolean; joined?: boolean };

/** Segments (`Notion['exemple']`) as words, each one a list of runs, the passage's runs marked. */
function words(segments: Segments): Run[][] {
  const out: Run[][] = [[]];
  for (const segment of segments) {
    const marked = typeof segment !== 'string';
    typo(marked ? segment[0] : segment)
      .split(' ')
      .forEach((part, index) => {
        if (index > 0) out.push([]);
        // Satori draws a no-break space as nothing: the word keeps its two halves, a space apart.
        part.split('\u00a0').forEach((piece, at) => {
          if (piece) out.at(-1)!.push({ text: piece, marked, joined: at > 0 });
        });
      });
  }
  return out.filter((word) => word.length > 0);
}

/**
 * A run of text laid out one word to a box. Satori reports each box it places, so
 * a word that leaves its column or runs into another one is found by the layout,
 * not by looking at the image (`misfit`). Half a space on each side of a word
 * makes the space between two, so a marked passage reads as one mark per line.
 */
function Words({ segments, style }: { segments: Segments | string; style: CSSProperties }) {
  const list = words(typeof segments === 'string' ? [segments] : segments);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', margin: '0 -0.13em', flexShrink: 0, ...style }}>
      {list.map((word, index) => (
        <div key={index} style={{ display: 'flex' }}>
          {word.map((run, at) => (
            <div
              key={at}
              style={{
                display: 'flex',
                whiteSpace: 'nowrap',
                paddingLeft: at === 0 ? '0.13em' : run.joined ? '0.26em' : 0,
                paddingRight: at === word.length - 1 ? '0.13em' : 0,
                // The passage, as the glossary page marks it on its paper (`.hero-hl`).
                ...(run.marked ? { background: solid(PASSAGE.tint, color('paper')), borderBottom: `3px solid ${PASSAGE.color}` } : {}),
              }}
            >
              {run.text}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

type Rect = { left: number; top: number; width: number; height: number };

/** A layout and every box Satori placed in it. */
async function layout(element: ReactElement, size: { width: number; height?: number }) {
  const nodes: SatoriNode[] = [];
  const svg = await satori(element, { ...size, fonts: FONTS, onNodeDetected: (node) => nodes.push(node) });
  return { svg, nodes };
}

/**
 * What is wrong with a layout, if anything: a word or a drawing outside `area`, or
 * two of them on top of each other. Satori neither clips nor shrinks a word that
 * does not fit; it only pushes it out of its column or under the next block.
 */
function misfit(nodes: SatoriNode[], area: Rect): string | null {
  const placed = nodes.filter((node) => node.type === 'img' || (node.textContent ?? '').trim() !== '');
  const name = (node: SatoriNode) => (node.type === 'img' ? 'a drawing' : `« ${node.textContent} »`);
  // A caption sits outside the content area, in the band it shares with nothing else.
  for (const node of placed.filter((item) => !('data-caption' in item.props))) {
    if (
      node.left < area.left - 0.5 ||
      node.top < area.top - 0.5 ||
      node.left + node.width > area.left + area.width + 0.5 ||
      node.top + node.height > area.top + area.height + 0.5
    ) {
      return `${name(node)} leaves its area`;
    }
  }
  for (const [index, a] of placed.entries()) {
    for (const b of placed.slice(index + 1)) {
      const x = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
      const y = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
      // Satori rounds each box to the pixel: two words side by side may share one.
      if (x > 2 && y > 2) return `${name(a)} runs into ${name(b)}`;
    }
  }
  return null;
}

/**
 * The made-up article on its paper, flat and facing the reader, as the glossary
 * page shows it (`ExempleFigure`): a text meant to be read is never put in
 * perspective. With `glass`, Squiggle's violet pane lies over it.
 */
function Paper({ children, glass = false, top }: { children: ReactNode; glass?: boolean; top: number }) {
  return (
    <div style={{ display: 'flex', position: 'relative', flexShrink: 0, marginTop: top }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          padding: '40px 52px 48px',
          borderRadius: 20,
          borderBottom: `8px solid ${color('paperEdge')}`,
          background: color('paper'),
          color: color('paperInk'),
          fontFamily: 'Newsreader',
        }}
      >
        {children}
      </div>
      {glass ? (
        <div
          style={{
            position: 'absolute',
            left: -16,
            top: -16,
            right: -16,
            bottom: -16,
            borderRadius: 30,
            border: `3px solid ${color('accent')}`,
            background: 'rgba(144, 97, 240, 0.12)',
          }}
        />
      ) : null}
    </div>
  );
}

/** The line above the article's title, as the glossary page writes it. */
function Rubrique({ exemple, scale }: { exemple: Notion['exemple']; scale: number }) {
  return (
    <Words
      segments={`${exemple.rubrique}, un article inventé`}
      style={{ fontFamily: 'Bricolage Grotesque', fontWeight: 500, fontSize: 30 * scale, lineHeight: 1.3, color: color('paperMuted') }}
    />
  );
}


/** What the four corners say, as a caption band in small capitals. */
interface Corners {
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
}

function Caption({ text, at }: { text: string; at: CSSProperties }) {
  return (
    <div
      data-caption=""
      style={{
        position: 'absolute',
        display: 'flex',
        ...at,
        fontSize: 24,
        fontWeight: 500,
        letterSpacing: 2.4,
        textTransform: 'uppercase',
        color: color('muted'),
      }}
    >
      {text}
    </div>
  );
}

function Frame({ corners, children }: { corners: Corners; children: ReactNode }) {
  const edge = PAGE_MARGIN - 8;
  return (
    <div
      style={{
        width: SLIDE_WIDTH,
        height: SLIDE_HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        background: color('background'),
        color: color('foreground'),
        fontFamily: 'Bricolage Grotesque',
        padding: `${CAPTION_BAND}px ${PAGE_MARGIN}px`,
      }}
    >
      <Caption text={corners.topLeft} at={{ top: 52, left: edge }} />
      <Caption text={corners.topRight} at={{ top: 52, right: edge }} />
      <Caption text={corners.bottomLeft} at={{ bottom: 52, left: edge }} />
      <Caption text={corners.bottomRight} at={{ bottom: 52, right: edge }} />
      {children}
    </div>
  );
}

/** A slide's heading: what the slide is, in the site's own words for it. */
function Heading({ text, size }: { text: string; size: number }) {
  return (
    <Words
      segments={text}
      style={{ fontSize: size, fontWeight: 600, lineHeight: 1.12, letterSpacing: -size * 0.02, color: color('accentInk') }}
    />
  );
}

function Figure({ figure, width }: { figure: ReactElement; width: number }) {
  const { src, height } = drawing(figure, Math.round(width));
  return <img src={src} width={Math.round(width)} height={height} style={{ flexShrink: 0, alignSelf: 'center' }} />;
}

/** The R2-02 badge and the address to find the page at, for the last slide. */
function Signature({ address, size }: { address: string; size: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0, marginTop: 'auto', paddingTop: 48, gap: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <img src={BADGE} width={64} height={64} />
        <div style={{ display: 'flex', fontSize: 44, fontWeight: 600, letterSpacing: -0.8 }}>squiggle</div>
      </div>
      <Words segments={address} style={{ fontSize: size, fontWeight: 500, lineHeight: 1.25 }} />
      <Words segments="Lien dans la bio" style={{ fontSize: size * 0.8, fontWeight: 500, lineHeight: 1.25, color: color('muted') }} />
    </div>
  );
}

/** A numbered or marked list: the signs to look for, or the steps of a method. */
function Points({ points, numbered, size, top }: { points: readonly string[]; numbered: boolean; size: number; top: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0, marginTop: top, gap: size * 0.75 }}>
      {points.map((point, index) => (
        <div key={index} style={{ display: 'flex', gap: size * 0.6 }}>
          {numbered ? (
            <div
              style={{
                display: 'flex',
                width: size * 1.3,
                height: size * 1.3,
                flexShrink: 0,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: size,
                background: color('accent'),
                color: color('accentForeground'),
                fontSize: size * 0.72,
                fontWeight: 600,
              }}
            >
              {String(index + 1)}
            </div>
          ) : (
            <img src={MARK} width={size * 1.1} height={size * 0.5} style={{ flexShrink: 0, marginTop: size * 0.5 }} />
          )}
          <Words segments={point} style={{ flex: 1, fontFamily: 'Newsreader', fontSize: size, lineHeight: 1.36 }} />
        </div>
      ))}
    </div>
  );
}

/** The product's mark (`SquiggleMark`), as a list bullet Satori can place. */
const MARK = `data:image/svg+xml;base64,${Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 10"><path d="${squiggle(1, 5, 20, 2.6, 5)}" fill="none" stroke="${color('accent')}" stroke-width="1.9" stroke-linecap="round"/></svg>`,
).toString('base64')}`;

/**
 * A slide before its size is settled: drawn with its text at `scale` and its
 * drawing at `figure`, the largest that fits wins.
 */
interface Draft {
  alt: string;
  draw: (scale: number, figure: number) => ReactElement;
  /** Its drawing gives way before its text does. */
  yields?: boolean;
}

const SCALES = [1, 0.96, 0.92, 0.88, 0.84, 0.8, 0.76];
const FIGURE_SCALES = Array.from({ length: 16 }, (_, index) => 1 - index * 0.03);

async function settle(draft: Draft, where: string): Promise<string> {
  // The frame's padding box, give or take the half space each line of words starts with (16 px for the cover's name).
  const side = PAGE_MARGIN - 20;
  const area = { left: side, top: CAPTION_BAND, width: SLIDE_WIDTH - 2 * side, height: SLIDE_HEIGHT - 2 * CAPTION_BAND };
  const attempt = async (scale: number, figure: number) => {
    const { svg, nodes } = await layout(draft.draw(scale, figure), { width: SLIDE_WIDTH, height: SLIDE_HEIGHT });
    return { svg, problem: misfit(nodes, area) };
  };
  let problem = '';
  for (const scale of SCALES) {
    if (!draft.yields) {
      const fitted = await attempt(scale, scale);
      if (!fitted.problem) return fitted.svg;
      problem = fitted.problem;
      continue;
    }
    // The drawing at its smallest first, then the largest that still fits, by halves.
    let best = await attempt(scale, FIGURE_SCALES.at(-1)!);
    if (best.problem) {
      problem = best.problem;
      continue;
    }
    let [low, high] = [FIGURE_SCALES.length - 1, -1];
    while (low - high > 1) {
      const middle = Math.floor((low + high) / 2);
      const fitted = await attempt(scale, FIGURE_SCALES[middle]);
      if (fitted.problem) high = middle;
      else [low, best] = [middle, fitted];
    }
    return best.svg;
  }
  throw new Error(`${where} does not fit at any size a phone can read: ${problem}`);
}

const plain = (segments: Segments) => segments.map((part) => (typeof part === 'string' ? part : part[0])).join('');
/** A title as a sentence of the alternative text: `Faut-il acheter de l’or ?` keeps its own ending. */
const ended = (text: string) => (/[.?!…»]$/.test(text) ? text : `${text}.`);
const exampleAlt = (exemple: Notion['exemple']) =>
  `${exemple.rubrique}, un article inventé. ${ended(plain(exemple.titre))} ${plain(exemple.texte)}`;

/** The made-up article a carousel is drawn around: an article's first one. */
function exampleOf(source: SocialSource): Notion['exemple'] {
  if ('nom' in source) return source.exemple;
  const bloc = source.corps.find((item) => 'exemple' in item);
  if (!bloc || !('exemple' in bloc)) throw new Error(`${source.slug} has no example to draw a carousel around`);
  return bloc.exemple;
}

/** The passage the example marks, from its title, its text, or both. */
const passages = (exemple: Notion['exemple']): Segments[] =>
  [exemple.titre, exemple.texte].flatMap((segments) =>
    segments.flatMap((part, index): Segments[] => {
      if (typeof part === 'string') return [];
      const [before, after] = [segments[index - 1], segments[index + 1]];
      // Cut out of its sentence, an excerpt says so: « … veulent tout simplement chasser les voitures … ».
      const opens = typeof before !== 'string' || /[.?!:«»]\s*$/.test(before);
      const closes = typeof after !== 'string' || /^\s*[.?!…»]/.test(after) || /[.?!…»]$/.test(part[0]);
      return [[opens ? '' : '… ', part, closes ? '' : ' …']];
    }),
  );

/** The two slides about the example: the article on its paper, then the glass on its passage and what is wrong. */
function exampleDrafts(exemple: Notion['exemple'], corners: (index: number) => Corners): Draft[] {
  const titled = exemple.titre.some((part) => typeof part !== 'string');
  return [
    {
      alt: exampleAlt(exemple),
      draw: (scale) => (
        <Frame corners={corners(1)}>
          <Heading text="Sur un article d’exemple" size={64 * scale} />
          <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center', paddingBottom: 40 }}>
            <Paper top={40 * scale}>
              <Rubrique exemple={exemple} scale={scale} />
              <Words
                segments={exemple.titre}
                style={{ marginTop: 14 * scale, fontWeight: 600, fontSize: 70 * scale, lineHeight: 1.14, rowGap: 6, letterSpacing: -0.8 }}
              />
              <Words segments={exemple.texte} style={{ marginTop: 26 * scale, fontSize: 58 * scale, lineHeight: 1.42 }} />
            </Paper>
          </div>
        </Frame>
      ),
    },
    {
      alt: `Ce qui cloche. ${passages(exemple).map((passage) => `« ${plain(passage)} »`).join(' ')} ${exemple.lecture}`,
      draw: (scale) => (
        <Frame corners={corners(2)}>
          <Heading text="Ce qui cloche" size={64 * scale} />
          <Paper glass top={60 * scale}>
            <Rubrique exemple={exemple} scale={scale} />
            {passages(exemple).map((passage, index) => (
              <Words
                key={index}
                segments={passage}
                style={{
                  marginTop: 14 * scale,
                  fontSize: (index === 0 && titled ? 56 : 50) * scale,
                  fontWeight: index === 0 && titled ? 600 : 400,
                  lineHeight: 1.4,
                }}
              />
            ))}
          </Paper>
          <Words
            segments={exemple.lecture}
            style={{ marginTop: 64 * scale, fontFamily: 'Newsreader', fontSize: 50 * scale, lineHeight: 1.36 }}
          />
        </Frame>
      ),
    },
  ];
}

/**
 * The cover: a surtitle, the title, and the site's drawing of the article under
 * Squiggle's glass, its lines drawn, not written. A cover that needs room takes
 * it from the drawing first, then from its title.
 */
function coverDraft({ alt, kicker, title, corners }: { alt: string; kicker: string; title: (scale: number) => ReactNode; corners: Corners }): Draft {
  return {
    alt,
    yields: true,
    draw: (scale, figure) => (
      <Frame corners={corners}>
        <Words segments={kicker} style={{ fontSize: 40 * scale, fontWeight: 500, lineHeight: 1.2, color: color('accentInk') }} />
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 34 * scale, flexShrink: 0 }}>{title(scale)}</div>
        <div style={{ display: 'flex', marginTop: 'auto', paddingTop: 40, justifyContent: 'center' }}>
          <Figure figure={<HeroFigure pins={false} />} width={900 * figure} />
        </div>
      </Frame>
    ),
  };
}

/** A notion's carousel: its name, its example, what is wrong with it, how to spot it, and a question for any reader to try. */
function notionDrafts(item: Notion): Draft[] {
  const number = `Fiche ${String(NOTIONS.indexOf(item) + 1).padStart(2, '0')}`;
  const family = famille(item.famille).titre;
  const address = `squiggle.fr/glossaire/${item.slug}`;
  const corners = (index: number): Corners => ({
    topLeft: number,
    topRight: index === 0 ? 'Glossaire de l’esprit critique' : family,
    // The last slide signs with the address itself.
    bottomLeft: index === 4 ? '' : address,
    bottomRight: `${index + 1}/5`,
  });
  return [
    coverDraft({
      alt: `${ended(item.nom)} ${family}. Glossaire de l’esprit critique de Squiggle.`,
      kicker: family,
      title: (scale) => <Marked text={item.nom} size={Math.round(124 * scale)} />,
      corners: corners(0),
    }),
    ...exampleDrafts(item.exemple, corners),
    {
      alt: `Comment le repérer. ${item.reperer.join(' ')}`,
      draw: (scale) => (
        <Frame corners={corners(3)}>
          <Heading text="Comment le repérer" size={64 * scale} />
          <Points points={item.reperer} numbered={false} size={60 * scale} top={64 * scale} />
        </Frame>
      ),
    },
    {
      alt: `À vous de jouer. ${item.question} ${address}`,
      draw: (scale) => (
        <Frame corners={corners(4)}>
          {/* The glossary's question is asked of any reader: the classroom is one audience among others. */}
          <Heading text="À vous de jouer" size={64 * scale} />
          <Words
            segments={item.question}
            style={{ marginTop: 52 * scale, fontFamily: 'Newsreader', fontSize: 76 * scale, lineHeight: 1.22 }}
          />
          <Signature address={address} size={40 * scale} />
        </Frame>
      ),
    },
  ];
}

const text = (run: Texte) => (typeof run === 'string' ? run : run.map((part) => (typeof part === 'string' ? part : part.texte)).join(''));

/** An article's carousel: its title, its example and what is wrong with it, then each of its lists of steps. */
function articleDrafts(item: Article): Draft[] {
  const steps = item.corps.flatMap((bloc, index) => {
    if (!('etapes' in bloc)) return [];
    const heading = item.corps
      .slice(0, index)
      .reverse()
      .find((before) => 'intertitre' in before) as { intertitre: string };
    return [{ heading: heading.intertitre, points: bloc.etapes.map(text) }];
  });
  const total = 3 + steps.length;
  const address = `squiggle.fr/blog/${item.slug}`;
  const corners = (index: number): Corners => ({
    topLeft: 'Blog',
    topRight: dateLongue(item.publie),
    bottomLeft: index === total - 1 ? '' : address,
    bottomRight: `${index + 1}/${total}`,
  });
  const title = (scale: number) => (
    <Words segments={item.titre} style={{ fontSize: 84 * scale, fontWeight: 600, lineHeight: 1.06, letterSpacing: -2.1 * scale }} />
  );
  return [
    coverDraft({ alt: `${ended(item.titre)} Le blog de Squiggle.`, kicker: 'Une méthode de lecture', title, corners: corners(0) }),
    ...exampleDrafts(exampleOf(item), corners),
    ...steps.map(
      ({ heading, points }, index): Draft => ({
        alt: `${ended(heading)} ${points.map((point, at) => `${at + 1}. ${point}`).join(' ')}${index === steps.length - 1 ? ` ${address}` : ''}`,
        draw: (scale) => (
          <Frame corners={corners(3 + index)}>
            <Heading text={heading} size={64 * scale} />
            <Points points={points} numbered size={60 * scale} top={64 * scale} />
            {index === steps.length - 1 ? <Signature address={address} size={40 * scale} /> : null}
          </Frame>
        ),
      }),
    ),
  ];
}

/** A notion's or an article's carousel, every slide at the largest size its text fits. */
export async function socialSlides(source: SocialSource): Promise<SocialSlide[]> {
  const drafts = 'nom' in source ? notionDrafts(source) : articleDrafts(source);
  return Promise.all(
    drafts.map(async (draft, index) => ({
      alt: draft.alt,
      png: png(await settle(draft, `${socialPath(source)}/${index + 1}.png`), SLIDE_WIDTH),
    })),
  );
}
