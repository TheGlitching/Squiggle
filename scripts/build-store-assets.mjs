#!/usr/bin/env node
/**
 * Render the store listing images: the promotional tiles and the screenshots.
 *
 *   node scripts/build-store-assets.mjs [--only <name>] [--out <dir>]
 *   node scripts/build-store-assets.mjs --page 'panel.html?state=report' --size 392x800 --out <dir>
 *
 * Each image is a page of `store/render/` (served by Vite) photographed by
 * headless Chrome over the DevTools protocol at its exact store size, so a
 * screenshot shows the extension's real panel and real in-page highlights and
 * cannot drift from them. Needs Node 22 (global WebSocket) and Chrome; set
 * CHROME to its binary if it is not in the usual place.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Every image a listing takes, at the size its store asks for. */
const ASSETS = [
  { name: 'promo-small-440x280', page: 'frame.html?asset=promo-small', width: 440, height: 280 },
  { name: 'promo-marquee-1400x560', page: 'frame.html?asset=promo-marquee', width: 1400, height: 560 },
  ...[1, 2, 3, 4, 5].map((n) => ({
    name: `screenshot-${n}-1280x800`,
    page: `frame.html?asset=shot-${n}`,
    width: 1280,
    height: 800,
  })),
];

const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const only = flag('--only');
// A single page of store/render at a given size, to look at one part on its own.
const page = flag('--page');
const size = (flag('--size') ?? '1280x800').split('x').map(Number);
const outDir = resolve(flag('--out') ?? join(ROOT, 'store'));

function chromePath() {
  const candidates = [
    process.env.CHROME,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  const found = candidates.find((path) => path && existsSync(path));
  if (!found) throw new Error('Chrome not found: set CHROME to its binary');
  return found;
}

const wait = (ms) => new Promise((done) => setTimeout(done, ms));

/** Launch headless Chrome and connect to its browser endpoint. */
async function launchChrome() {
  const profile = mkdtempSync(join(tmpdir(), 'squiggle-store-'));
  const chrome = spawn(
    chromePath(),
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--hide-scrollbars',
      '--force-color-profile=srgb',
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  const portFile = join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !existsSync(portFile); i += 1) await wait(100);
  const [port, path] = readFileSync(portFile, 'utf8').trim().split('\n');
  const socket = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  await new Promise((open, fail) => {
    socket.onopen = open;
    socket.onerror = fail;
  });

  let nextId = 0;
  const pending = new Map();
  const logs = [];
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    // Kept to explain a page that fails to render.
    if (message.method === 'Runtime.consoleAPICalled') {
      logs.push(message.params.args.map((a) => a.value ?? a.description).join(' '));
    } else if (message.method === 'Runtime.exceptionThrown') {
      logs.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    }
    const call = pending.get(message.id);
    if (!call) return;
    pending.delete(message.id);
    if (message.error) call.fail(new Error(message.error.message));
    else call.done(message.result);
  };
  const send = (method, params = {}, sessionId) =>
    new Promise((done, fail) => {
      const id = ++nextId;
      pending.set(id, { done, fail });
      socket.send(JSON.stringify({ id, method, params, sessionId }));
    });

  const close = async () => {
    socket.close();
    const exited = new Promise((done) => chrome.once('exit', done));
    chrome.kill();
    await exited;
    rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
  };
  return { send, close, logs };
}

async function capture({ send, logs }, origin, asset) {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const call = (method, params) => send(method, params, sessionId);

  await call('Emulation.setDeviceMetricsOverride', {
    width: asset.width,
    height: asset.height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  // The final frame of every transition, without waiting for it.
  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await call('Page.enable');
  await call('Runtime.enable');
  logs.length = 0;
  await call('Page.navigate', { url: `${origin}/${asset.page}` });

  let state;
  for (let i = 0; i < 200; i += 1) {
    const { result } = await call('Runtime.evaluate', { expression: 'document.documentElement.dataset.ready' });
    state = result.value;
    if (state === 'true' || state === 'error') break;
    await wait(50);
  }
  if (state !== 'true') {
    throw new Error(`${asset.name}: the page did not finish rendering (${state ?? 'timeout'})\n${logs.join('\n')}`);
  }
  await wait(150);

  const { data } = await call('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: asset.width, height: asset.height, scale: 1 },
  });
  await send('Target.closeTarget', { targetId });
  return Buffer.from(data, 'base64');
}

const server = await createServer({ configFile: join(ROOT, 'store/render/vite.config.ts'), server: { port: 0 } });
await server.listen();
const origin = server.resolvedUrls.local[0].replace(/\/$/, '');
const chrome = await launchChrome();
mkdirSync(outDir, { recursive: true });

try {
  const assets = page
    ? [{ name: 'page', page, width: size[0], height: size[1] }]
    : ASSETS.filter((a) => !only || a.name.includes(only));
  for (const asset of assets) {
    const png = await capture(chrome, origin, asset);
    writeFileSync(join(outDir, `${asset.name}.png`), png);
    console.log(`wrote ${join(outDir, `${asset.name}.png`)}`);
  }
} finally {
  await chrome.close();
  await server.close();
}
