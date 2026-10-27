/**
 * Reading a YouTube video as a text, in the reader's own tab.
 *
 * The server never fetches a video or its captions: since April 2026 YouTube
 * answers a caption request that does not carry the token its own player
 * generates with an empty body, and we never generate that token. What the
 * extension reads is the caption file the player itself loads, for this
 * reader, when captions are switched on. The steps, all in the page and only
 * on the reader's click:
 *
 * 1. captions are switched on through the player's own API, so the player
 *    fetches the file with its token, and switched back off straight after;
 * 2. the extension reads that same file again, whole, with every cue's time;
 * 3. only if the video never started (a tab opened in the background) does
 *    the player need to run, so it plays muted for the moment the file takes
 *    to arrive, then is paused back where it was.
 *
 * Nothing is downloaded but the text, nothing is kept beyond the analysis, and
 * no YouTube API is called: the player's own methods are the page's, used as
 * the reader's own click on "subtitles" would.
 */
import type { Finding, TextBlock } from '@squiggle/shared';

export interface CaptionCue {
  /** Seconds from the start of the video. */
  start: number;
  text: string;
}

interface VideoMeta {
  title: string;
  author: string;
  lengthSeconds: number;
}

export type CaptionCapture =
  | ({ kind: 'ok'; cues: CaptionCue[]; lang: string; automatic: boolean } & VideoMeta)
  /** The page holds no player for this video yet (still loading). */
  | { kind: 'not_ready' }
  /** YouTube offers no captions for this video. */
  | ({ kind: 'no_captions' } & VideoMeta)
  /** A live broadcast: its captions are a stream, not a file. */
  | ({ kind: 'live' } & VideoMeta)
  /** An ad is playing: the player loads the video's captions only once it ends. */
  | ({ kind: 'ad' } & VideoMeta)
  /** The video never started, and starting it muted was not allowed on this call. */
  | ({ kind: 'needs_start' } & VideoMeta)
  /** Captions exist but the player loaded none we could read. */
  | ({ kind: 'unreadable' } & VideoMeta);

/**
 * Runs in the page's world (`UnifiedRuntime.runInPage`), so it is serialised:
 * it may use nothing but its arguments and the page's globals.
 */
