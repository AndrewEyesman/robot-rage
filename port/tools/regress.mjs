// The port's regression suite: every behaviour in docs/port-behaviors.md that can be
// checked automatically, in one command. Run it before calling any change to shared
// code (port/web/src/director, s3d, lingo) done; a behaviour that stops working is a
// failure, not a side effect.
//
//   node port/tools/regress.mjs                  everything
//   node port/tools/regress.mjs login garage     only checks whose name contains a word
//   node port/tools/regress.mjs --fast           skip the slow tool checks
//   node port/tools/regress.mjs --approve        re-record the approved screenshots
//   node port/tools/regress.mjs --live           use the running dev server (8092) and test server (8091)
//
// By default the suite starts its own game server (a free port) on a fresh copy of the
// seed data in port/tools/regress-seed.json (accounts tester@home.lan / Crusher,
// rival@home.lan / Rival, lobbytest@home.lan / Lobbyist, regress@home.lan / Regress,
// all password rage2005) and its own dev server (another free port) talking to it, so every run
// starts from the same state and never touches 8091 or 8090. Both are stopped at the
// end.
//
// The lobby check uses its own account (regress@home.lan, robot "Regress", created on
// first run as a copy of Crusher) so it never collides with someone playing on the
// test accounts: the lobby refuses a nick that's already online.
//
// Screenshots are compared with approved ones in .cache/regress/approved/ (game art, so
// never committed): a check records its image the first time, and later fails when
// more than 0.5% of pixels differ by more than 24/255. Diffs go to .cache/regress/out/.
// Approve a deliberate change with --approve after looking at the diff.
import { chromium } from 'playwright-core';
import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args0 = process.argv.slice(2);
const live = args0.includes('--live');
/** A free TCP port (each run gets its own pair, so runs never collide). */
async function freePort() {
  const { createServer } = await import('node:net');
  return new Promise((done) => {
    const srv = createServer().listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => done(port));
    });
  });
}
const SERVER_PORT = live ? 8091 : await freePort();
const DEV_PORT = live ? 8092 : await freePort();
const APP = `http://127.0.0.1:${DEV_PORT}`;
const APPROVED = join(ROOT, '.cache/regress/approved');
const OUT = join(ROOT, '.cache/regress/out');
mkdirSync(APPROVED, { recursive: true });
mkdirSync(OUT, { recursive: true });

