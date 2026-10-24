// Trace motion through the game's screens: logs in on a fresh fixture (its own game and
// dev servers on free ports, seed data), goes to the garage and through the TRAINING door
// into the arena, and records every visible sprite's position on each drawn frame. Prints,
// per movie, draws that came late or ran more than one frame cycle, and each moving
// sprite's path per frame cycle: a slide that jumps shows as one big step.
//
//   node port/tools/motion-trace.mjs        (writes the raw record to /tmp/rrwork/trans-rec.json)
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
const ROOT = process.cwd();
const free = () => new Promise((d) => { const s = createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => d(port)); }); });
const SP = await free(), DP = await free(), APP = `http://127.0.0.1:${DP}`;
const dir = mkdtempSync(join(tmpdir(), 'rr-probe-'));
mkdirSync(join(dir, 'data')); writeFileSync(join(dir, 'data/db.json'), readFileSync('port/tools/regress-seed.json'));
mkdirSync(join(dir, 'public')); symlinkSync(join(ROOT, 'public/game'), join(dir, 'public/game')); copyFileSync('public/index.html', join(dir, 'public/index.html'));
const kids = [spawn('node', ['server/index.mjs'], { env: { ...process.env, PORT: String(SP), DATA_DIR: join(dir, 'data'), PUBLIC_DIR: join(dir, 'public') }, stdio: 'ignore' })];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (u) => { for (let i = 0; i < 120; i++) { try { if ((await fetch(u)).ok) return; } catch {} await sleep(500); } throw new Error('timeout ' + u); };
await waitFor(`http://127.0.0.1:${SP}/game/main.ini`);
kids.push(spawn('npx', ['vite', '--port', String(DP), '--strictPort'], { cwd: 'port/web', env: { ...process.env, RR_SERVER: `http://127.0.0.1:${SP}` }, stdio: 'ignore' }));
process.on('exit', () => kids.forEach((k) => k.kill('SIGTERM')));
await waitFor(`${APP}/game.html`);
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: true, args: ['--headless=new', '--mute-audio', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=gl'] });
const page = await (await b.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 })).newPage();
await page.addInitScript(() => {
  window.__rec = [];
  const raf = window.requestAnimationFrame.bind(window);
  const loop = () => {
    const p = window.__player;
    if (p?.movie) {
      const locs = {};
      for (const s of p.sprites) if (s.spriteNum && s.member && s.visible) locs[s.spriteNum] = [Math.round(s.locH), Math.round(s.locV)];
      window.__rec.push({ t: Math.round(performance.now()), c: p.frameCycles, f: p.frame, m: p.movie.name, locs });
    }
    raf(loop);
  };
  raf(loop);
});
const until = async (js, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await page.evaluate(`(() => { const p = window.__player; try { return !!(${js}); } catch { return false; } })()`)) return; await sleep(100); } throw new Error('timeout: ' + js); };
const click = async (x, y) => { await page.mouse.move(x, y); await sleep(60); await page.mouse.down(); await sleep(100); await page.mouse.up(); await sleep(250); };
await page.goto(`${APP}/game.html`);
await until(`p.movie.name === 'login013_' && p.frameLabel === 'create'`);
await click(310, 148); await until(`p.frameLabel === 'login'`);
await click(400, 222); await page.keyboard.type('tester@home.lan', { delay: 20 });
await click(400, 260); await page.keyboard.type('rage2005', { delay: 20 });
await click(475, 309); await until(`p.member('robotname1').text === 'Crusher'`);
await sleep(1500);
await click(300, 235); await sleep(300); await click(480, 375);
await until(`p.movie.name === 'factory0604' && p.frameLabel === 'build'`, 30000);
await sleep(4000);
await click(731, 501); await until(`p.movie?.name === 'arena104'`);
await sleep(6000);
const rec = await page.evaluate(() => window.__rec);
await b.close();
mkdirSync('/tmp/rrwork', { recursive: true }); writeFileSync('/tmp/rrwork/trans-rec.json', JSON.stringify(rec));
let seg = [];
const segs = [];
for (const r of rec) { if (seg.length && seg[seg.length - 1].m !== r.m) { segs.push(seg); seg = []; } seg.push(r); }
segs.push(seg);
for (const s of segs) {
  console.log(`\n=== ${s[0].m}: ${s.length} draws, ${s[s.length - 1].t - s[0].t} ms`);
  for (let i = 1; i < s.length; i++) { const dt = s[i].t - s[i - 1].t, dc = s[i].c - s[i - 1].c; if (dt > 60 || dc > 1) console.log(`  gap t=${s[i].t} ${dt}ms cycles+${dc} f${s[i - 1].f}->f${s[i].f}`); }
  const tracks = {}; let lastC = -1;
  for (const r of s) { if (r.c === lastC) continue; lastC = r.c; for (const [k, v] of Object.entries(r.locs)) (tracks[k] ||= []).push([r.c, r.t, r.f, ...v]); }
  for (const [k, tr] of Object.entries(tracks)) {
    let prev = tr[0]; const out = [];
    for (const x of tr) { if (x[3] !== prev[3] || x[4] !== prev[4]) out.push(`c${x[0]}f${x[2]}+${x[1] - prev[1]}:${x[3]},${x[4]}`); prev = x; }
    if (out.length >= 3) console.log(`  sprite ${k} from ${tr[0][3]},${tr[0][4]} (c${tr[0][0]}): ${out.slice(0, 40).join(' ')}`);
  }
}
process.exit(0);