export async function captureYoutubeCaptions(
  videoId: string,
  allowMutedStart: boolean
): Promise<CaptionCapture> {
  interface Player extends HTMLElement {
    getPlayerResponse?: () => {
      videoDetails?: { videoId?: string; title?: string; author?: string; lengthSeconds?: string; isLive?: boolean };
      captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: unknown[] } };
    };
    isSubtitlesOn(): boolean;
    toggleSubtitles(): void;
    toggleSubtitlesOn(): void;
    getPlayerState(): number;
    getCurrentTime(): number;
    isMuted(): boolean;
    mute(): void;
    unMute(): void;
    playVideo(): void;
    pauseVideo(): void;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
  }
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // The watch page and the Shorts feed each have their own player; the right
  // one is the one showing this video, and on a page still loading, neither.
  const findPlayer = (): Player | null =>
    Array.from(document.querySelectorAll<Player>('#movie_player, #shorts-player')).find(
      (el) => el.getPlayerResponse?.()?.videoDetails?.videoId === videoId
    ) ?? null;
  let player = findPlayer();
  for (let i = 0; i < 20 && !player; i += 1) {
    await sleep(250);
    player = findPlayer();
  }
  if (!player) return { kind: 'not_ready' };
  const response = player.getPlayerResponse!()!;
  const details = response.videoDetails ?? {};
  const meta = {
    title: details.title ?? '',
    author: details.author ?? '',
    lengthSeconds: Number(details.lengthSeconds) || 0,
  };
  if (details.isLive) return { kind: 'live', ...meta };
  const tracks = response.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  if (tracks.length === 0) return { kind: 'no_captions', ...meta };

  // A muted start spans several calls when an ad runs first, so what to put
  // back (the sound, the position) is kept on the player itself.
  const MARK = 'squiggleMutedStart';
  const startMuted = (at: number) => {
    if (!player.dataset[MARK]) player.dataset[MARK] = JSON.stringify({ muted: player.isMuted(), at });
    player.mute();
    player.playVideo();
  };
  const putBack = () => {
    const mark = player.dataset[MARK];
    if (!mark) return;
    delete player.dataset[MARK];
    const { muted, at } = JSON.parse(mark) as { muted: boolean; at: number };
    player.pauseVideo();
    player.seekTo(at, true);
    if (!muted) player.unMute();
  };

  if (player.classList.contains('ad-showing')) {
    // An ad that is not playing never ends: the browser blocked the autoplay
    // of a page nobody clicked on. It plays muted, and the video it leads to
    // is paused back at its start once the captions are read. The player's
    // own state is the video's, not the ad's, so the media element says
    // whether the ad runs. A running ad is left alone: skipping it is the
    // reader's choice, never ours.
    if (player.querySelector('video')?.paused !== false) {
      if (!allowMutedStart) return { kind: 'needs_start', ...meta };
      startMuted(0);
    }
    return { kind: 'ad', ...meta };
  }

  // The file the player fetched for THIS video, token included: an ad's
  // captions, or a previous video's, have another `v=`.
  const isCaptionFile = (name: string) =>
    name.includes('/api/timedtext') && name.includes(`v=${videoId}`) && name.includes('pot=');
  let fileUrl: string | null =
    performance.getEntriesByType('resource').map((e) => e.name).find(isCaptionFile) ?? null;

  if (!fileUrl) {
    // An observer sees the request even once the page's timing buffer is full,
    // which on a long YouTube session it always is.
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (!fileUrl && isCaptionFile(entry.name)) fileUrl = entry.name;
    });
    observer.observe({ type: 'resource' });
    const waitForFile = async (ms: number) => {
      const until = Date.now() + ms;
      while (!fileUrl && Date.now() < until) await sleep(100);
    };
    const wasOn = player.isSubtitlesOn();
    try {
      // Already on means the file was fetched before our buffer could see it:
      // off and on again makes the player fetch it once more.
      if (wasOn) {
        player.toggleSubtitles();
        await sleep(100);
      }
      player.toggleSubtitlesOn();
      await waitForFile(4000);
      // On a page still settling, the first switch can come before the player
      // is ready to honour it; a second off-and-on does.
      if (!fileUrl && player.getPlayerState() !== -1 && player.getPlayerState() !== 5) {
        player.toggleSubtitles();
        await sleep(300);
        player.toggleSubtitlesOn();
        await waitForFile(6000);
      }
      const state = player.getPlayerState();
      if (!fileUrl && (state === -1 || state === 5)) {
        if (!allowMutedStart) return { kind: 'needs_start', ...meta };
        startMuted(player.getCurrentTime());
        await waitForFile(8000);
        // The start brought an ad instead: the next call waits it out.
        if (!fileUrl && player.classList.contains('ad-showing')) return { kind: 'ad', ...meta };
      }
    } finally {
      observer.disconnect();
      if (!wasOn && player.isSubtitlesOn()) player.toggleSubtitles();
    }
  }
  putBack();
  if (!fileUrl) return { kind: 'unreadable', ...meta };

  const url = new URL(fileUrl);
  url.searchParams.set('fmt', 'json3');
  let body = '';
  try {
    const res = await fetch(url.toString(), { credentials: 'include' });
    body = res.ok ? await res.text() : '';
  } catch {
    body = '';
  }
  if (!body) return { kind: 'unreadable', ...meta };
  let events: Array<{ tStartMs?: number; segs?: Array<{ utf8?: string }> }> = [];
  try {
    events = (JSON.parse(body) as { events?: typeof events }).events ?? [];
  } catch {
    return { kind: 'unreadable', ...meta };
  }
  const cues: CaptionCue[] = [];
  for (const event of events) {
    if (!event.segs) continue;
    const text = event.segs.map((s) => s.utf8 ?? '').join('').replace(/\s+/g, ' ').trim();
    if (text) cues.push({ start: (event.tStartMs ?? 0) / 1000, text });
  }
  if (cues.length === 0) return { kind: 'unreadable', ...meta };
  return {
    kind: 'ok',
    cues,
    lang: url.searchParams.get('lang') ?? '',
    automatic: url.searchParams.get('kind') === 'asr',
    ...meta,
  };
}

