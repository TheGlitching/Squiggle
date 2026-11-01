#!/usr/bin/env node
/**
 * Renders the short video of each glossary notion (`src/reel.tsx`) into `reels/`,
 * where it is committed: `reels/faux-dilemme.mp4`, its last frame as a poster
 * (`reels/faux-dilemme.jpg`: the Reel's cover, and what a reviewer or an e-mail
 * shows of it), and `reels/faux-dilemme.json`; then its spoken version,
 * `reels/faux-dilemme.voix.mp4` and `reels/faux-dilemme.voix.json`, whose lines
 * are kept in `reels/voix/`.
 * The build publishes a video beside its notion's carousel while the glossary
 * still says what it shows; a notion whose words changed since needs this again.
 *
 *   npm run reels -w @squiggle/web                  every video missing or out of date
 *   npm run reels -w @squiggle/web -- faux-dilemme  only these notions, even if up to date
 *
 * It needs ffmpeg on the PATH (`brew install ffmpeg`), and runs on a computer,
 * not on the VPS: a video takes a minute or so to draw. A spoken line not yet in
 * `reels/voix/` is synthesised by Google Cloud's Text-to-Speech (`VOICE` in
 * `src/reel.tsx`), which needs gcloud logged in and, in the environment,
 * `SQUIGGLE_TTS_PROJECT`, the Google Cloud project that pays for it (and
 * `SQUIGGLE_GCLOUD_ACCOUNT`, the gcloud account to ask with, when it is not the
 * active one). Without them, the silent videos are still rendered and the
 * spoken ones that need a new line are left as they were.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';

import { createServer } from 'vite';

const dir = new URL('./reels/', import.meta.url);
const lines = new URL('./voix/', dir);
const server = await createServer({
  configFile: false,
  root: new URL('.', import.meta.url).pathname,
  // As the build reads the blog (`BUILD_DEFINE` in vite.config.ts): drafts are not published.
  define: { __BLOG_DRAFTS__: 'false' },
  // Nothing here runs in a browser: no dependency to pre-bundle.
  optimizeDeps: { noDiscovery: true, include: [] },
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
});

/** Runs ffmpeg with `frames` on its input, one RGBA buffer each. */
async function ffmpeg(args, frames = []) {
  const child = spawn('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: ['pipe', 'inherit', 'pipe'] });
  let errors = '';
  child.stderr.on('data', (chunk) => (errors += chunk));
  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      // Reading a pipe, ffmpeg probes the first 64 KB on its own and says so; every frame still arrives whole.
      const said = errors.split('\n').filter((line) => line && !line.startsWith('Truncating packet of size')).join('\n');
      if (code !== 0) reject(new Error(`ffmpeg exited with ${code}: ${said}`));
      else {
        if (said) console.warn(said);
        resolve();
      }
    });
  });
  for await (const frame of frames) {
    if (!child.stdin.write(frame)) await new Promise((resolve) => child.stdin.once('drain', resolve));
  }
  child.stdin.end();
  await done;
}

/**
 * Encodes RGBA frames as H.264 in an MP4 Instagram, Facebook, Threads and Bluesky
 * all take, and the last frame as a JPEG poster. The sound track is silent, or
 * the spoken `lines`, each from its own second.
 */
