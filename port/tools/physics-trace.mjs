// Check the port's driving against the game's own Lingo: drive the original robot
// behavior in dirplayer tick by tick, then the port's translation with the same keys,
// and compare their state after every tick.
//
//   node port/tools/physics-trace.mjs [server=8091] [port app=http://127.0.0.1:8092]
//   ROUND=1 node port/tools/physics-trace.mjs   (the port rounding sprite locations as Adobe's player does)
//
// dirplayer logs in to a test server (never 8090) as the test account, enters
// Training, pauses the movie and, for each tick of schedule.mjs, sends the robot its
// keys and one prepareFrame. The port runs the translated arena movie (index.html, the
// arena in the Director runtime) with the same robot (parts from the server's robot
// data, passed in the URL), pauses the player and does the same with sprite 10's robot
// behavior. Exits non-zero on a mismatch.
import { chromium } from 'playwright-core';
import { SCHEDULE } from './schedule.mjs';

const [port = '8091', app = 'http://127.0.0.1:8092'] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome-stable', headless: true,
  args: ['--headless=new', '--mute-audio', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=gl'],
});
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const lingo = (code) => page.evaluate(async (c) => {
  const r = JSON.parse(String(await window.__vm.mcp_eval_lingo(c)));
  return r.success ? String(r.result_value) : 'ERR ' + r.error;
}, code).then((v) => v.replace(/^"(.*)"$/s, '$1'));
await page.goto(`http://127.0.0.1:${port}/`);
await sleep(2000);
const canvas = page.locator('canvas').first();
let box = await canvas.boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
await sleep(15000);
box = await canvas.boundingBox();
const click = async (x, y) => {
  await page.mouse.move(box.x + (x * box.width) / 800, box.y + (y * box.height) / 600);
  await sleep(100); await page.mouse.down(); await sleep(120); await page.mouse.up(); await sleep(300);
};
const type = (t) => page.keyboard.type(t, { delay: 30 });
await click(480, 222); await type('tester@home.lan');
await click(400, 260); await type('rage2005');
await click(475, 309); await sleep(6000);
await click(395, 235); await sleep(1500);
await click(480, 375); await sleep(15000);
await click(731, 501);
for (let i = 0; i < 60; i++) {
  await sleep(1000);
  if ((await lingo('string(sprite(10).state)')) === 'move') break;
}
console.log('robot state', await lingo('string(sprite(10).state)'));
await page.evaluate(() => window.__vm.stop());
await sleep(500);
await lingo('sendSprite(10, #InitRobot)');
await lingo('sprite(10).loc = point(1500, 500)');
await lingo('sprite(10).rotation = 270');
const rd = await lingo('string(gUserData.propertyList.robotDescription)');
const pansar = await lingo('string(gUserData.propertyList.pansar)');
const read = 'string([sprite(10).x, sprite(10).y, sprite(10).angle, sprite(10).speed, sprite(10).dx, sprite(10).dy, sprite(10).torque, sprite(10).locH, sprite(10).locV, sprite(10).state])';
const trace = [];
let last = '00000000';
for (const map of SCHEDULE) {
  if (map !== last) { await lingo(`sendSprite(10, #keyPressed, "${map}", -100000)`); last = map; }
  await lingo('sendSprite(10, #prepareFrame)');
  trace.push(await lingo(read));
}
const emu = trace.map((s) => {
  const p = s.replace(/^\[|\]$/g, '').split(',').map((x) => x.trim());
  return [...p.slice(0, 9).map(Number), p[9].replace('#', '')];
});

// The port, with the same robot and keys.
const ids = [...rd.matchAll(/#(\w+)/g)].map((m) => m[1]).filter((id) => /^[a-z]+\d+$/.test(id));
const pos = (rd.match(/#wpnPos: \[([^\]]*)\]/)?.[1] ?? '').replace(/[#\s]/g, '');
const wpn = new Set(pos.split(','));
const partIds = ids.filter((id) => !wpn.has(id));
await page.goto(`${app}/index.html?parts=${partIds.join(',')}&pos=${pos}&pansar=${pansar}&layout=original`);
await page.waitForFunction(() => document.title.includes('ready') || document.title.startsWith('error'), null, { timeout: 30000 });
// Training's robot is sprite 10's "robot behavior" (movies/arena104/s003-robot-behavior.ts).
await page.waitForFunction(() => String(window.__player.sprite(10).getProp('state')) === '#move', null, { timeout: 30000 });
const ported = await page.evaluate(({ schedule, truncate }) => {
  const p = window.__player;
  p.paused = true;
  const spr = p.sprite(10);
  // dirplayer truncates fractional sprite locations where Adobe's player rounds them
  // (director/sprite.ts); compare like with like.
  spr.constructor.truncate = truncate;
  const r = spr.scriptInstanceList.find((b) => typeof b.InitRobot === 'function');
  r.InitRobot();
  spr.locH = 1500;
  spr.locV = 500;
  spr.rotation = 270;
  const f = (v) => Number(v.toFixed(4));
  const out = [];
  let last = '00000000';
  for (const m of schedule) {
    if (m !== last) { r.keyPressed(m, -100000); last = m; }
    r.prepareFrame();
    out.push([f(r.x), f(r.y), f(r.angle), f(r.speed), f(r.dx), f(r.dy), f(r.torque), spr.locH, spr.locV, String(r.state).replace('#', '')]);
  }
  return out;
}, { schedule: SCHEDULE, truncate: !process.env.ROUND });
await browser.close();

const names = ['x', 'y', 'angle', 'speed', 'dx', 'dy', 'torque', 'locH', 'locV', 'state'];
for (let i = 0; i < emu.length; i++) {
  // With ROUND=1 the sprite locations legitimately differ by a pixel; compare the rest.
  const bad = names.filter((n, k) => (process.env.ROUND && (n === 'locH' || n === 'locV') ? false : k < 9 ? !(Math.abs(emu[i][k] - ported[i][k]) <= 2e-4) : emu[i][k] !== ported[i][k]));
  if (bad.length) {
    console.log(`MISMATCH at tick ${i}: ${bad.join(', ')}\n  original ${JSON.stringify(emu[i])}\n  port     ${JSON.stringify(ported[i])}`);
    process.exit(1);
  }
}
console.log(`match: ${emu.length} ticks identical (robot ${partIds.join(',')} ${pos}, armour ${pansar})`);
