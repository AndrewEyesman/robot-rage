// Play a match between two port tabs (the arena dev page, index.html): one hosts as
// the test account's robot, the other joins as rival@home.lan's, as the lobby would
// leave them. Prints both frame scripts' states every second, then runs optional steps.
//
//   node port/tools/arena-match.mjs [app=http://127.0.0.1:8092]
//   RANKED=1 ...                        a ranked match (setrobotscore after each round)
//   STEP='client|__player.sendSprite(20, "damage", 100)|5000§host|@click:400,566|2000' ...
//
// A step is `host|client`, then JavaScript to evaluate in that tab or @press:<key>,
// @type:<text>, @click:<x>,<y> (stage pixels), @shot:<file>, then a wait in ms; steps
// are separated by §. Needs the test server's accounts tester@home.lan (robot 1003) and
// rival@home.lan (robot 1005), password rage2005.
//
// Two tabs of one browser draw on the same display refresh, so their 20 fps frames
// keep a fixed phase; the start sync (ready / ready ok, answered only between the
// sender's two alternating states) then sometimes never completes. Run again.
import { chromium } from 'playwright-core';

const [APP = 'http://127.0.0.1:8092'] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome-stable', headless: true,
  args: ['--headless=new', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=gl'],
});
const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
const open = async (name, url) => {
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
  await page.goto(url);
  return { name, page, logs };
};
const rank = process.env.RANKED ? '&ranked=1' : '';
const addr = `10.77.${(Math.random() * 250) | 0}.1`;
const host = await open('host', `${APP}/index.html?layout=original&match=host&opp=1005&addr=${addr}${rank}`);
await sleep(3000);
const client = await open('client', `${APP}/index.html?layout=original&match=client&host=${addr}&opp=1003&user=rival@home.lan&pass=rage2005${rank}`);
const state = (t) => t.page.evaluate(() => {
  const p = window.__player;
  if (!p?.movie) return document.title;
  const robot = (n) => {
    const r = p.sprite(n).scriptInstanceList.find((b) => b.InitRobot);
    return r && [String(r.state), Math.round(r.x), Math.round(r.y)];
  };
  const g = p.globals;
  return { movie: p.movie.name, frame: p.frame, fs: p.frameScript && String(p.frameScript.state), r10: robot(10), r20: robot(20), res: String(g.gMatchResult), won: g.gWonGames, lost: g.gLostGames };
});
const both = async (label) => console.log(label, JSON.stringify(await state(host)), '|', JSON.stringify(await state(client)));
for (let i = 0; i < 14; i++) {
  await sleep(1000);
  await both(`t${i}`);
}
for (const st of (process.env.STEP ?? '').split('§').filter(Boolean)) {
  const [who, code, wait] = st.split('|');
  const t = who === 'host' ? host : client;
  await t.page.bringToFront();
  let res;
  if (code.startsWith('@press:')) res = await t.page.keyboard.press(code.slice(7));
  else if (code.startsWith('@type:')) res = await t.page.keyboard.type(code.slice(6), { delay: 40 });
  else if (code.startsWith('@click:')) res = await t.page.mouse.click(...code.slice(7).split(',').map(Number));
  else if (code.startsWith('@shot:')) await t.page.screenshot({ path: code.slice(6) });
  else res = await t.page.evaluate(code);
  console.log('step', who, code.slice(0, 100), '=>', JSON.stringify(res)?.slice(0, 300));
  await sleep(Number(wait || 1000));
  await both('  ');
}
for (const t of [host, client]) console.log(`--- ${t.name}\n` + [...new Set(t.logs)].filter((l) => !l.startsWith('debug')).slice(0, 30).join('\n'));
await browser.close();