const args = args0;
const fast = args.includes('--fast');
const approve = args.includes('--approve');
const filters = args.filter((a) => !a.startsWith('--'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ the checks

const LOGIN = [
  ['click', 310, 148],
  ['expect', 'login tab', `p.frameLabel === 'login'`],
  ['click', 400, 222],
  ['type', 'tester@home.lan'],
  ['click', 400, 260],
  ['type', 'rage2005'],
  ['expect', 'password shows stars', `p.sprite(13).member.text === '********'`],
  ['click', 475, 309],
  ['expect', 'robot list loaded', `p.member('robotname1').text === 'Crusher'`, 15000],
  ['expect', 'no caret left in a label (the focus went with the password field)', `p.keyboardFocusSprite === -1 || p.isEditable(p.sprite(p.keyboardFocusSprite))`, 2000],
];
const TO_GARAGE = [
  ...LOGIN,
  ['click', 300, 235],
  ['expect', 'robot selected', `p.globals.gLobby.getaProp(sym('selectedid')) === 1`],
  ['click', 480, 375],
  ['expect', 'garage loaded', `p.movie.name === 'factory0604' && p.frameLabel === 'build'`, 25000],
  ['wait', 1500],
];

/** Each check: a command, or a flow of steps in a fresh browser context. */
const CHECKS = [
  { name: 'typecheck', cmd: ['npx', 'tsc', '--noEmit'], cwd: 'port/web' },
  { name: 'lingo-unit', cmd: ['npx', 'tsx', 'src/lingo/test.ts'], cwd: 'port/web' },
  { name: 'runtime-unit', cmd: ['node', 'port/tools/unit-tests.mjs', APP] },
  { name: 'multiuser', cmd: ['npx', 'tsx', '../tools/multiuser-test.mts', String(SERVER_PORT)], cwd: 'port/web' },
  { name: 'physics-trace', cmd: ['node', 'port/tools/physics-trace.mjs', String(SERVER_PORT), APP], slow: true },
  { name: 'check3d', cmd: ['node', 'port/tools/check3d.mjs', APP], slow: true },
  {
    name: 'loader-to-login',
    url: '/game.html',
    steps: [
      ['expect', 'login movie running', `p.movie.name === 'login013_' && p.frameLabel === 'create'`, 15000],
      ['wait', 800],
      ['shot', 'login-create'],
    ],
  },
  {
    name: 'login-robot-list',
    url: '/game.html',
    steps: [
      ['expect', 'login movie running', `p.movie.name === 'login013_'`, 15000],
      ['wait', 500],
      ...LOGIN,
      ['click', 300, 235],
      ['expect', 'robot selected', `p.globals.gLobby.getaProp(sym('selectedid')) === 1`],
      ['wait', 500],
      ['shot', 'robot-list-selected'],
      ['click', 350, 153],
      ['expect', 'settings tab', `p.frameLabel === 'settings'`],
      ['eval', `window.__chat = Number(p.globals.gCHat)`],
      ['click', 300, 237],
      ['expect', 'chat toggled', `Number(p.globals.gCHat) === 1 - window.__chat`],
    ],
  },
  {
    name: 'garage-preview',
    url: '/game.html',
    steps: [
      ['expect', 'login movie running', `p.movie.name === 'login013_'`, 15000],
      ['wait', 500],
      ...TO_GARAGE,
      ['eval', `p.sprite(6).visible = false`],
      ['wait', 100],
      ['shot', 'garage-workshop'],
      ['eval', `p.sprite(6).visible = true`],
      ['expect', 'zoom knob drawn above the rod', `(() => { const o = p.drawOrder().map((s) => s.spriteNum); return o.indexOf(21) > o.indexOf(18); })()`, 1000],
      ['down', 630, 300],
      ['expect', 'dragging the preview grabs the robot', `String(p.sprite(6).getProp('state')) === '#drag'`, 1000],
      ['up', 680, 300],
      ['eval', `window.__zoom = p.sprite(21).locH`],
      ['drag', 631, 425, 671, 425],
      ['expect', 'zoom knob drags', `p.sprite(21).locH > window.__zoom`, 1000],
    ],
  },
  // The garage (factory0604). Screenshots hide the spinning 3D preview (sprite 6): its
  // angle depends on timing. None of these leave through a door, so Crusher's saved
  // data stays as it is (the training door saves it unchanged).
  {
    name: 'garage-paintshop',
    url: '/game.html',
    steps: [
      ['expect', 'login movie running', `p.movie.name === 'login013_'`, 15000],
      ['wait', 500],
      ...TO_GARAGE,
      ['click', 175, 15],
      ['expect', 'paintshop opens', `p.frameLabel === 'paint'`, 3000],
      ['wait', 1500],
      ['eval', `window.__map = () => { const h = {}; for (const i of p.member('map1A').image.indices) h[i] = (h[i] || 0) + 1; return h; }`],
      ['expect', 'paint map is in the map palette (grey = index 178)', `(window.__map()[178] || 0) > 40000`, 1000],
      ['click', 215, 85],
      ['expect', 'palette picks the colour', `p.sprite(25).scriptInstanceList[0].foreColor.css === 'rgb(203,50,50)'`, 1000],
      ['click', 82, 142],
      ['click', 150, 450],
      ['expect', 'bucket fills the map', `(window.__map()[167] || 0) > 40000`, 1000],
      ['expect', 'painting marks the map to be saved', `p.globals.gUserData.getaProp(sym('propertyList')).getaProp(sym('saveMap')) === 1`, 500],
      ['click', 173, 82],
      ['expect', 'grid shows the chassis outline', `p.sprite(38).visible && p.sprite(38).member.name === 'ram 1'`, 1000],
      ['wait', 500],
      ['eval', `p.sprite(6).visible = false`],
      ['wait', 100],
      ['shot', 'garage-paintshop'],
      ['eval', `p.sprite(6).visible = true`],
      ['key', 'z'],
      ['expect', 'z undoes the fill', `(window.__map()[178] || 0) > 40000`, 1000],
    ],
  },
  {
    name: 'garage-buy',
    url: '/game.html',
    steps: [
      ['expect', 'login movie running', `p.movie.name === 'login013_'`, 15000],
      ['wait', 500],
      ...TO_GARAGE,
      ['click', 280, 15],
      ['expect', 'buy room opens, purchase box hidden', `p.frame === 101 && !p.sprite(313).visible`, 4000],
      ['wait', 1500],
      ['click', 80, 234],
      ['expect', 'Chassis category opens its first page', `p.frame === 104`, 3000],
      ['expect', 'its 3D wireframe is shown', `p.member('robotpre').model.count > 0`, 3000],
      ['click', 290, 495],
      ['expect', 'too few credits: the thanks box says so', `p.sprite(79).visible && /enough credits/.test(p.sprite(82).member.text)`, 2000],
      ['wait', 500],
      ['eval', `p.sprite(6).visible = false`],
      ['wait', 100],
      ['shot', 'garage-buy-nocredits'],
      ['eval', `p.sprite(6).visible = true`],
      ['click', 285, 429],
      ['click', 80, 219],
      ['click', 80, 309],
      ['expect', 'a release on the list opens that part (mouseUp goes under the pointer)', `p.frame === 151`, 3000],
    ],
  },
  {
    name: 'garage-parts-sell',
    url: '/game.html',
    steps: [
      ['expect', 'login movie running', `p.movie.name === 'login013_'`, 15000],
      ['wait', 500],
      ...TO_GARAGE,
      ['eval', `window.__pl = () => p.globals.gUserData.getaProp(sym('propertyList'))`],
      ['click', 360, 449],
      ['expect', 'Remove puts the plow in the inventory', `window.__pl().getaProp(sym('inventory')).count === 1 && p.sprite(147).member.name !== 'removebtn'`, 2000],
      ['wait', 500],
      ['click', 390, 15],
      ['expect', 'sell room opens', `p.frameLabel === 'sell'`, 4000],
      ['wait', 1500],
      ['click', 220, 110],
      ['expect', 'the part gets its sell box', `p.sprite(350).member.name === 'v6 sell' && p.sprite(351).member.name === 'sell btn'`, 3000],
      ['wait', 800],
      ['eval', `p.sprite(6).visible = false`],
      ['wait', 100],
      ['shot', 'garage-sell-plow'],
      ['eval', `p.sprite(6).visible = true`],
      ['click', 60, 15],
      ['expect', 'back in the workshop', `p.frameLabel === 'build'`, 4000],
      ['wait', 1500],
      ['click', 82, 145],
      ['expect', 'Use this part installs it at the back', `window.__pl().getaProp(sym('robotDescription')).getaProp(sym('vapen')).count === 2 && window.__pl().getaProp(sym('robotDescription')).getaProp(sym('wpnPos')).getAt(2) === sym('b')`, 2000],
    ],
  },
  {
    name: 'garage-tabs-doors',
    url: '/game.html',
    steps: [
      ['expect', 'login movie running', `p.movie.name === 'login013_'`, 15000],
      ['wait', 500],
      ...TO_GARAGE,
      ['click', 589, 185],
      ['expect', 'STATS tab (through its label) shows the stats', `p.sprite(98).locV === 210 && /Crusher/.test(p.sprite(98).member.text)`, 2000],
      ['click', 730, 192],
      ['expect', 'HIGHSCORE tab loads the list', `p.sprite(99).locV === 310 && /Crusher/.test(p.member('highscores').text)`, 6000],
      ['click', 731, 501],
      ['expect', 'TRAINING door goes to the arena', `p.movie?.name === 'arena104'`, 20000],
    ],
  },
  {
    name: 'training',
    url: '/index.html?layout=original&parts=r1,h2,ma1,b1,v6&pos=f&pansar=50&name=Crusher',
    steps: [
      ['expect', 'robot ready', `String(p.sprite(10).getProp('state')) === '#move'`, 20000],
      ['eval', `window.__y = p.sprite(10).getProp('y')`],
      ['hold', 'ArrowUp', 1500],
      ['expect', 'robot drives forward', `p.sprite(10).getProp('y') !== window.__y`, 2000],
      ['expect', 'no ambient wind', `!Array.from({ length: 8 }, (_, i) => i + 1).some((n) => { const m = window.__sound?.(n)?.member; return m && m.name === 'ambient sound'; })`, 500],
    ],
  },
  {
    name: 'lobby-entry',
    url: '/lobby-dev.html?email=regress@home.lan&password=rage2005&robot=Regress',
    setup: ensureRegressAccount,
    steps: [['expect', 'lobby reached the country list', `p.movie.name === 'lobby060_' && p.frame >= 10`, 30000], ['wait', 1000], ['shot', 'lobby-countries']],
  },
  { name: 'match-input-delay', match: true, slow: true },
];

// ------------------------------------------------------------------ setup

async function mainAsp(fields) {
  const r = await fetch(`${APP}/api/main.asp`, { method: 'POST', body: new URLSearchParams(fields) });
  return r.text();
}

/** The value of `#key: ...` in a Lingo property list literal (balanced brackets, quotes skipped). */
function lingoField(text, key) {
  const at = text.search(new RegExp(`#${key}:\\s*`, 'i'));
  if (at < 0) return undefined;
  let i = text.indexOf(':', at) + 1;
  while (text[i] === ' ') i++;
  const start = i;
  let depth = 0;
  let quoted = false;
  for (; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === '[') depth++;
    else if (c === ']') {
      if (depth === 0) break;
      depth--;
    } else if (c === ',' && depth === 0) break;
  }
  return text.slice(start, i).trim();
}

/** regress@home.lan with a saved robot "Regress" (a copy of Crusher's data and paint map). */
async function ensureRegressAccount() {
  const email = 'regress@home.lan';
  let login = await mainAsp({ action: 'loginmember', membername: email, password: 'rage2005' });
  if (lingoField(login, 'err') !== '0') {
    await mainAsp({ action: 'createmember', membername: email, password: 'rage2005' });
    login = await mainAsp({ action: 'loginmember', membername: email, password: 'rage2005' });
  }
  const sid = JSON.parse(lingoField(login, 'sid'));
  let robots = await mainAsp({ action: 'getmyrobots', sessionid: sid });
  if (!/robotname: "Regress"/.test(robots)) {
    await mainAsp({ action: 'createrobot', robotname: 'Regress', sessionid: sid });
    robots = await mainAsp({ action: 'getmyrobots', sessionid: sid });
  }
  const id = Number(robots.match(/#robotid: (\d+), #robotname: "Regress"/)[1]);
  const mine = await mainAsp({ action: 'getrobot', robotid: id, sessionid: sid });
  if (lingoField(mine, 'propertyList') && lingoField(mine, 'propertyList') !== '0') return;
  const a = JSON.parse(lingoField(await mainAsp({ action: 'loginmember', membername: 'tester@home.lan', password: 'rage2005' }), 'sid'));
  const crusher = await mainAsp({ action: 'getrobot', robotid: 1003, sessionid: a });
  const map = await mainAsp({ action: 'getrobotmap', robotid: 1003, sessionid: a });
  await mainAsp({ action: 'setrobot', robotid: id, sessionid: sid, proplist: lingoField(crusher, 'propertyList') });
  await mainAsp({ action: 'setrobotmap', robotid: id, sessionid: sid, map });
}

// ------------------------------------------------------------------ running

function run(cmd, cwd, timeout = 600000) {
  return new Promise((done) => {
    const child = spawn(cmd[0], cmd.slice(1), { cwd: join(ROOT, cwd ?? '.'), env: process.env });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    const timer = setTimeout(() => child.kill('SIGKILL'), timeout);
    child.on('close', (code) => {
      clearTimeout(timer);
      done({ ok: code === 0, out: out.replace(/^.*(fnm|Node\.js path|shell profile|our documentation).*\n?/gm, '') });
    });
  });
}

function compare(name, file) {
  const approved = join(APPROVED, `${name}.png`);
  if (approve || !existsSync(approved)) {
    copyFileSync(file, approved);
    return { ok: true, note: approve ? 'approved' : 'recorded (first run)' };
  }
  const py = `
from PIL import Image, ImageChops
import sys
a = Image.open(sys.argv[1]).convert('RGB'); b = Image.open(sys.argv[2]).convert('RGB')
if a.size != b.size: print('size'); sys.exit(0)
d = ImageChops.difference(a, b).convert('L')
bad = sum(1 for v in d.getdata() if v > 24)
d.point(lambda v: 255 if v > 24 else 0).save(sys.argv[3])
print(bad / (a.size[0] * a.size[1]))`;
  return new Promise((done) => {
    execFile('python3', ['-I', '-c', py, approved, file, join(OUT, `${name}-diff.png`)], (err, stdout) => {
      const v = stdout.trim();
      if (err || v === 'size') return done({ ok: false, note: err ? String(err) : 'size differs' });
      const frac = Number(v);
      done({ ok: frac <= 0.005, note: `${(frac * 100).toFixed(2)}% pixels differ` });
    });
  });
}

let browser;
async function flow(check) {
  browser ??= await chromium.launch({
    executablePath: '/usr/bin/google-chrome-stable',
    headless: true,
    args: ['--headless=new', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=gl', '--autoplay-policy=no-user-gesture-required'],
  });
  const ctx = await browser.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && /script error|TypeError|ReferenceError/.test(m.text())) errors.push(m.text().slice(0, 300));
  });
  const lines = [];
  let ok = true;
  try {
    await check.setup?.();
    await page.goto(APP + check.url);
    await page.waitForFunction(() => window.__player, null, { timeout: 15000 });
    await page.evaluate(async () => {
      const d = await import('/src/director/index.ts');
      window.__sound = d.sound;
      window.__sym = (await import('/src/lingo/index.ts')).sym;
    });
    const ev = (expr) => page.evaluate((e) => {
      const p = window.__player;
      const sym = window.__sym;
      void p, sym;
      return eval(e);
    }, expr);
    for (const step of check.steps) {
      const [kind, ...a] = step;
      if (kind === 'wait') await sleep(a[0]);
      else if (kind === 'click' || kind === 'down' || kind === 'up') {
        await page.mouse.move(a[0], a[1]);
        await sleep(60);
        if (kind !== 'up') await page.mouse.down();
        if (kind === 'click') await sleep(100);
        if (kind !== 'down') await page.mouse.up();
        await sleep(250);
      } else if (kind === 'drag') {
        await page.mouse.move(a[0], a[1]);
        await page.mouse.down();
        for (let i = 1; i <= 8; i++) {
          await page.mouse.move(a[0] + ((a[2] - a[0]) * i) / 8, a[1] + ((a[3] - a[1]) * i) / 8);
          await sleep(60);
        }
        await page.mouse.up();
        await sleep(250);
      } else if (kind === 'type') await page.keyboard.type(a[0], { delay: 40 });
      else if (kind === 'key') await page.keyboard.press(a[0]);
      else if (kind === 'hold') {
        await page.keyboard.down(a[0]);
        await sleep(a[1]);
        await page.keyboard.up(a[0]);
      } else if (kind === 'eval') await ev(a[0]);
      else if (kind === 'expect') {
        const [label, expr, timeout = 5000] = a;
        const until = Date.now() + timeout;
        let got = false;
        let last;
        while (Date.now() < until) {
          try {
            got = !!(await ev(expr));
          } catch (e) {
            last = e.message.split('\n')[0];
          }
          if (got) break;
          await sleep(150);
        }
        lines.push(`  ${got ? 'ok  ' : 'FAIL'} ${label}${got || !last ? '' : ` (${last})`}`);
        if (!got) {
          ok = false;
          await page.screenshot({ path: join(OUT, `${check.name}-failed.png`) });
          break;
        }
      } else if (kind === 'shot') {
        const file = join(OUT, `${a[0]}.png`);
        await page.screenshot({ path: file });
        const r = await compare(a[0], file);
        lines.push(`  ${r.ok ? 'ok  ' : 'FAIL'} screenshot ${a[0]}: ${r.note}`);
        if (!r.ok) ok = false;
      }
    }
  } catch (e) {
    ok = false;
    lines.push(`  FAIL ${e.message.split('\n')[0]}`);
  }
  if (errors.length) lines.push(...errors.slice(0, 5).map((e) => `  (page error) ${e}`));
  // A fresh browser per flow: after several garage and arena pages (WebGL contexts) a
  // long-lived one died mid-run and failed the remaining checks instantly.
  await browser.close().catch(() => {});
  browser = undefined;
  return { ok, out: lines.join('\n') };
}

/** A two-tab match, read the input delay (docs/port-issues.md #36); retried for the start-sync hang (#1). */
async function match() {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const r = await run(['node', 'port/tools/arena-match.mjs', APP], '.', 150000);
    const m = r.out.match(/step host .*gdelay\) => "([^"]*)"/);
    // No number: the match never got past the start sync (#1); try again.
    if (m && m[1] !== '' && Number.isFinite(Number(m[1]))) {
      const d = Number(m[1]);
      return { ok: d < 5, out: `  ${d < 5 ? 'ok  ' : 'FAIL'} host input delay ${d} ms (attempt ${attempt})` };
    }
  }
  return { ok: false, out: '  FAIL the match never started in 5 attempts (start-sync hang, #1)' };
}
process.env.STEP = 'host|0|3000§host|String(__player.globals.gdelay)|300';

