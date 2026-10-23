// Paired tour: the same steps on the reference player (Adobe's projector under Wine,
// tools/reference/refctl.sh) and on dirplayer (Chrome with the GPU, at 125%
// display scaling), with an 800x600 stage screenshot of each at every checkpoint.
//
//   node tools/reference/tour.mjs <outdir> [port=8091] [only=ref|emu]
//
// Both log in as the test account, one after the other, against a test server
// (never 8090). The reference must be at its login screen (ref-start.sh).
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [outdir, port = '8091', only] = process.argv.slice(2);
fs.mkdirSync(outdir, { recursive: true });
const REFCTL = path.join(path.dirname(new URL(import.meta.url).pathname), 'refctl.sh');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Steps in stage coordinates. `shot` names a checkpoint.
export const STEPS = [
  { wait: 1000, shot: '01-login' },
  { click: [480, 222] }, { type: 'tester@home.lan' }, { click: [400, 260] }, { type: 'rage2005' },
  { click: [475, 309] }, { wait: 6000, shot: '02-robot-list' },
  { click: [395, 235] }, { wait: 1500, shot: '03-robot-selected' },
  { click: [480, 375] }, { wait: 15000, shot: '04-garage-workshop' },
  { click: [600, 195] }, { wait: 2500, shot: '05-garage-stats' },
  { click: [720, 195] }, { wait: 2500, shot: '06-garage-highscore' },
  { click: [530, 195] }, { wait: 1500 },
  { click: [170, 14] }, { wait: 5000, shot: '07-paintshop' },
  { click: [280, 14] }, { wait: 5000, shot: '08-buy' },
  { click: [100, 217] }, { click: [100, 232] }, { wait: 3000 }, { move: [100, 355] }, { wait: 800, shot: '09-buy-chassis' },
  { click: [390, 14] }, { wait: 5000, shot: '10-sell' },
  { click: [60, 14] }, { wait: 5000, shot: '11-workshop-again' },
  { click: [731, 501] }, { wait: 20000, shot: '12-arena-start' },
  { keyhold: ['Up', 1500] }, { wait: 500, shot: '13-arena-forward' },
  { keyhold: ['Left', 800] }, { wait: 500, shot: '14-arena-turn' },
  { key: '2' }, { wait: 800, shot: '15-arena-cam2' },
  { key: '3' }, { wait: 800, shot: '16-arena-cam3' },
  { key: '1' }, { wait: 800, shot: '17-arena-cam1' },
];

const XKEY = { Up: 'Up', Down: 'Down', Left: 'Left', Right: 'Right' };
const PWKEY = { Up: 'ArrowUp', Down: 'ArrowDown', Left: 'ArrowLeft', Right: 'ArrowRight' };

async function runRef() {
  const ref = (...a) => execFileSync(REFCTL, a.map(String), { stdio: ['ignore', 'pipe', 'inherit'] });
  for (const s of STEPS) {
    if (s.click) ref('click', ...s.click);
    if (s.move) ref('move', ...s.move);
    if (s.type) ref('type', s.type);
    if (s.key) ref('key', s.key);
    if (s.keyhold) ref('key', XKEY[s.keyhold[0]] || s.keyhold[0], s.keyhold[1]);
    if (s.wait) await sleep(s.wait);
    if (s.shot) ref('shot', path.join(outdir, `${s.shot}.ref.png`));
  }
}

async function runEmu() {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome-stable', headless: true,
    args: ['--headless=new', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=gl'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1.25 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message.slice(0, 300)));
  page.on('dialog', (d) => { errors.push('DIALOG ' + d.message()); d.accept().catch(() => {}); });
  await page.goto(`http://127.0.0.1:${port}/`);
  await sleep(2000);
  const canvas = page.locator('canvas').first();
  let box = await canvas.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); // the click-to-play gate
  await sleep(15000);
  box = await canvas.boundingBox();
  const sx = box.width / 800, sy = box.height / 600;
  const at = (x, y) => page.mouse.move(box.x + x * sx, box.y + y * sy);
  for (const s of STEPS) {
    if (s.click) { await at(...s.click); await sleep(100); await page.mouse.down(); await sleep(120); await page.mouse.up(); await sleep(300); }
    if (s.move) await at(...s.move);
    if (s.type) await page.keyboard.type(s.type, { delay: 40 });
    if (s.key) await page.keyboard.press(s.key);
    if (s.keyhold) { const k = PWKEY[s.keyhold[0]] || s.keyhold[0]; await page.keyboard.down(k); await sleep(s.keyhold[1]); await page.keyboard.up(k); }
    if (s.wait) await sleep(s.wait);
    if (s.shot) await page.screenshot({ path: path.join(outdir, `${s.shot}.emu.png`), clip: box });
  }
  fs.writeFileSync(path.join(outdir, 'emu-errors.txt'), errors.join('\n'));
  await browser.close();
}

if (only !== 'emu') await runRef();
if (only !== 'ref') await runEmu();
console.log('tour done:', outdir);
