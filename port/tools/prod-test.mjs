// The production setup end to end: builds the frontend (npm run build in port/web),
// starts the game server alone on a free port as a host would run it (APP_DIR, the
// extracted assets, no Vite) on a scratch copy of port/tools/regress-seed.json, and
// plays the built game in headless Chrome from the front page: loader, login screen,
// tester@home.lan's robot list, the garage, Training. Then checks the serving: no
// 404s for /app, /assets or /game, the original movies not served, compressed and
// cacheable replies (ETag, 304 on a second request), and prints the sizes.
//
//   node port/tools/prod-test.mjs              build, then test
//   node port/tools/prod-test.mjs --no-build   test the current port/web/dist
import { chromium } from 'playwright-core';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(ROOT, '.cache/regress/out');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!process.argv.includes('--no-build')) {
  const b = spawnSync('npm', ['run', 'build'], { cwd: join(ROOT, 'port/web'), encoding: 'utf8' });
  if (b.status !== 0) {
    console.log(`FAIL npm run build\n${(b.stdout + b.stderr).trim().split('\n').slice(-15).join('\n')}`);
    process.exit(1);
  }
  console.log('  ok   npm run build');
}

const port = await new Promise((done) => {
  const srv = createServer().listen(0, '127.0.0.1', () => {
    const { port } = srv.address();
    srv.close(() => done(port));
  });
});
const BASE = `http://127.0.0.1:${port}`;
const dir = mkdtempSync(join(tmpdir(), 'rr-prod-'));
mkdirSync(join(dir, 'data'));
mkdirSync(join(dir, 'public'));
writeFileSync(join(dir, 'data/db.json'), readFileSync(join(ROOT, 'port/tools/regress-seed.json')));
// PUBLIC_DIR empty: anything the build needs must come from APP_DIR, ASSETS_DIR or GAME_DIR.
const env = {
  ...process.env,
  PORT: String(port),
  DATA_DIR: join(dir, 'data'),
  PUBLIC_DIR: join(dir, 'public'),
  APP_DIR: join(ROOT, 'port/web/dist'),
  ASSETS_DIR: join(ROOT, 'port/assets'),
  GAME_DIR: join(ROOT, 'public/game'),
  ICE_SERVERS: '',
};
const server = spawn('node', ['server/index.mjs'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));
let browser;
const cleanup = () => {
  server.kill('SIGTERM');
  rmSync(dir, { recursive: true, force: true });
};
process.on('exit', cleanup);
process.on('SIGINT', () => process.exit(130));

const lines = [];
let ok = true;
const check = (good, what) => {
  lines.push(`  ${good ? 'ok  ' : 'FAIL'} ${what}`);
  console.log(lines[lines.length - 1]);
  ok &&= !!good;
  return good;
};
async function finish() {
  await browser?.close().catch(() => {});
  writeFileSync(join(OUT, 'prod-test-server.txt'), serverLog);
  console.log(ok ? '\nprod-test passed' : `\nprod-test failed (server log: ${join(OUT, 'prod-test-server.txt')})`);
  process.exit(ok ? 0 : 1);
}

for (let until = Date.now() + 15000; ; await sleep(200)) {
  try {
    if ((await fetch(`${BASE}/game/main.ini`)).ok) break;
  } catch {
    // not up yet
  }
  if (Date.now() > until) {
    check(false, 'the server came up');
    await finish();
  }
}

// ------------------------------------------------------------------ the game

browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome-stable',
  headless: true,
  args: ['--headless=new', '--mute-audio', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=gl', '--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
// Every movie the player ran, polled (the loader only shows for a moment).
await ctx.addInitScript(() => {
  window.__movies = [];
  setInterval(() => {
    const m = window.__player?.movie?.name;
    if (m && window.__movies[window.__movies.length - 1] !== m) window.__movies.push(m);
  }, 50);
});
const page = await ctx.newPage();
const responses = [];
const errors = [];
const consoleLog = [];
page.on('response', (r) => responses.push({ url: r.url(), status: r.status(), headers: r.headers() }));
page.on('requestfailed', (r) => errors.push(`request failed: ${r.url()} (${r.failure()?.errorText})`));
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  consoleLog.push(m.text().slice(0, 400));
  if (m.type() === 'error' && /script error|TypeError|ReferenceError/.test(m.text())) errors.push(m.text().slice(0, 300));
});

const ev = (expr) => page.evaluate((e) => {
  const p = window.__player;
  void p;
  return eval(e);
}, expr);
async function expect(label, expr, timeout = 5000) {
  let got = false;
  let last;
  for (const until = Date.now() + timeout; Date.now() < until; await sleep(150)) {
    try {
      got = !!(await ev(expr));
    } catch (e) {
      last = e.message.split('\n')[0];
    }
    if (got) break;
  }
  if (!check(got, `${label}${got || !last ? '' : ` (${last})`}`)) {
    await page.screenshot({ path: join(OUT, 'prod-test-failed.png') });
    writeFileSync(join(OUT, 'prod-test-console.txt'), consoleLog.join('\n'));
    await finish();
  }
}
async function click(x, y) {
  await page.mouse.move(x, y);
  await sleep(60);
  await page.mouse.down();
  await sleep(100);
  await page.mouse.up();
  await sleep(250);
}

