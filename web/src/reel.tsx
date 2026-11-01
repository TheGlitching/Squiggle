/**
 * The short video of a glossary notion: 9:16, 11 to 14 seconds, silent, every
 * word on screen. The made-up article appears on its paper and stays long enough
 * to be read; the passage is marked, word after word; Squiggle's violet pane
 * comes down onto it, and the paper rises to leave room for the answer: the
 * notion's name and its one-sentence summary. It is the carousel's story told in
 * time, the order the inoculation studies show a technique in (a weakened
 * example, then its name).
 *
 * Each frame is laid out by Satori and rasterised by resvg with the carousels'
 * own pieces (`src/share.tsx`), so the video has their fonts, colours and
 * overflow check, and no browser, no model and no generated image is involved.
 * `web/reels.mjs` encodes the frames with ffmpeg, once per notion; the build
 * publishes a video only while the glossary still says what it shows
 * (`reelSource`).
 */
import { createHash } from 'node:crypto';

import type { ReactElement } from 'react';

import { typo, type Notion } from './glossaire';
import { BADGE, Heading, Marked, Paper, Words, color, layout, misfit, pixels, type Rect } from './share';

export const REEL_WIDTH = 1080;
export const REEL_HEIGHT = 1920;
export const REEL_FPS = 30;

/** Instagram lays its bar over the top of a Reel, its caption and buttons over the bottom: nothing is drawn there. */
const TOP = 250;
const BOTTOM = 440;
const SIDE = 96;

/** Where a notion's video is published, beside its carousel: `/og/social/faux-dilemme/video.mp4`. */
export const reelPath = (notion: Notion) => `/og/social/${notion.slug}/video.mp4`;
/** Its last frame, everything shown: the Reel's cover, and what an e-mail or a reviewer sees of it. */
export const posterPath = (notion: Notion) => `/og/social/${notion.slug}/video.jpg`;

const plain = (segments: Notion['exemple']['titre']) => segments.map((part) => (typeof part === 'string' ? part : part[0])).join('');
const ended = (text: string) => (/[.?!…»]$/.test(text) ? text : `${text}.`);

/**
 * What the video shows, as one fingerprint: a video rendered from other words
 * than the glossary's current ones is not published.
 */
export function reelSource(notion: Notion): string {
  const { rubrique, titre, texte } = notion.exemple;
  return createHash('sha256').update(JSON.stringify([notion.slug, notion.nom, notion.resume, rubrique, titre, texte])).digest('hex').slice(0, 16);
}

/** Every word of the video, in order: its alternative text, and what a post's review reads. */
export function reelText(notion: Notion): string {
  const { titre, texte } = notion.exemple;
  return typo(`Où est le piège ? ${ended(plain(titre))} ${plain(texte)} Le piège : ${ended(notion.nom)} ${notion.resume} squiggle.fr/glossaire/${notion.slug}`);
}

/** How far each part has come in, from 0 to 1. */
interface State {
  heading: number;
  paper: number;
  mark: number;
  glass: number;
  /** 1 while the paper waits in the middle of the screen, 0 once it has risen. */
  lift: number;
  answer: number;
  signature: number;
}

/** The moments of the scene, in seconds: reading time follows the length of the text, within bounds a feed keeps watching. */
export function timeline(notion: Notion) {
  const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
  const read = clamp((plain(notion.exemple.titre).length + plain(notion.exemple.texte).length) / 32, 5, 6.5);
  const answer = clamp((notion.nom.length + notion.resume.length) / 24, 3, 4);
  const marked = 1 + read;
  const reveal = marked + 1.2;
  return { read, marked, reveal, end: reveal + 1 + answer };
}

const ease = (value: number) => 1 - (1 - Math.min(1, Math.max(0, value))) ** 3;
/** How far a part has come at `t`, entering between `from` and `from + length`. */
const enter = (t: number, from: number, length: number, curve = ease) => curve((t - from) / length);

function stateAt(t: number, notion: Notion): State {
  const { marked, reveal } = timeline(notion);
  return {
    heading: enter(t, 0, 0.6),
    paper: enter(t, 0.3, 0.7),
    // A pen moves at an even pace.
    mark: enter(t, marked, 1.1, (value) => Math.min(1, Math.max(0, value))),
    glass: enter(t, reveal, 0.6),
    lift: 1 - enter(t, reveal, 0.7),
    answer: enter(t, reveal + 0.4, 0.6),
    signature: enter(t, reveal + 0.8, 0.6),
  };
}

const shown = (amount: number, rise = 24) => ({ opacity: amount, transform: `translateY(${(1 - amount) * rise}px)` });

