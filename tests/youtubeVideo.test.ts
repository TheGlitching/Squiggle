import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  buildFourchesCaudinesUserPrompt,
  isVideoTranscriptUrl,
  youtubeVideoId,
  youtubeWatchUrl,
  type Finding,
} from '@squiggle/shared';
import { SecureKeyStorage } from '../src/crypto/storage';
import { BackgroundServiceWorker } from '../src/background';
import {
  captureYoutubeCaptions,
  cuesToBlocks,
  findingTimes,
  formatVideoTime,
  type CaptionCapture,
  type CaptionCue,
} from '../src/video/youtube';

/**
 * A YouTube video is read from the captions its own player loads in the
 * reader's tab, analysed as a transcript, and reported with the time of each
 * finding. These pin the address rules, the transcript's shape, the prompt the
 * audit gets, and the background's handling of every answer the page can give.
 */

const VIDEO = 'k1KPNO-1vJc';

/** A spoken passage long enough to clear the 200-word floor, one cue per sentence. */
function cues(): CaptionCue[] {
  const out: CaptionCue[] = [];
  for (let i = 0; i < 40; i += 1) {
    out.push({
      start: i * 4.5,
      text: `Phrase numéro ${i} : les forces de l’ordre encerclent les manifestants pendant plusieurs heures.`,
    });
  }
  return out;
}

describe('YouTube addresses', () => {
  it('recognises a watch page, a Short and a live page, and nothing else', () => {
    expect(youtubeVideoId(`https://www.youtube.com/watch?v=${VIDEO}&t=42s`)).toBe(VIDEO);
    expect(youtubeVideoId(`https://m.youtube.com/watch?v=${VIDEO}`)).toBe(VIDEO);
    expect(youtubeVideoId(`https://www.youtube.com/shorts/${VIDEO}`)).toBe(VIDEO);
    expect(youtubeVideoId(`https://www.youtube.com/live/${VIDEO}`)).toBe(VIDEO);
    expect(youtubeVideoId('https://www.youtube.com/')).toBeNull();
    expect(youtubeVideoId('https://www.youtube.com/results?search_query=retraites')).toBeNull();
    expect(youtubeVideoId(`https://www.youtube.com.evil.fr/watch?v=${VIDEO}`)).toBeNull();
    expect(youtubeVideoId(`https://www.lemonde.fr/watch?v=${VIDEO}`)).toBeNull();
    expect(youtubeVideoId('pas une adresse')).toBeNull();
  });

  it('files every page of a video under one address', () => {
    expect(youtubeWatchUrl(VIDEO)).toBe(`https://www.youtube.com/watch?v=${VIDEO}`);
    expect(isVideoTranscriptUrl(youtubeWatchUrl(VIDEO))).toBe(true);
  });
});

describe('the audit prompt', () => {
  const blocks = [{ id: 'v1', type: 'paragraph' as const, text: 'Un passage parlé.', charStart: 0 }];

  it('tells the model a video address carries a spoken transcript', () => {
    const prompt = buildFourchesCaudinesUserPrompt({ url: youtubeWatchUrl(VIDEO), title: 'T', language: 'fr', blocks });
    expect(prompt).toContain('NATURE DU TEXTE : TRANSCRIPTION D\'UNE VIDÉO');
    expect(prompt).toContain('erreur de transcription');
  });

  it('leaves an article’s prompt exactly as it was', () => {
    const prompt = buildFourchesCaudinesUserPrompt({ url: 'https://www.lemonde.fr/a.html', title: 'T', language: 'fr', blocks });
    expect(prompt).not.toContain('TRANSCRIPTION');
  });
});

describe('the transcript', () => {
  it('groups cues into passages that close on a sentence, each knowing where its cues start', () => {
    const blocks = cuesToBlocks(cues());
    expect(blocks.length).toBeGreaterThan(1);
    for (const block of blocks) {
      expect(block.text.length).toBeLessThanOrEqual(900);
      expect(block.text.endsWith('.')).toBe(true);
      expect(block.start).toBe(block.cues[0].start);
      for (const cue of block.cues) expect(block.text.slice(cue.offset)).toMatch(/^Phrase numéro/);
    }
    expect(blocks.map((b) => b.id)).toEqual(blocks.map((_, i) => `v${i + 1}`));
  });

  it('still cuts captions that carry no punctuation at all', () => {
    const bare = Array.from({ length: 60 }, (_, i) => ({ start: i, text: 'sans aucune ponctuation ici' }));
    expect(cuesToBlocks(bare).every((b) => b.text.length <= 900 + 30)).toBe(true);
  });

  it('times a finding at the cue its quote starts in, or at its passage when the quote is reworded', () => {
    const blocks = cuesToBlocks(cues());
    const second = blocks[1];
    const target = second.cues[2];
    const quote = second.text.slice(target.offset, target.offset + 40);
    const findings = [
      { id: 'exact', blockId: second.id, quote },
      { id: 'folded', blockId: second.id, quote: quote.toUpperCase().replace(/’/g, "'") },
      { id: 'reworded', blockId: second.id, quote: 'rien de tout cela n’est dit' },
      { id: 'unknown-block', blockId: 'b9', quote },
    ] as Finding[];
    const times = findingTimes(findings, blocks);
    expect(times.exact).toBe(Math.floor(target.start));
    expect(times.folded).toBe(Math.floor(target.start));
    expect(times.reworded).toBe(Math.floor(second.start));
    expect(times['unknown-block']).toBeUndefined();
  });

  it('writes a time the way YouTube does', () => {
    expect(formatVideoTime(8)).toBe('0:08');
    expect(formatVideoTime(428.7)).toBe('7:08');
    expect(formatVideoTime(3725)).toBe('1:02:05');
  });
});

