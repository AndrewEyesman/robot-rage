// Long-lived dirplayer session in Chrome (GPU, device scale 1.25), controlled over HTTP,
// for probing one screen at a time next to the reference player.
//   node tools/reference/emu-driver.mjs [port=8091] [listen=8774]
//   curl 'localhost:8774/login'            log in and stop at the robot list
//   curl 'localhost:8774/click?x=&y='       stage coordinates
//   curl 'localhost:8774/key?k=ArrowUp&ms=800'   curl 'localhost:8774/type?text='
//   curl --data-urlencode 'code=string(the frame)' 'localhost:8774/eval'
//   curl 'localhost:8774/shot?name=/tmp/x.png'   800x600 stage
//   curl 'localhost:8774/quit'
import { chromium } from 'playwright-core';
import http from 'node:http';
const [port = '8091', listen = '8774'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: true,
  args: ['--headless=new', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=gl'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1.25 });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => { logs.push(m.type() + ' ' + m.text().slice(0, 300)); if (logs.length > 500) logs.shift(); });
page.on('dialog', (d) => { logs.push('DIALOG ' + d.message()); d.accept().catch(() => {}); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let box;
const stage = async () => (box = await page.locator('canvas').first().boundingBox());
const at = async (x, y) => { const b = await stage(); await page.mouse.move(b.x + x * b.width / 800, b.y + y * b.height / 600); };
const click = async (x, y) => { await at(x, y); await sleep(100); await page.mouse.down(); await sleep(120); await page.mouse.up(); await sleep(300); };
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  let body = ''; for await (const c of req) body += c;
  const p = { ...Object.fromEntries(u.searchParams), ...Object.fromEntries(new URLSearchParams(body)) };
  try {
    let out = 'ok';
    switch (u.pathname) {
      case '/login':
        await page.goto(`http://127.0.0.1:${port}/`); await sleep(2000);
        { const b = await stage(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); }
        await sleep(15000);
        await click(480, 222); await page.keyboard.type('tester@home.lan', { delay: 30 });
        await click(400, 260); await page.keyboard.type('rage2005', { delay: 30 });
        await click(475, 309); await sleep(6000); break;
      case '/click': await click(+p.x, +p.y); break;
      case '/move': await at(+p.x, +p.y); break;
      case '/type': await page.keyboard.type(p.text, { delay: 40 }); break;
      case '/key': if (p.ms) { await page.keyboard.down(p.k); await sleep(+p.ms); await page.keyboard.up(p.k); } else await page.keyboard.press(p.k); break;
      case '/eval': out = await page.evaluate(async (c) => { const r = JSON.parse(String(await window.__vm.mcp_eval_lingo(c))); return r.success ? String(r.result_value) : 'ERR ' + r.error; }, p.code); break;
      case '/shot': await page.screenshot({ path: p.name, clip: await stage() }); break;
      case '/logs': out = logs.slice(-(+(p.n || 40))).join('\n'); break;
      case '/quit': res.end('bye\n'); await browser.close(); process.exit(0);
      default: out = 'unknown';
    }
    res.end(out + '\n');
  } catch (e) { res.end('ERR ' + e.message + '\n'); }
}).listen(+listen, '127.0.0.1', () => console.log('emu driver on', listen));