async function encode(video, file, poster, spoken = []) {
  const raw = ['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${video.width}x${video.height}`, '-r', String(video.fps), '-i', '-'];
  let last;
  async function* frames() {
    for await (const frame of video.frames()) yield (last = frame);
  }
  const delays = spoken.map((line, index) => `[${index + 1}:a]adelay=${Math.round(line.at * 1000)}:all=1[l${index}]`);
  // Loudness as the networks normalise to, so the voice is neither lost nor clipped.
  const mix = `${delays.join(';')};${spoken.map((_, index) => `[l${index}]`).join('')}amix=inputs=${spoken.length}:normalize=0:duration=longest,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,aformat=channel_layouts=stereo,apad[sound]`;
  await ffmpeg(
    [
      ...raw,
      ...(spoken.length
        ? [...spoken.flatMap((line) => ['-i', line.file]), '-filter_complex', mix, '-map', '0:v', '-map', '[sound]']
        : ['-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000']),
      // The site's colours stay its colours: the conversion to video says which matrix it used.
      ...['-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709'],
      ...['-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '18', '-tune', 'animation', '-g', String(video.fps * 5)],
      ...['-c:a', 'aac', '-b:a', spoken.length ? '128k' : '64k', '-shortest', '-movflags', '+faststart', file],
    ],
    frames(),
  );
  // JPEG, the one image format Instagram takes as a cover.
  if (poster) await ffmpeg([...raw, '-frames:v', '1', '-q:v', '2', poster], [last]);
}

/** What ffprobe reads in the file: the check that the video is what the networks were promised. */
function probe(file) {
  const out = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height:format=duration', '-of', 'json', file], { encoding: 'utf8' });
  if (out.status !== 0) throw new Error(`ffprobe: ${out.stderr}`);
  const { streams, format } = JSON.parse(out.stdout);
  return { video: streams.find((s) => s.codec_type === 'video'), audio: streams.find((s) => s.codec_type === 'audio'), seconds: Number(format.duration) };
}

/** Text-to-Speech is not set up here: the spoken versions that need a new line wait. */
class NoVoice extends Error {}

/** One line said by `voice`, as WAV audio, from Google Cloud's Text-to-Speech. */
async function synthesize(text, voice) {
  const project = process.env.SQUIGGLE_TTS_PROJECT;
  if (!project) throw new NoVoice('SQUIGGLE_TTS_PROJECT is not set');
  const account = process.env.SQUIGGLE_GCLOUD_ACCOUNT;
  const token = spawnSync('gcloud', ['auth', 'print-access-token', ...(account ? [`--account=${account}`] : [])], { encoding: 'utf8' });
  if (token.status !== 0) throw new NoVoice(`gcloud: ${token.stderr.trim()}`);
  const response = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
    method: 'POST',
    headers: { authorization: `Bearer ${token.stdout.trim()}`, 'x-goog-user-project': project, 'content-type': 'application/json' },
    body: JSON.stringify({
      input: { prompt: voice.prompt, text },
      voice: { languageCode: voice.language, name: voice.name, modelName: voice.model },
      audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 24000 },
    }),
  });
  if (!response.ok) throw new Error(`Text-to-Speech: HTTP ${response.status} ${(await response.text()).slice(0, 300)}`);
  return Buffer.from((await response.json()).audioContent, 'base64');
}

/**
 * A spoken line, synthesised once and kept in `reels/voix/<id>.m4a` with what was
 * said and by which voice: the same line by the same voice is never asked for
 * twice, and a re-rendered video keeps the take it had.
 */
async function line(id, text, voice) {
  const [audio, meta] = ['m4a', 'json'].map((type) => new URL(`${id}.${type}`, lines).pathname);
  const said = { text, voice };
  if (existsSync(audio) && existsSync(meta)) {
    const kept = JSON.parse(readFileSync(meta, 'utf8'));
    if (JSON.stringify(kept.said) === JSON.stringify(said)) return { file: audio, seconds: kept.seconds };
  }
  mkdirSync(lines, { recursive: true });
  const wav = new URL(`${id}.part.wav`, lines).pathname;
  // The silence the voice leaves before and after its line is cut: the scene sets when it speaks.
  const trim = 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse';
  // A take the length of its text, or another one. The model sometimes says more than it
  // was given (a 7-second « Où est le piège ? »), or drags (9 characters a second where
  // its takes run at 14 to 17); a take that long, or too short to hold the words, is not
  // the one. Its length is no proof of its words: listen once.
  const [shortest, longest] = [text.length / 25, Math.max(3.5, text.length / 12)];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    writeFileSync(wav, await synthesize(text, voice));
    await ffmpeg(['-i', wav, '-af', trim, '-c:a', 'aac', '-b:a', '128k', `${audio}.part.m4a`]);
    rmSync(wav);
    const { seconds } = probe(`${audio}.part.m4a`);
    if (seconds < shortest || seconds > longest) {
      console.warn(`${id}: a take of ${seconds.toFixed(1)} s for ${text.length} characters, asked again`);
      continue;
    }
    renameSync(`${audio}.part.m4a`, audio);
    writeFileSync(meta, `${JSON.stringify({ said, seconds }, null, 2)}\n`);
    return { file: audio, seconds };
  }
  rmSync(`${audio}.part.m4a`);
  throw new Error(`${id}: three takes, none the length of « ${text} »`);
}