/** Seeks the page's player to a passage and plays it, as a timestamp link on YouTube does. */
export function seekYoutubePlayer(videoId: string, seconds: number): boolean {
  interface Player extends HTMLElement {
    getVideoData?: () => { video_id?: string };
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    playVideo(): void;
  }
  for (const el of Array.from(document.querySelectorAll<Player>('#movie_player, #shorts-player'))) {
    if (el.getVideoData?.()?.video_id !== videoId) continue;
    el.seekTo(seconds, true);
    el.playVideo();
    return true;
  }
  return false;
}

/** What a video's report carries beside the findings, for the panel. */
export interface VideoReport {
  videoId: string;
  /** The captions were YouTube's automatic ones, not the channel's own. */
  automatic: boolean;
  /** Second of the video each finding's quote is said at, by finding id. */
  times: Record<string, number>;
}

/** A block of the transcript, with where each of its cues starts inside its text. */
export interface TranscriptBlock extends TextBlock {
  start: number;
  cues: Array<{ offset: number; start: number }>;
}

/**
 * A block closes on the first sentence end past this many characters, so a
 * finding's block is a passage of a few sentences, not one caption line nor a
 * whole chapter, and its time sends the reader close to the quote.
 */
const BLOCK_TARGET_CHARS = 500;
/** A transcript without punctuation (older automatic captions) still gets blocks. */
const BLOCK_MAX_CHARS = 900;

/** Groups caption cues into the paragraphs the analysis reads. */
export function cuesToBlocks(cues: CaptionCue[]): TranscriptBlock[] {
  const blocks: TranscriptBlock[] = [];
  let current: TranscriptBlock | null = null;
  let charStart = 0;
  for (const cue of cues) {
    if (!current) {
      current = { id: `v${blocks.length + 1}`, type: 'paragraph', text: '', charStart, start: cue.start, cues: [] };
    }
    if (current.text) current.text += ' ';
    current.cues.push({ offset: current.text.length, start: cue.start });
    current.text += cue.text;
    const sentenceEnd = /[.!?…»"]$/.test(cue.text);
    if ((current.text.length >= BLOCK_TARGET_CHARS && sentenceEnd) || current.text.length >= BLOCK_MAX_CHARS) {
      blocks.push(current);
      charStart += current.text.length + 2;
      current = null;
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/**
 * Where in the video each finding's quote is said: the cue its quote starts
 * in, or the start of its block when the quote cannot be found word for word.
 */
export function findingTimes(findings: Finding[], blocks: TranscriptBlock[]): Record<string, number> {
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const times: Record<string, number> = {};
  for (const finding of findings) {
    const block = byId.get(finding.blockId);
    if (!block) continue;
    let time = block.start;
    const at = block.text.indexOf(finding.quote);
    if (at >= 0) {
      for (const cue of block.cues) if (cue.offset <= at) time = cue.start;
    } else {
      // A quote the model retyped (other apostrophes, case, punctuation) is
      // looked for in a folded copy, built cue by cue so each cue's place in
      // it is known exactly.
      const head = fold(finding.quote).split(' ').slice(0, 6).join(' ');
      let folded = '';
      const starts: Array<{ offset: number; start: number }> = [];
      block.cues.forEach((cue, i) => {
        const end = block.cues[i + 1]?.offset ?? block.text.length;
        if (folded) folded += ' ';
        starts.push({ offset: folded.length, start: cue.start });
        folded += fold(block.text.slice(cue.offset, end));
      });
      const foldedAt = head ? folded.indexOf(head) : -1;
      if (foldedAt >= 0) for (const cue of starts) if (cue.offset <= foldedAt) time = cue.start;
    }
    times[finding.id] = Math.floor(time);
  }
  return times;
}

/** "1:05", "1:02:05": the way YouTube itself writes a time. */
export function formatVideoTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