await page.goto(`${BASE}/`);
await expect('the front page runs the game', `!!window.__player`, 15000);
await expect('the login screen', `p.movie.name === 'login013_' && p.frameLabel === 'create'`, 20000);
check((await ev('window.__movies'))[0] === 'loader002', `it started at the loader (movies: ${(await ev('window.__movies')).join(', ')})`);
await sleep(500);
await click(310, 148);
await expect('login tab', `p.frameLabel === 'login'`);
await click(400, 222);
await page.keyboard.type('tester@home.lan', { delay: 40 });
await click(400, 260);
await page.keyboard.type('rage2005', { delay: 40 });
await click(475, 309);
await expect('logged in: the robot list', `p.member('robotname1').text === 'Crusher'`, 15000);
await click(300, 235);
await sleep(500);
await click(480, 375);
await expect('the garage', `p.movie.name === 'factory0604' && p.frameLabel === 'build'`, 25000);
await sleep(1500);
await click(731, 501);
await expect('the TRAINING door: the arena', `p.movie?.name === 'arena104'`, 20000);
await expect('Training: the robot is ready', `String(p.sprite(10).getProp('state')) === '#move'`, 20000);
await page.screenshot({ path: join(OUT, 'prod-test-training.png') });
writeFileSync(join(OUT, 'prod-test-console.txt'), consoleLog.join('\n'));
check(!errors.length, `no page errors${errors.length ? `: ${errors.slice(0, 5).join(' | ')}` : ''}`);

// ------------------------------------------------------------------ the serving

const ours = responses.filter((r) => r.url.startsWith(BASE));
const bad = ours.filter((r) => r.status >= 400 && /^\/(app|assets|game)\//.test(new URL(r.url).pathname));
check(!bad.length, `no errors for /app, /assets or /game (${ours.length} requests)${bad.length ? `: ${bad.slice(0, 5).map((r) => `${r.status} ${new URL(r.url).pathname}`).join(', ')}` : ''}`);
const gameFiles = [...new Set(ours.map((r) => new URL(r.url).pathname).filter((p) => p.startsWith('/game/')))];
check(gameFiles.every((p) => ['/game/main.ini', '/game/badlanguage.txt'].includes(p)), `/game files fetched: ${gameFiles.join(', ')}`);
const front = await fetch(`${BASE}/`);
check(front.ok && /<div id="stage">/.test(await front.text()) && /no-cache/.test(front.headers.get('cache-control')), '/ is game.html, revalidated on every visit');
for (const p of ['/game/arena104.dcr', '/game/robotwars.cct', '/index.html', '/assets/../package.json', '/app/../../../package.json'])
  check((await fetch(BASE + p)).status >= 400, `not served: ${p}`);

// In the browser: compressible replies came compressed.
const asset = (r) => /^\/(app|assets)\//.test(new URL(r.url).pathname);
const textual = ours.filter((r) => asset(r) && r.status === 200 && /\.(js|json|ttf|bin)$/.test(new URL(r.url).pathname));
const plain = textual.filter((r) => !/^(br|gzip)$/.test(r.headers['content-encoding'] ?? '') && Number(r.headers['content-length'] ?? 2000) >= 1024);
check(textual.length && !plain.length, `${textual.length} js/json/ttf/bin replies compressed in the browser${plain.length ? `; not: ${plain.slice(0, 5).map((r) => new URL(r.url).pathname).join(', ')}` : ''}`);
const uncached = ours.filter((r) => asset(r) && !/max-age=\d{4,}/.test(r.headers['cache-control'] ?? ''));
check(!uncached.length, `every /app and /assets reply cacheable${uncached.length ? `; not: ${uncached.slice(0, 5).map((r) => new URL(r.url).pathname).join(', ')}` : ''}`);
const js = ours.find((r) => /^\/app\/.*\.js$/.test(new URL(r.url).pathname));
check(/immutable/.test(js?.headers['cache-control'] ?? ''), `the hashed bundle is immutable (${js?.headers['cache-control']})`);

// A second request for each: the same body from the in-memory copy, and 304 with the ETag.
const sizes = { app: [0, 0, 0, 0], assets: [0, 0, 0, 0] };
let second = 0;
let notModified = 0;
const urls = [...new Set(ours.filter((r) => asset(r) && r.status === 200).map((r) => r.url))];
for (const url of urls) {
  const kind = new URL(url).pathname.split('/')[1];
  const raw = await fetch(url, { headers: { 'Accept-Encoding': 'identity' } });
  const rawLen = (await raw.arrayBuffer()).byteLength;
  const sz = async (enc) => {
    // fetch() decodes; Content-Length is the compressed size.
    const r = await fetch(url, { headers: { 'Accept-Encoding': enc } });
    await r.arrayBuffer();
    return [Number(r.headers.get('content-length')), r.headers.get('content-encoding'), r.headers.get('etag')];
  };
  const [br, brEnc, tag] = await sz('br');
  const [gz] = await sz('gzip');
  const [br2, brEnc2] = await sz('br');
  if (br2 === br && brEnc2 === brEnc) second++;
  const cond = await fetch(url, { headers: { 'Accept-Encoding': 'br', 'If-None-Match': tag } });
  if (cond.status === 304) notModified++;
  const s = sizes[kind];
  s[0] += rawLen;
  s[1] += brEnc === 'br' ? br : rawLen;
  s[2] += gz || rawLen;
  s[3]++;
}
check(second === urls.length, `second request: the same compressed reply (${second} of ${urls.length})`);
check(notModified === urls.length, `second request with the ETag: 304 Not Modified (${notModified} of ${urls.length})`);
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
for (const [kind, [raw, br, gz, n]] of Object.entries(sizes)) console.log(`  /${kind}: ${n} files, ${kb(raw)} raw, ${kb(br)} brotli, ${kb(gz)} gzip`);
await finish();