/** One frame, at a text size of `scale` and with the paper `lift` pixels lower while it waits. */
function Scene({ notion, state, scale, lift }: { notion: Notion; state: State; scale: number; lift: number }): ReactElement {
  const { exemple } = notion;
  return (
    <div
      style={{
        width: REEL_WIDTH,
        height: REEL_HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        background: color('background'),
        color: color('foreground'),
        fontFamily: 'Bricolage Grotesque',
        padding: `${TOP}px ${SIDE}px ${BOTTOM}px`,
      }}
    >
      {/* A margin, not a transform: Satori drops a transform on a box whose children have their own. */}
      <div data-reel="example" style={{ display: 'flex', flexDirection: 'column', flexShrink: 0, marginTop: lift * state.lift }}>
        <div style={{ display: 'flex', ...shown(state.heading) }}>
          <Heading text="Où est le piège ?" size={80 * scale} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', ...shown(state.paper, 60) }}>
          <Paper top={36 * scale} glass={state.glass}>
            <Words segments={exemple.rubrique} mark={false} style={{ fontFamily: 'Bricolage Grotesque', fontSize: 32 * scale, fontWeight: 600, letterSpacing: 2, color: color('paperMuted') }} />
            <Words segments={exemple.titre} mark={state.mark} style={{ marginTop: 14 * scale, fontWeight: 600, fontSize: 64 * scale, lineHeight: 1.14, letterSpacing: -0.6 }} />
            <Words segments={exemple.texte} mark={state.mark} style={{ marginTop: 20 * scale, fontSize: 52 * scale, lineHeight: 1.38 }} />
          </Paper>
        </div>
      </div>
      <div data-reel="answer" style={{ display: 'flex', flexDirection: 'column', flexShrink: 0, marginTop: 56 * scale, gap: 18 * scale, ...shown(state.answer) }}>
        <Words segments="Le piège :" style={{ fontSize: 44 * scale, fontWeight: 500, lineHeight: 1.2, color: color('accentInk') }} />
        <Marked text={notion.nom} size={Math.round(104 * scale)} />
        <Words segments={notion.resume} style={{ marginTop: 8 * scale, fontFamily: 'Newsreader', fontSize: 54 * scale, lineHeight: 1.3 }} />
      </div>
      {/* The address on a line of its own: the longest ones would run into the name beside the badge. */}
      <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0, marginTop: 'auto', paddingTop: 40 * scale, gap: 14, ...shown(state.signature, 0) }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <img src={BADGE} width={56} height={56} />
          <div style={{ display: 'flex', flexShrink: 0, fontSize: 40, fontWeight: 600, letterSpacing: -0.8 }}>squiggle</div>
        </div>
        <Words segments={`squiggle.fr/glossaire/${notion.slug}`} style={{ fontSize: 32, fontWeight: 500, lineHeight: 1.2, color: color('muted') }} />
      </div>
    </div>
  );
}

const SCALES = [1, 0.96, 0.92, 0.88, 0.84, 0.8, 0.76, 0.72];
const FINAL: State = { heading: 1, paper: 1, mark: 1, glass: 1, lift: 0, answer: 1, signature: 1 };

/**
 * The largest text size at which the last frame, everything shown, fits; and how
 * far down the paper waits, so that alone on the screen it sits in the middle.
 */
async function fit(notion: Notion): Promise<{ scale: number; lift: number }> {
  // The frame's padding box, give or take the half space each line of words starts with.
  const area: Rect = { left: SIDE - 20, top: TOP, width: REEL_WIDTH - 2 * (SIDE - 20), height: REEL_HEIGHT - TOP - BOTTOM };
  let problem = '';
  for (const scale of SCALES) {
    const { nodes } = await layout(<Scene notion={notion} state={FINAL} scale={scale} lift={0} />, { width: REEL_WIDTH, height: REEL_HEIGHT });
    problem = misfit(nodes, area) ?? '';
    if (problem) continue;
    const example = nodes.find((node) => node.props['data-reel'] === 'example')!;
    return { scale, lift: Math.max(0, Math.round(area.top + area.height / 2 - (example.top + example.height / 2))) };
  }
  throw new Error(`the video of ${notion.slug} does not fit at any size a phone can read: ${problem}`);
}

export interface Reel {
  seconds: number;
  /** The number of frames, at `REEL_FPS`. */
  count: number;
  /** Each frame's RGBA pixels, in order; a frame equal to the one before is drawn once. */
  frames: () => AsyncGenerator<Buffer>;
}

export async function reel(notion: Notion): Promise<Reel> {
  const { end } = timeline(notion);
  const { scale, lift } = await fit(notion);
  const count = Math.round(end * REEL_FPS);
  return {
    seconds: count / REEL_FPS,
    count,
    async *frames() {
      let last = '';
      let frame: Buffer = Buffer.alloc(0);
      for (let index = 0; index < count; index += 1) {
        const state = stateAt(index / REEL_FPS, notion);
        const key = JSON.stringify(Object.values(state).map((value) => Math.round(value * 1000)));
        if (key !== last) {
          const { svg } = await layout(<Scene notion={notion} state={state} scale={scale} lift={lift} />, { width: REEL_WIDTH, height: REEL_HEIGHT });
          frame = pixels(svg, REEL_WIDTH);
          last = key;
        }
        yield frame;
      }
    },
  };
}
