// The Director runtime's unit tests (port/web/src/director/tests/), run in headless
// Chrome: the runtime needs a real canvas, fonts and images. Each test pins one rule
// the game depends on and says where the rule comes from.
//
//   node port/tools/unit-tests.mjs                        every test
//   node port/tools/unit-tests.mjs input                  only tests whose area or name contains "input"
//   node port/tools/unit-tests.mjs http://127.0.0.1:8094  against another dev server
//   UNIT_SKIP="text layout" node port/tools/unit-tests.mjs   all but the tests whose area or name
//     contains it (CI, which has no extracted fonts; also through regress.mjs)
//
// Needs a dev server (http://127.0.0.1:8092 by default, `cd port/web && npm run dev`;
// an http URL argument or APP picks another). No game server is needed. Exit status 1
// when a test fails. Known failures (Director does something the runtime doesn't yet)
// are listed but don't fail the run; one that starts passing is reported so its mark
// can be removed.
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const APP = args.find((a) => /^https?:/.test(a)) ?? process.env.APP ?? 'http://127.0.0.1:8092';
const only = args.find((a) => !/^https?:/.test(a));
const skip = process.env.UNIT_SKIP;
const query = new URLSearchParams({ ...(only && { only }), ...(skip && { skip }) }).toString();
const t0 = Date.now();

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: true, args: ['--headless=new', '--mute-audio'] });
let code = 0;
try {
  const page = await (await browser.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 })).newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto(`${APP}/tests.html${query ? `?${query}` : ''}`);
  await page.waitForFunction(() => window.__unitResults, null, { timeout: 60000, polling: 100 });
  const res = await page.evaluate(() => window.__unitResults);
  if (res.error) {
    console.log(`FAIL the test page didn't run:\n${res.error}`);
    code = 1;
  } else {
    const byArea = new Map();
    for (const r of res.results) {
      const a = byArea.get(r.area) ?? { pass: 0, fail: 0, known: 0, fixed: 0 };
      a[r.status]++;
      byArea.set(r.area, a);
    }
    for (const r of res.results.filter((x) => x.status === 'fail')) {
      console.log(`FAIL [${r.area}] ${r.name}\n     ${r.message}\n     (rule: ${r.source})`);
    }
    for (const r of res.results.filter((x) => x.status === 'fixed')) {
      console.log(`NOW PASSES (remove its knownFailure mark) [${r.area}] ${r.name}`);
    }
    for (const r of res.results.filter((x) => x.status === 'known')) {
      console.log(`known failure [${r.area}] ${r.name}\n     ${r.reason}\n     (${r.message})`);
    }
    for (const [area, a] of byArea) console.log(`${area.padEnd(28)} ${a.pass} passed${a.fail ? `, ${a.fail} FAILED` : ''}${a.known ? `, ${a.known} known failures` : ''}${a.fixed ? `, ${a.fixed} now passing` : ''}`);
    const fails = res.results.filter((x) => x.status === 'fail').length;
    const known = res.results.filter((x) => x.status === 'known').length;
    console.log(`\n${res.results.length} tests: ${res.results.length - fails - known} passed, ${fails} failed, ${known} known failures (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    if (fails) code = 1;
  }
  if (pageErrors.length) console.log(pageErrors.slice(0, 5).map((e) => `(page error) ${e}`).join('\n'));
} catch (e) {
  console.log(`FAIL ${e.message.split('\n')[0]}`);
  code = 1;
} finally {
  await browser.close();
}
process.exit(code);
