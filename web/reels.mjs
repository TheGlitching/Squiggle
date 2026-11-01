#!/usr/bin/env node
/**
 * Renders the short video of each glossary notion (`src/reel.tsx`) into `reels/`,
 * where it is committed: `reels/faux-dilemme.mp4`, its last frame as a poster
 * (`reels/faux-dilemme.jpg`: the Reel's cover, and what a reviewer or an e-mail
 * shows of it), and `reels/faux-dilemme.json`.
 * The build publishes a video beside its notion's carousel while the glossary
 * still says what it shows; a notion whose words changed since needs this again.
 *
 *   npm run reels -w @squiggle/web                  every notion whose video is missing or out of date
 *   npm run reels -w @squiggle/web -- faux-dilemme  only these, even if up to date
 *
 * It needs ffmpeg on the PATH (`brew install ffmpeg`), and runs on a computer,
 * not on the VPS: a video takes a minute or so to draw.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

import { createServer } from 'vite';

const dir = new URL('./reels/', import.meta.url);
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
async function ffmpeg(args, frames) {
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
 * all take, with a silent sound track, and the last frame as a JPEG poster.
 */
async function encode(video, file, poster) {
  const raw = ['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${video.width}x${video.height}`, '-r', String(video.fps), '-i', '-'];
  let last;
  async function* frames() {
    for await (const frame of video.frames()) yield (last = frame);
  }
  await ffmpeg(
    [
      ...raw,
      ...['-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000'],
      // The site's colours stay its colours: the conversion to video says which matrix it used.
      ...['-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709'],
      ...['-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '18', '-tune', 'animation', '-g', String(video.fps * 5)],
      ...['-c:a', 'aac', '-b:a', '64k', '-shortest', '-movflags', '+faststart', file],
    ],
    frames(),
  );
  // JPEG, the one image format Instagram takes as a cover.
  await ffmpeg([...raw, '-frames:v', '1', '-q:v', '2', poster], [last]);
}

/** What ffprobe reads in the file: the check that the video is what the networks were promised. */
function probe(file) {
  const out = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height:format=duration', '-of', 'json', file], { encoding: 'utf8' });
  if (out.status !== 0) throw new Error(`ffprobe: ${out.stderr}`);
  const { streams, format } = JSON.parse(out.stdout);
  return { video: streams.find((s) => s.codec_type === 'video'), audio: streams.find((s) => s.codec_type === 'audio'), seconds: Number(format.duration) };
}

try {
  const { NOTIONS } = await server.ssrLoadModule('/src/glossaire.ts');
  const { REEL_FPS, REEL_HEIGHT, REEL_WIDTH, reel, reelSource } = await server.ssrLoadModule('/src/reel.tsx');
  const asked = process.argv.slice(2);
  const unknown = asked.filter((slug) => !NOTIONS.some((notion) => notion.slug === slug));
  if (unknown.length) throw new Error(`no notion ${unknown.join(', ')}`);
  const current = (notion) => {
    const meta = new URL(`${notion.slug}.json`, dir);
    return existsSync(meta) && existsSync(new URL(`${notion.slug}.mp4`, dir)) && JSON.parse(readFileSync(meta, 'utf8')).source === reelSource(notion);
  };
  const todo = asked.length ? NOTIONS.filter((notion) => asked.includes(notion.slug)) : NOTIONS.filter((notion) => !current(notion));
  if (todo.length === 0) console.log('Every video is up to date.');
  mkdirSync(dir, { recursive: true });
  for (const notion of todo) {
    const started = Date.now();
    const video = await reel(notion);
    const [file, poster] = ['mp4', 'jpg'].map((type) => new URL(`${notion.slug}.${type}`, dir).pathname);
    const [filePart, posterPart] = ['mp4', 'jpg'].map((type) => new URL(`${notion.slug}.part.${type}`, dir).pathname);
    // Written aside, then moved: a run stopped halfway leaves the previous video whole.
    await encode({ ...video, width: REEL_WIDTH, height: REEL_HEIGHT, fps: REEL_FPS }, filePart, posterPart);
    const found = probe(filePart);
    if (found.video?.codec_name !== 'h264' || found.video.width !== REEL_WIDTH || found.video.height !== REEL_HEIGHT || found.audio?.codec_name !== 'aac') {
      throw new Error(`${notion.slug}: ffmpeg wrote ${JSON.stringify(found)}`);
    }
    // The networks' short format: under 8 seconds a video says too little, over 15 a feed stops watching.
    if (found.seconds < 8 || found.seconds > 15.2) throw new Error(`${notion.slug}: ${found.seconds} s, outside 8 to 15`);
    renameSync(filePart, file);
    renameSync(posterPart, poster);
    writeFileSync(new URL(`${notion.slug}.json`, dir), `${JSON.stringify({ source: reelSource(notion), seconds: video.seconds }, null, 2)}\n`);
    console.log(`${notion.slug}: ${video.seconds.toFixed(1)} s, ${Math.round(readFileSync(file).length / 1024)} KB, in ${Math.round((Date.now() - started) / 1000)} s`);
  }
} finally {
  await server.close();
}
