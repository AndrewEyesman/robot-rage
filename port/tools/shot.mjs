// Screenshot the game's 800x600 stage in the port or in dirplayer, after optional
// clicks and typing, for side-by-side checks.
//
//   node port/tools/shot.mjs <port|dirplayer> <out.png> [steps...]
//
// Steps: wait:<ms>  click:<x>,<y>  type:<text>  key:<Key>  (stage coordinates)
//        eval:<js>  prints the value of a page expression (the port has window.__player)
// The port is http://127.0.0.1:8092/game.html (PORT_URL to override, e.g. with
// ?movie=login013_); dirplayer is the test server http://127.0.0.1:8091/ (never 8090).
import { chromium } from 'playwright-core';

const [target, out, ...steps] = process.argv.slice(2);
if (!target || !out) {
  console.error('usage: shot.mjs <port|dirplayer> <out.png> [wait:ms click:x,y type:text key:Key]...');
  process.exit(2);
}
const url = target === 'port' ? (process.env.PORT_URL ?? 'http://127.0.0.1:8092/game.html') : (process.env.DIRPLAYER_URL ?? 'http://127.0.0.1:8091/');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome-stable',
  headless: true,
  args: ['--headless=new', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=gl', '--autoplay-policy=no-user-gesture-required'],
});
const page = await (await browser.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 })).newPage();
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('response', (r) => {
  if (r.status() >= 400) console.log(`[http ${r.status()}] ${r.url()}`);
});
await page.goto(url);

// The stage's box on the page: the port fills the window; dirplayer draws in a canvas.
async function stageBox() {
  if (target === 'port') return { x: 0, y: 0, width: 800, height: 600 };
  const c = page.locator('canvas').first();
  await c.waitFor();
  return c.boundingBox();
}
if (target !== 'port') {
  await sleep(2000);
  const b = await stageBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}
for (const step of steps) {
  const [kind, arg = ''] = step.split(/:(.*)/s);
  const b = await stageBox();
  if (kind === 'wait') await sleep(Number(arg));
  else if (kind === 'click') {
    const [x, y] = arg.split(',').map(Number);
    await page.mouse.move(b.x + (x * b.width) / 800, b.y + (y * b.height) / 600);
    await sleep(80);
    await page.mouse.down();
    await sleep(120);
    await page.mouse.up();
    await sleep(250);
  } else if (kind === 'type') await page.keyboard.type(arg, { delay: 40 });
  else if (kind === 'key') await page.keyboard.press(arg);
  else if (kind === 'eval') console.log('eval:', await page.evaluate((code) => String((0, eval)(code)), arg));
}
const b = await stageBox();
await page.screenshot({ path: out, clip: { x: b.x, y: b.y, width: b.width, height: b.height } });
console.log('wrote', out);
await browser.close();
