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
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import satori from 'satori';

import { ClassFigure, GuideFigure, StepFigure } from './components/Iso';
import { SEVERITY_COLORS } from './demo';
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
] as const;

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
 * A name marked as the example article marks a passage (`.hero-hl` in `index.css`):
 * the tint behind each line of it, the severity's underline under it. Satori draws
 * no inline box per line, so each word carries its own, half a space wide on each
 * side: side by side they read as one mark per line.
 */
function Marked({ text, size }: { text: string; size: number }) {
  const { tint, color: underline } = SEVERITY_COLORS.warning;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', margin: '0 -0.13em', rowGap: 10, fontSize: size, lineHeight: 1.1, letterSpacing: -size * 0.025 }}>
      {text.split(' ').map((word, index) => (
        <div key={index} style={{ display: 'flex', background: tint, padding: '0 0.13em 0.04em', borderBottom: `4px solid ${underline}` }}>
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
    fonts: FONTS.map(({ name, weight, data }) => ({
      name,
      weight,
      style: 'normal' as const,
      data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
    })),
  });
  return new Resvg(svg, {
    fitTo: { mode: 'width', value: SHARE_WIDTH },
    font: { fontFiles: DRAWING_FONTS, loadSystemFonts: false, defaultFontFamily: 'Bricolage Grotesque' },
  })
    .render()
    .asPng();
}