describe('reading the captions in the page', () => {
  type Listener = (list: { getEntries(): Array<{ name: string }> }) => void;
  let observers: Listener[];
  let entries: string[];
  let player: HTMLElement & Record<string, unknown>;
  let captionsOn: boolean;
  const fileUrl = `https://www.youtube.com/api/timedtext?v=${VIDEO}&lang=fr&kind=asr&pot=TOKEN&fmt=srv3`;

  function loadFile() {
    entries.push(fileUrl);
    for (const listener of observers) listener({ getEntries: () => [{ name: fileUrl }] });
  }

  beforeEach(() => {
    observers = [];
    entries = [];
    captionsOn = false;
    vi.stubGlobal('performance', { getEntriesByType: () => entries.map((name) => ({ name })) });
    vi.stubGlobal(
      'PerformanceObserver',
      class {
        constructor(private readonly cb: Listener) {}
        observe() {
          observers.push(this.cb);
        }
        disconnect() {
          observers = observers.filter((o) => o !== this.cb);
        }
      }
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        expect(url).toContain('fmt=json3');
        expect(url).toContain('pot=TOKEN');
        return new Response(
          JSON.stringify({
            events: [
              { tStartMs: 0, segs: [{ utf8: 'Bonjour à tous,' }] },
              { tStartMs: 1500 },
              { tStartMs: 3200, segs: [{ utf8: 'voici les ' }, { utf8: 'faits.' }] },
            ],
          })
        );
      })
    );
    document.body.innerHTML = '<div id="movie_player"></div>';
    player = document.getElementById('movie_player') as typeof player;
    Object.assign(player, {
      getPlayerResponse: () => ({
        videoDetails: { videoId: VIDEO, title: 'Une nasse', author: 'franceinfo', lengthSeconds: '86' },
        captions: { playerCaptionsTracklistRenderer: { captionTracks: [{ languageCode: 'fr', kind: 'asr' }] } },
      }),
      isSubtitlesOn: () => captionsOn,
      toggleSubtitles: vi.fn(() => {
        captionsOn = !captionsOn;
      }),
      toggleSubtitlesOn: vi.fn(() => {
        captionsOn = true;
        loadFile();
      }),
      getPlayerState: vi.fn(() => 2),
      getCurrentTime: () => 31,
      isMuted: () => false,
      mute: vi.fn(),
      unMute: vi.fn(),
      playVideo: vi.fn(),
      pauseVideo: vi.fn(),
      seekTo: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('switches captions on for the player to load them, reads the file, and switches them back off', async () => {
    const read = await captureYoutubeCaptions(VIDEO, false);
    expect(read).toMatchObject({ kind: 'ok', lang: 'fr', automatic: true, title: 'Une nasse', author: 'franceinfo' });
    expect((read as CaptionCapture & { kind: 'ok' }).cues).toEqual([
      { start: 0, text: 'Bonjour à tous,' },
      { start: 3.2, text: 'voici les faits.' },
    ]);
    expect(captionsOn).toBe(false);
    expect(player.playVideo).not.toHaveBeenCalled();
  });

  it('leaves captions on for a reader who had them on', async () => {
    captionsOn = true;
    const read = await captureYoutubeCaptions(VIDEO, false);
    expect(read.kind).toBe('ok');
    expect(captionsOn).toBe(true);
  });

  it('says so when YouTube offers no captions, without touching the player', async () => {
    (player as Record<string, unknown>).getPlayerResponse = () => ({ videoDetails: { videoId: VIDEO } });
    expect((await captureYoutubeCaptions(VIDEO, true)).kind).toBe('no_captions');
    expect(player.toggleSubtitlesOn).not.toHaveBeenCalled();
  });

  it('leaves a running ad alone and waits for it', async () => {
    player.classList.add('ad-showing');
    player.innerHTML = '<video></video>';
    Object.defineProperty(player.querySelector('video'), 'paused', { value: false });
    // The player reports the video's state, not the ad's: never started.
    (player.getPlayerState as ReturnType<typeof vi.fn>).mockReturnValue(-1);
    expect((await captureYoutubeCaptions(VIDEO, true)).kind).toBe('ad');
    expect(player.mute).not.toHaveBeenCalled();
    expect(player.playVideo).not.toHaveBeenCalled();
    expect(player.toggleSubtitlesOn).not.toHaveBeenCalled();
  });

  it('asks before starting a stalled ad, then plays it muted and waits for it', async () => {
    player.classList.add('ad-showing');
    player.innerHTML = '<video></video>';
    (player.getPlayerState as ReturnType<typeof vi.fn>).mockReturnValue(-1);
    expect((await captureYoutubeCaptions(VIDEO, false)).kind).toBe('needs_start');
    expect(player.playVideo).not.toHaveBeenCalled();

    expect((await captureYoutubeCaptions(VIDEO, true)).kind).toBe('ad');
    expect(player.mute).toHaveBeenCalled();
    expect(player.playVideo).toHaveBeenCalled();

    // The ad ends, the video plays: once read, it is paused back at its start, sound restored.
    player.classList.remove('ad-showing');
    (player.getPlayerState as ReturnType<typeof vi.fn>).mockReturnValue(1);
    expect((await captureYoutubeCaptions(VIDEO, true)).kind).toBe('ok');
    expect(player.pauseVideo).toHaveBeenCalled();
    expect(player.seekTo).toHaveBeenCalledWith(0, true);
    expect(player.unMute).toHaveBeenCalled();
    expect(player.dataset.squiggleMutedStart).toBeUndefined();
  });

  it('still waits for the file when the page was frozen under a popup', async () => {
    // Firefox for Android freezes the page while the popup covers it: the clock
    // runs a minute ahead while the player has not fetched anything yet.
    const now = Date.now;
    let frozenFor = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => now() + frozenFor);
    (player.toggleSubtitlesOn as ReturnType<typeof vi.fn>).mockImplementation(() => {
      captionsOn = true;
      setTimeout(() => (frozenFor = 60_000), 50);
      setTimeout(loadFile, 300);
    });
    expect((await captureYoutubeCaptions(VIDEO, false)).kind).toBe('ok');
    expect(player.toggleSubtitlesOn).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it('ignores a caption file that belongs to another video, such as an ad', async () => {
    entries.push(`https://www.youtube.com/api/timedtext?v=AAAAAAAAAAA&lang=en&pot=AD`);
    const read = await captureYoutubeCaptions(VIDEO, false);
    expect(read.kind).toBe('ok');
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining(`v=${VIDEO}`), expect.anything());
  });
});

describe('analysing the video in the tab', () => {
  const TAB = 303;
  let shared: Record<string, unknown>;
  let requests: Array<{ url: string; body: string }>;
  let pageAnswers: CaptionCapture[];
  let executeScript: ReturnType<typeof vi.fn>;
  let tabMessages: Array<{ type?: string }>;

  beforeEach(async () => {
    shared = {};
    requests = [];
    tabMessages = [];
    pageAnswers = [];
    executeScript = vi.fn(async () => [{ result: pageAnswers.shift() }]);

    (globalThis as unknown as { chrome: unknown }).chrome = {
      runtime: {
        sendMessage: vi.fn(),
        onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
        getURL: vi.fn((p: string) => `chrome-extension://mock/${p}`),
        lastError: null,
      },
      tabs: {
        query: vi.fn((_q: unknown, cb: (t: unknown[]) => void) => cb([{ id: TAB, active: true }])),
        get: vi.fn().mockResolvedValue({ id: TAB, windowId: 1, url: `https://www.youtube.com/watch?v=${VIDEO}&t=12s` }),
        sendMessage: vi.fn((_t: number, m: { type?: string }, cb?: (r?: unknown) => void) => {
          tabMessages.push(m);
          cb?.({ success: true });
        }),
        onRemoved: { addListener: vi.fn() },
        onUpdated: { addListener: vi.fn() },
      },
      scripting: { executeScript },
      action: { onClicked: { addListener: vi.fn() }, setTitle: vi.fn() },
      sidePanel: { setOptions: vi.fn().mockResolvedValue(undefined) },
      storage: {
        local: {
          get: async (keys: string[]) => {
            const out: Record<string, unknown> = {};
            for (const k of keys) if (k in shared) out[k] = shared[k];
            return out;
          },
          set: async (items: Record<string, unknown>) => void Object.assign(shared, items),
        },
      },
    };

    await new SecureKeyStorage().saveProviderConfig({
      provider: 'anthropic',
      apiKey: 'sk-ant-test',
      model: 'claude-sonnet-4',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (globalThis as unknown as { chrome?: unknown }).chrome;
  });

  /** The provider, answering the audit with one finding on the transcript's second passage. */
  function stubProvider(blockText: (blocks: ReturnType<typeof cuesToBlocks>) => { blockId: string; quote: string }) {
    const blocks = cuesToBlocks(cues());
    const { blockId, quote } = blockText(blocks);
    const answer = {
      summary: 'Verdict sur la transcription.',
      scores: ['robustesse_factuelle', 'solidite_logique', 'cadrage_manipulation', 'deontologie', 'orthographe_grammaire'].map(
        (domain) => ({ domain, score: 4, strengths: [], weaknesses: [] })
      ),
      findings: [
        { blockId, quote, category: 'cadrage', severity: 2, label: 'Formule qui oriente', explanation: 'E.', checkableClaim: '', confidence: 0.8 },
      ],
    };
    const encoder = new TextEncoder();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: { body: string }) => {
        requests.push({ url, body: init.body });
        return {
          ok: true,
          status: 200,
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'content_block_delta', delta: { text: JSON.stringify(answer) } })}\n\n`)
              );
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            },
          }),
          json: async () => answer,
          text: async () => JSON.stringify(answer),
        };
      })
    );
  }

  const ok = (): CaptionCapture => ({
    kind: 'ok',
    cues: cues(),
    lang: 'fr',
    automatic: true,
    title: 'Maintien de l’ordre : comment fonctionne une nasse ?',
    author: 'franceinfo',
    lengthSeconds: 180,
  });

  it('reads the captions in the page, analyses them as a transcript, and times each finding', async () => {
    let quoted = { start: 0 };
    stubProvider((blocks) => {
      const cue = blocks[1].cues[1];
      quoted = cue;
      return { blockId: blocks[1].id, quote: blocks[1].text.slice(cue.offset, cue.offset + 30) };
    });
    pageAnswers = [ok()];

    const sw = new BackgroundServiceWorker();
    const res = await sw.runAnalysisForTab(TAB);

    expect(res.success).toBe(true);
    // The captions are read in the page's own world, never fetched from anywhere else.
    expect(executeScript).toHaveBeenCalledWith(
      expect.objectContaining({ target: { tabId: TAB }, world: 'MAIN', args: [VIDEO, false] })
    );
    expect(tabMessages.some((m) => m.type === 'FC_EXTRACT_CONTENT')).toBe(false);

    const audit = JSON.parse(requests[0].body) as { messages: Array<{ content: string }> };
    const prompt = audit.messages.map((m) => m.content).join('\n');
    expect(prompt).toContain(`URL : https://www.youtube.com/watch?v=${VIDEO}\n`);
    expect(prompt).toContain('NATURE DU TEXTE : TRANSCRIPTION');
    expect(prompt).toContain('les forces de l’ordre encerclent');

    const state = sw.getStateManager().getTabState(TAB);
    const finding = state?.result?.findings[0];
    expect(state?.video).toEqual({ videoId: VIDEO, automatic: true, times: { [finding!.id]: Math.floor(quoted.start) } });
    // A video has no text in the page to highlight.
    expect(tabMessages.some((m) => m.type === 'FC_APPLY_HIGHLIGHTS')).toBe(false);
  });

  it('starts a video that never played only once the reader has been told', async () => {
    stubProvider((blocks) => ({ blockId: blocks[0].id, quote: blocks[0].text.slice(0, 20) }));
    const meta = { title: 'T', author: 'A', lengthSeconds: 180 };
    pageAnswers = [{ kind: 'needs_start', ...meta }, ok()];

    const sw = new BackgroundServiceWorker();
    const res = await sw.runAnalysisForTab(TAB);

    expect(res.success).toBe(true);
    expect(executeScript.mock.calls.map((c) => (c[0] as { args: unknown[] }).args)).toEqual([
      [VIDEO, false],
      [VIDEO, true],
    ]);
  });

  it('says plainly that a video without captions cannot be read, and sends nothing', async () => {
    stubProvider((blocks) => ({ blockId: blocks[0].id, quote: 'x' }));
    pageAnswers = [{ kind: 'no_captions', title: 'T', author: 'A', lengthSeconds: 60 }];

    const sw = new BackgroundServiceWorker();
    const res = await sw.runAnalysisForTab(TAB);

    expect(res.success).toBe(false);
    expect(res.error).toContain('Cette vidéo n’a pas de sous-titres');
    expect(requests).toHaveLength(0);
  });

  it('refuses a transcript too short to judge', async () => {
    stubProvider((blocks) => ({ blockId: blocks[0].id, quote: 'x' }));
    pageAnswers = [{ ...ok(), cues: cues().slice(0, 3) } as CaptionCapture];

    const res = await new BackgroundServiceWorker().runAnalysisForTab(TAB);

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/ne comptent que \d+ mots/);
    expect(requests).toHaveLength(0);
  });
});
