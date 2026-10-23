// Playwright (MCP browser_run_code_unsafe): log in on the 8091 test instance, open
// the garage's Buy parts tab and the Chassis category, and save a screenshot for
// tools/buy-list-check.py (the vertical placement of fixed-line-spacing text).
async (page) => {
  await page.setViewportSize({ width: 1800, height: 1100 });
  await page.goto('http://127.0.0.1:8091/');
  await page.waitForTimeout(2000);
  const box = await page.locator('canvas').first().boundingBox();
  const click = async (x, y) => { await page.mouse.move(box.x + x, box.y + y); await page.waitForTimeout(150); await page.mouse.down(); await page.waitForTimeout(150); await page.mouse.up(); await page.waitForTimeout(300); };
  const shot = (n) => page.screenshot({ path: '.playwright-mcp/' + n + '.png', clip: { x: box.x, y: box.y, width: 800, height: 600 } });
  const ev = async (code) => page.evaluate(async (c) => { const r = JSON.parse(String(await window.__vm.mcp_eval_lingo(c))); return String(r.success ? r.result_value : 'ERR ' + r.error).slice(0, 200); }, code);
  await page.mouse.click(box.x + 400, box.y + 300);
  await page.waitForTimeout(15000);
  await click(480, 222);
  for (let i = 0; i < 30; i++) await page.keyboard.press('Backspace');
  await page.keyboard.type('tester@home.lan', { delay: 30 });
  await click(400, 260);
  await page.keyboard.type('rage2005', { delay: 30 });
  await click(475, 309);
  await page.waitForTimeout(5000);
  await click(395, 235);
  await click(480, 375);
  await page.waitForTimeout(12000);
  // Buy parts tab, open the category dropdown, pick Chassis, then screenshot.
  await click(280, 14); await page.waitForTimeout(4000);
  await click(100, 217);
  await click(100, 232); await page.waitForTimeout(2500);
  await page.mouse.move(box.x + 100, box.y + 355); await page.waitForTimeout(800);
  await shot('buy-list');
  return 'saved .playwright-mcp/buy-list.png; run tools/buy-list-check.py on it';
}