try {
  const { NOTIONS } = await server.ssrLoadModule('/src/glossaire.ts');
  const { REEL_FPS, REEL_HEIGHT, REEL_WIDTH, VOICE, narration, reel, reelSource, spokenAt, spokenSource } = await server.ssrLoadModule('/src/reel.tsx');
  const size = { width: REEL_WIDTH, height: REEL_HEIGHT, fps: REEL_FPS };
  const asked = process.argv.slice(2);
  const unknown = asked.filter((slug) => !NOTIONS.some((notion) => notion.slug === slug));
  if (unknown.length) throw new Error(`no notion ${unknown.join(', ')}`);
  /** Whether `<name>.mp4` exists and its record says it was rendered from `source`. */
  const current = (name, source) => {
    const meta = new URL(`${name}.json`, dir);
    return existsSync(meta) && existsSync(new URL(`${name}.mp4`, dir)) && JSON.parse(readFileSync(meta, 'utf8')).source === source;
  };
  /** Checks a rendered video, then moves it and its poster in place of the previous ones and records what it shows. */
  const keep = (name, part, source, seconds, longest) => {
    const found = probe(part.video);
    if (found.video?.codec_name !== 'h264' || found.video.width !== REEL_WIDTH || found.video.height !== REEL_HEIGHT || found.audio?.codec_name !== 'aac') {
      throw new Error(`${name}: ffmpeg wrote ${JSON.stringify(found)}`);
    }
    if (found.seconds < 8 || found.seconds > longest + 0.2) throw new Error(`${name}: ${found.seconds} s, outside 8 to ${longest}`);
    renameSync(part.video, new URL(`${name}.mp4`, dir).pathname);
    if (part.poster) renameSync(part.poster, new URL(`${name}.jpg`, dir).pathname);
    writeFileSync(new URL(`${name}.json`, dir), `${JSON.stringify({ source, seconds }, null, 2)}\n`);
    console.log(`${name}: ${seconds.toFixed(1)} s, ${Math.round(readFileSync(new URL(`${name}.mp4`, dir)).length / 1024)} KB`);
  };
  mkdirSync(dir, { recursive: true });
  let done = 0;
  const waiting = [];
  for (const notion of NOTIONS) {
    const forced = asked.includes(notion.slug);
    if (asked.length && !forced) continue;
    // Written aside, then moved: a run stopped halfway leaves the previous video whole.
    const part = (name, poster) => ({ video: new URL(`${name}.part.mp4`, dir).pathname, poster: poster ? new URL(`${name}.part.jpg`, dir).pathname : null });
    if (forced || !current(notion.slug, reelSource(notion))) {
      const video = await reel(notion);
      const files = part(notion.slug, true);
      await encode({ ...video, ...size }, files.video, files.poster);
      // The networks' short format: under 8 seconds a video says too little, over 15 a feed stops watching.
      keep(notion.slug, files, reelSource(notion), video.seconds, 15);
      done += 1;
    }
    const spoken = `${notion.slug}.voix`;
    if (forced || !current(spoken, spokenSource(notion))) {
      let said;
      try {
        const { question, answer } = narration(notion);
        said = [await line('question', question, VOICE), await line(notion.slug, answer, VOICE)];
      } catch (error) {
        if (!(error instanceof NoVoice)) throw error;
        waiting.push(`${notion.slug} (${error.message})`);
        continue;
      }
      const at = spokenAt(notion);
      const video = await reel(notion, said[1].seconds);
      const files = part(spoken, false);
      await encode({ ...video, ...size }, files.video, null, [
        { ...said[0], at: at.question },
        { ...said[1], at: at.answer },
      ]);
      // The voice reads the answer at its own pace: the spoken version holds its last frame
      // until it has finished, 15 to 19 seconds for the glossary's names and summaries.
      keep(spoken, files, spokenSource(notion), video.seconds, 20);
      done += 1;
    }
  }
  if (done === 0 && waiting.length === 0) console.log('Every video is up to date.');
  if (waiting.length) console.warn(`Spoken versions not rendered, Text-to-Speech is not set up: ${waiting.join(', ')}`);
} finally {
  await server.close();
}
