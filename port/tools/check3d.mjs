// Check the Shockwave 3D API against the arena demo: the demo (demo.html, verified
// against Adobe's player) and check3d.html (the arena movie's 3D sprite, its world
// built by the translated BuildWorld and the robot by the translated BuildRobot) are
// posed identically, screenshotted and compared pixel by pixel. Particles (random) are
// hidden for the comparison and shown in a second, by-eye pair.
//
//   node port/tools/check3d.mjs [app=http://127.0.0.1:8092] [parts=r1,h2,ma1,b1,v6] [pos=f]
//
// Writes .playwright-mcp/check3d-{demo,api,diff}.png (+ -particles pairs). Exits non-zero
// when more than 0.5% of the view's pixels differ by more than 24/255.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const [app = 'http://127.0.0.1:8092', parts = 'r1,h2,ma1,b1,v6', pos = 'f'] = process.argv.slice(2);
const out = new URL('../../.playwright-mcp/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VIEW = { x: 27, y: 9, width: 750, height: 449 };

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome-stable', headless: true,
  args: ['--headless=new', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=gl'],
});
const ctx = await browser.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });

const demo = await ctx.newPage();
demo.on('pageerror', (e) => console.error('demo:', e.message));
await demo.goto(`${app}/demo.html?layout=original&parts=${parts}&pos=${pos}`);
await demo.addStyleTag({ content: '#info { display: none !important; }' });
await sleep(4000);
const state = await demo.evaluate(() => {
  const p = window.__port;
  return {
    pose: p.robot.pose(),
    cam: { pos: p.camera3d.position.toArray(), target: p.follow.target.toArray(), fov: p.camera3d.fov },
  };
});
console.log('pose', JSON.stringify(state));

const api = await ctx.newPage();
const warnings = [];
api.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && warnings.push(m.text()));
api.on('pageerror', (e) => console.error('check3d:', e.message));
await api.goto(`${app}/check3d.html?parts=${parts}&pos=${pos}`);
await api.waitForFunction(() => document.title.includes('ready') || document.title.startsWith('error'), null, { timeout: 30000 });
if ((await api.title()).startsWith('error')) throw new Error(await api.title());
await api.evaluate((s) => window.__check.pose(s.pose, s.cam), state);

async function shots(tag, particles) {
  await demo.evaluate((on) => {
    window.__port.pit.smoke.mesh.visible = on;
    window.__port.pit.fire.mesh.visible = on;
  }, particles);
  await api.evaluate((on) => window.__check.particles(on), particles);
  await sleep(800);
  const a = await demo.screenshot({ clip: VIEW });
  const b = await api.screenshot({ clip: VIEW });
  writeFileSync(`${out}check3d-demo${tag}.png`, a);
  writeFileSync(`${out}check3d-api${tag}.png`, b);
  return [a, b];
}

const [a, b] = await shots('', false);
await shots('-particles', true);

// More views with a fixed camera: the robot from the front-left, and the fire pit.
const views = {
  side: { pos: [6600, -250, 5300], target: [6000, -450, 6000], fov: 60 },
  pit: { pos: [-3300, -400, 6900], target: [-4800, -600, 4800], fov: 60 },
};
const extra = [];
for (const [tag, cam] of Object.entries(views)) {
  await demo.evaluate((c) => {
    const p = window.__port;
    p.follow.apply = (camera) => {
      camera.position.set(...c.pos);
      camera.up.set(0, 1, 0);
      camera.lookAt(...c.target);
    };
  }, cam);
  await api.evaluate((s) => window.__check.pose(s.pose, s.cam), { pose: state.pose, cam });
  extra.push([tag, await shots(`-${tag}`, false)]);
  await shots(`-${tag}-particles`, true);
}

// Compare in the browser (no PNG decoder needed in Node).
const compare = (a, b) => api.evaluate(async ([a64, b64]) => {
  const load = async (s) => createImageBitmap(await (await fetch(`data:image/png;base64,${s}`)).blob());
  const [ia, ib] = await Promise.all([load(a64), load(b64)]);
  const c = new OffscreenCanvas(ia.width, ia.height);
  const g = c.getContext('2d');
  g.drawImage(ia, 0, 0);
  const da = g.getImageData(0, 0, c.width, c.height).data;
  g.drawImage(ib, 0, 0);
  const db = g.getImageData(0, 0, c.width, c.height).data;
  const diff = g.createImageData(c.width, c.height);
  let sum = 0, big = 0;
  for (let i = 0; i < da.length; i += 4) {
    const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
    sum += d;
    if (d > 24) big++;
    diff.data[i] = diff.data[i + 1] = diff.data[i + 2] = Math.min(255, d * 4);
    diff.data[i + 3] = 255;
  }
  g.putImageData(diff, 0, 0);
  const png = await c.convertToBlob({ type: 'image/png' });
  const bytes = new Uint8Array(await png.arrayBuffer());
  let bin = '';
  for (const x of bytes) bin += String.fromCharCode(x);
  const n = da.length / 4;
  return { mean: sum / n, bigPct: (100 * big) / n, diff: btoa(bin) };
}, [a.toString('base64'), b.toString('base64')]);
let worst = 0;
for (const [tag, [x, y]] of [['', [a, b]], ...extra]) {
  const stats = await compare(x, y);
  writeFileSync(`${out}check3d-diff${tag ? '-' + tag : ''}.png`, Buffer.from(stats.diff, 'base64'));
  console.log(`${tag || 'follow'}: mean difference ${stats.mean.toFixed(2)}/255, ${stats.bigPct.toFixed(3)}% of pixels differ by more than 24/255`);
  worst = Math.max(worst, stats.bigPct);
}
console.log('models:', (await api.evaluate(() => window.__check.models())).filter((m) => /1\b|1 |rot|dummy|camgrp/.test(m)).join(' | '));
if (warnings.length) console.log('check3d console:', [...new Set(warnings)].slice(0, 20).join('\n  '));
await browser.close();
process.exit(worst > 0.5 ? 1 : 0);
