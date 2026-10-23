// Playwright (MCP browser_run_code_unsafe) check of image draw()/fill() as Robot
// Rage's Paintshop calls them: float coordinates, reversed corners, #lineSize on
// #rect and the #pen shapeType. Run against a test instance (8091), any screen.
async (page) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('http://127.0.0.1:8091/');
  await page.waitForTimeout(2000);
  const box = await page.locator('canvas').first().boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(() => window.__vm && window.__vm.mcp_eval_lingo, null, { timeout: 60000 });
  await page.waitForTimeout(8000);
  const ev = (code) => page.evaluate((c) => window.__vm.mcp_eval_lingo(c), code);
  const W = 'rgb(255,255,255)', R = 'rgb(255,0,0)';
  const fresh = async () => { await ev('global gT'); await ev('gT = image(20, 20, 32)'); await ev(`gT.fill(0, 0, 20, 20, ${W})`); };
  const px = async (x, y) => {
    const r = await ev(`string(gT.getPixel(${x}, ${y}))`);
    const m = /rgb\(\s*(\d+),\s*(\d+),\s*(\d+)/.exec(r);
    return m ? (m[1] === '255' && m[2] === '255' && m[3] === '255' ? 'W' : 'C') : 'ERR ' + r;
  };
  const cases = [];
  const check = async (name, code, expect) => {
    await fresh();
    const res = await ev(code);
    const got = {};
    let ok = true;
    for (const [xy, want] of Object.entries(expect)) {
      const [x, y] = xy.split(',').map(Number);
      got[xy] = await px(x, y);
      if (got[xy] !== want) ok = false;
    }
    cases.push({ name, ok, got, res: String(res).slice(0, 160) });
  };
  await check('rect, reversed corners, lineSize 2',
    `gT.draw(15, 15, 5, 5, [#shapeType: #rect, #color: ${R}, #lineSize: 2])`,
    { '5,5': 'C', '6,6': 'C', '7,7': 'W', '14,14': 'C', '13,13': 'C', '12,12': 'W', '10,5': 'C', '10,6': 'C', '10,7': 'W', '10,10': 'W', '15,15': 'W' });
  await check('#pen draws a line',
    `gT.draw(2, 2, 8, 8, [#shapeType: #pen, #color: ${R}, #lineSize: 1])`,
    { '2,2': 'C', '5,5': 'C', '8,8': 'C', '8,2': 'W' });
  await check('fill with float coordinates',
    `gT.fill(3.5, 3.5, 6.5, 6.5, [#color: ${R}])`,
    { '3,3': 'C', '5,5': 'C', '6,6': 'W', '2,2': 'W' });
  await check('fill, reversed rect',
    `gT.fill(rect(10, 0, 4, 4), ${R})`,
    { '4,0': 'C', '9,3': 'C', '10,0': 'W', '4,4': 'W' });
  await check('line with float coordinates',
    `gT.draw(2.5, 2.5, 8.5, 2.5, [#shapeType: #line, #color: ${R}, #lineSize: 1])`,
    { '2,2': 'C', '5,2': 'C', '8,2': 'C', '5,3': 'W' });
  await check('oval, reversed corners',
    `gT.draw(18, 18, 2, 2, [#shapeType: #oval, #color: ${R}, #lineSize: 1])`,
    { '10,2': 'C', '2,10': 'C', '10,17': 'C', '10,10': 'W' });
  return JSON.stringify({ passed: cases.filter(c => c.ok).length, of: cases.length, cases }, null, 1);
}