// ------------------------------------------------------------------ fixture

const children = [];
async function waitFor(url, ms = 60000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      // not up yet
    }
    await sleep(300);
  }
  throw new Error(`${url} didn't come up`);
}

async function startFixture() {
  const { mkdtempSync, symlinkSync, writeFileSync, readFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'rr-regress-'));
  mkdirSync(join(dir, 'data'));
  writeFileSync(join(dir, 'data/db.json'), readFileSync(join(ROOT, 'port/tools/regress-seed.json')));
  mkdirSync(join(dir, 'public'));
  // The game files and dirplayer (for the checks that compare with the original), and
  // a copy of the page (the test server's own symlinked page edited 8090's once).
  symlinkSync(join(ROOT, 'public/game'), join(dir, 'public/game'));
  symlinkSync(join(ROOT, 'public/dirplayer'), join(dir, 'public/dirplayer'));
  copyFileSync(join(ROOT, 'public/index.html'), join(dir, 'public/index.html'));
  const env = { ...process.env, PORT: String(SERVER_PORT), DATA_DIR: join(dir, 'data'), PUBLIC_DIR: join(dir, 'public') };
  children.push(spawn('node', ['server/index.mjs'], { cwd: ROOT, env, stdio: 'ignore' }));
  await waitFor(`http://127.0.0.1:${SERVER_PORT}/game/main.ini`);
  children.push(
    spawn('npx', ['vite', '--port', String(DEV_PORT), '--strictPort'], { cwd: join(ROOT, 'port/web'), env: { ...process.env, RR_SERVER: `http://127.0.0.1:${SERVER_PORT}` }, stdio: 'ignore' }),
  );
  await waitFor(`${APP}/game.html`);
  await waitFor(`${APP}/game/main.ini`);
  console.log(`fixture: game server :${SERVER_PORT} (${dir}), dev server ${APP}\n`);
}

function stopFixture() {
  for (const c of children) c.kill('SIGTERM');
}
process.on('exit', stopFixture);
process.on('SIGINT', () => process.exit(130));

const selected = CHECKS.filter((c) => (!filters.length || filters.some((f) => c.name.includes(f))) && !(fast && c.slow));
if (!live) await startFixture();
let failed = 0;
for (const c of selected) {
  const t0 = Date.now();
  const r = c.cmd ? await run(c.cmd, c.cwd) : c.match ? await match() : await flow(c);
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`${r.ok ? 'PASS' : 'FAIL'} ${c.name} (${secs}s)`);
  if (!r.ok || c.steps || c.match) {
    const text = c.cmd && !r.ok ? r.out.trim().split('\n').slice(-15).map((l) => '  ' + l).join('\n') : r.out;
    if (text.trim()) console.log(text);
  }
  if (!r.ok) failed++;
}
await browser?.close();
console.log(failed ? `\n${failed} of ${selected.length} checks failed` : `\nall ${selected.length} checks passed`);
process.exit(failed ? 1 : 0);
