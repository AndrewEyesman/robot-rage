// Evaluate Lingo expressions in dirplayer and print string() of each, to compare with
// port/web/src/lingo or with Adobe's player (tools/reference/refeval.sh).
//
//   node port/tools/lingo-probe.mjs [--server=8091] 'expr' ['expr' ...]
//   node port/tools/lingo-probe.mjs [--server=8091] - < expressions.txt   (one per line)
//
// Uses a test server (never 8090). No login: the loader movie is enough to evaluate.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

let port = '8091';
const exprs = [];
for (const a of process.argv.slice(2)) {
  if (a.startsWith('--server=')) port = a.slice(9);
  else if (a === '-') exprs.push(...readFileSync(0, 'utf8').split('\n').filter((l) => l.trim()));
  else exprs.push(a);
}
if (port === '8090') throw new Error('8090 is the shared server; use a test server');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: true, args: ['--headless=new'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await page.goto(`http://127.0.0.1:${port}/`);
await sleep(2000);
const box = await page.locator('canvas').first().boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
await sleep(15000);
for (const e of exprs) {
  const r = await page.evaluate(async (c) => JSON.parse(String(await window.__vm.mcp_eval_lingo(c))), `string(${e})`);
  console.log(`${e} => ${r.success ? String(r.result_value).replace(/^"(.*)"$/s, '$1') : 'ERROR ' + r.error}`);
}
await browser.close();
