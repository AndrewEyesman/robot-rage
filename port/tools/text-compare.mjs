// Render text and field members in Adobe's Director 10.1 player (the reference) and
// in the port, and compare them: pixels at 1:1, and Director's charPosToLoc of every
// character against the port's.
//
//   node port/tools/text-compare.mjs <out-dir> [case names...]     (default: all cases)
//
// Needs the port's dev server (http://127.0.0.1:8092, PORT_ORIGIN to override) and the
// reference player with ref-repl answering in login013_ (cases with `member` read that
// movie's members). To get there:
//   tools/reference/ref-start.sh 8091 && tools/reference/ref-movie.sh arena104.dcr
//   tools/reference/refeval.sh -s 'timeout("refrepl").persistent = TRUE' 'go(1, "login013_.dcr")'
// (login013_ started directly stops on a script error; the REPL's timeout survives
// the movie switch when persistent.)
//
// Each case writes <out-dir>/<name>.png: reference, port, and their difference
// (red: only the reference has ink, blue: only the port), 3x. Exit status 1 if any
// case differs in layout (char positions, height).
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REFEVAL = join(ROOT, 'tools/reference/refeval.sh');
const REFCTL = join(ROOT, 'tools/reference/refctl.sh');
const ORIGIN = process.env.PORT_ORIGIN ?? 'http://127.0.0.1:8092';
const LOC = [12, 12];

const para = 'Due to extreme amounts of robots, the database will be cleaned on a regular basis and inactive robots will be deleted.';
// Runs: [length, font, size, styles, color]
const CASES = [
  { name: 'login-read-this', member: 24 },
  { name: 'verdana10', text: para, runs: [[0, 'Verdana', 10, '', '#000000']], width: 205 },
  { name: 'verdana10-bold', text: 'A robot is inactive if not used in the last 21 days.', runs: [[0, 'Verdana', 10, 'bold', '#000000']], width: 205 },
  { name: 'verdana9', text: 'Choose a robot: CRUSHER 0123456789 Won/Lost/Ties', runs: [[0, 'Verdana', 9, '', '#000000']], width: 300 },
  { name: 'arial12', text: 'Forgot your password? The quick brown fox jumps over the lazy dog.', runs: [[0, 'Arial', 12, '', '#000000']], width: 260 },
  { name: 'mixed-cr', text: 'one two three\rfour five\rsix', runs: [[13, 'Verdana', 10, '', '#000000'], [1, 'Verdana', 12, '', '#000000'], [10, 'Arial', 10, 'bold', '#000000'], [1, 'Arial', 14, '', '#000000'], [0, 'Verdana', 10, 'italic', '#000000']], width: 300 },
  { name: 'tabs-default', text: 'a\tb\tc\rabcdefghijklmnop\tx\rCHAT\tON', runs: [[0, 'Verdana', 10, '', '#000000']], width: 300 },
  { name: 'tabs-right', text: 'Room\t12\rLobby two\t3', runs: [[0, 'Verdana', 10, '', '#000000']], width: 200, tabs: [['right', 160]] },
  { name: 'tabs-center-left', text: 'ab\tcdef\tgh\tij', runs: [[0, 'Verdana', 10, '', '#000000']], width: 300, tabs: [['center', 100], ['left', 130]] },
  { name: 'center', align: 'center', text: 'Choose a robot:\rUSE ROBOT\rab', runs: [[0, 'Verdana', 10, 'bold', '#000000']], width: 151 },
  { name: 'right', align: 'right', text: 'Won 12\rLost 3\rTies 100', runs: [[0, 'Arial', 12, '', '#000000']], width: 121 },
  { name: 'fixed15', text: 'Weapons\rArmour\rBatteries', runs: [[0, 'Verdana', 10, '', '#000000']], width: 150, fixedLineSpace: 15 },
  { name: 'aa-verdana16', text: 'Robot Garage AVATAR Wave To', runs: [[0, 'Verdana', 16, '', '#000000']], width: 400 },
  { name: 'aa-arial20-bold', text: 'LOG IN Today', runs: [[0, 'Arial', 20, 'bold', '#000000']], width: 400 },
  { name: 'field-verdana10', field: true, text: 'Hello world, this field wraps onto a second line.\rCHAT\tON', runs: [[0, 'Verdana', 10, '', '#000000']], width: 180 },
  { name: 'field-arial12', field: true, text: 'player@example.com\rpassword', runs: [[0, 'Arial', 12, '', '#000000']], width: 183 },
  { name: 'field-verdana10-bold', field: true, text: 'Connecting to server...', runs: [[0, 'Verdana', 10, 'bold', '#000000']], width: 183 },
];

// ------------------------------------------------------------------ reference

function refeval(...args) {
  return execFileSync(REFEVAL, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

/** A Lingo string expression for s (QUOTE, RETURN and TAB spliced in). */
function lingoString(s) {
  const parts = [];
  let cur = '';
  for (const ch of s) {
    const special = ch === '"' ? 'QUOTE' : ch === '\r' ? 'RETURN' : ch === '\t' ? 'TAB' : null;
    if (special) {
      parts.push(`"${cur}"`, special);
      cur = '';
    } else cur += ch;
  }
  parts.push(`"${cur}"`);
  return parts.join(' & ');
}

function runRanges(c) {
  let pos = 0;
  return c.runs.map(([len, font, size, styles, color], i) => {
    const n = len || c.text.length - pos;
    const r = { from: pos, to: pos + n, font, size, styles: styles ? styles.split(',') : [], color };
    pos += n;
    return r;
  });
}

const HELPER = [
  'global gRT, gRF',
  'on rrT',
  'return gRT',
  'end',
  'on rrF',
  'return gRF',
  'end',
  'on rrPos m',
  'l = []',
  'repeat with i = 1 to m.text.length + 1',
  'l.add(m.charPosToLoc(i))',
  'end repeat',
  'return l',
  'end',
];

function refRender(c, shot) {
  refeval('-s', 'global gRS', 'if voidp(gRS) then gRS = new(#script)', 'gRS.scriptType = #movie', `gRS.scriptText = ${HELPER.map((l) => `"${l}"`).join(' & RETURN & ')}`);
  let m;
  if (c.member) {
    m = `member(${c.member})`;
  } else {
    m = c.field ? 'gRF' : 'gRT';
    const st = [`global ${m}`, `if voidp(${m}) then ${m} = new(#${c.field ? 'field' : 'text'})`, `${m}.text = ${lingoString(c.text)}`];
    const first = runRanges(c)[0];
    // (A field's member-level fontStyle takes a string, not a list.)
    st.push(`${m}.font = "${first.font}"`, `${m}.fontSize = ${first.size}`);
    st.push(c.field ? `${m}.fontStyle = "${first.styles.join(',') || 'plain'}"` : `${m}.fontStyle = [#plain]`);
    if (!c.field) st.push(`${m}.tabs = []`, `${m}.kerning = TRUE`, `${m}.fixedLineSpace = ${c.fixedLineSpace ?? 0}`, `${m}.antiAlias = TRUE`);
    else st.push(`${m}.boxType = #fixed`, `${m}.border = 0`, `${m}.margin = 0`);
    st.push(`${m}.wordWrap = ${c.wordWrap === false ? 'FALSE' : 'TRUE'}`, c.field ? `${m}.alignment = "${c.align ?? 'left'}"` : `${m}.alignment = #${c.align ?? 'left'}`);
    for (const r of runRanges(c)) {
      const ch = `${m}.char[${r.from + 1}..${r.to}]`;
      st.push(`${ch}.font = "${r.font}"`, `${ch}.fontSize = ${r.size}`, `${ch}.fontStyle = [${r.styles.length ? r.styles.map((s) => '#' + s).join(', ') : '#plain'}]`, `${ch}.color = rgb("${r.color}")`);
    }
    if (c.tabs) st.push(`${m}.tabs = [${c.tabs.map(([t, p]) => `[#type: #${t}, #position: ${p}]`).join(', ')}]`);
    if (c.field) st.push(`${m}.rect = rect(0, 0, ${c.width}, ${c.height ?? 200})`);
    else st.push(`${m}.width = ${c.width}`);
    refeval('-s', ...st);
    if (c.field && c.fixedLineSpace === undefined) refeval('-s', `global ${m}`, `${m}.boxType = #adjust`);
  }
  refeval('-s', 'global gRT, gRF', 'sprite(120).puppet = TRUE', `sprite(120).member = ${m}`, `sprite(120).loc = point(${LOC[0]}, ${LOC[1]})`, 'sprite(120).ink = 0', 'sprite(120).visible = TRUE', 'updateStage');
  const expr = m === 'gRT' ? 'rrT()' : m === 'gRF' ? 'rrF()' : m;
  const rect = refeval(`${expr}.rect`);
  const pos = refeval(`rrPos(${expr})`);
  execFileSync(REFCTL, ['shot', shot]);
  const nums = (s) => (s.match(/-?\d+/g) ?? []).map(Number);
  const r = nums(rect);
  const p = nums(pos);
  const points = [];
  for (let i = 0; i + 1 < p.length; i += 2) points.push([p[i], p[i + 1]]);
  return { width: r[2] - r[0], height: r[3] - r[1], points };
}

// ------------------------------------------------------------------ port

async function portRender(page, c) {
  let doc = null;
  if (c.member) {
    const movie = JSON.parse(readFileSync(join(ROOT, 'port/assets/login013_/index.json'), 'utf8'));
    doc = movie.members.find((m) => m.num === c.member && m.lib === 1);
  }
  return page.evaluate(
    async ({ c, doc, runs }) => {
      // Import fonts/text-layout under the exact URLs members.ts imports them by (the
      // dev server adds ?t= to hot-updated modules: another URL is another instance).
      const members = await import('/src/director/members.ts');
      const src = await (await fetch('/src/director/members.ts')).text();
      const url = (name) => src.match(new RegExp(`from "(/src/director/${name}\\.ts[^"]*)"`))?.[1] ?? `/src/director/${name}.ts`;
      const fonts = await import(url('fonts'));
      const tl = await import(url('text-layout'));
      if (!window.__fontsLoaded) {
        await fonts.loadSystemFonts('/assets');
        window.__fontsLoaded = true;
      }
      const cast = new members.CastLib(9, 'compare', '/assets/login013_', null);
      let m;
      if (doc) {
        m = doc.text ? new members.TextMember(cast, 1, '', doc.text) : new members.FieldMember(cast, 1, '', doc.field, 'field', {});
      } else if (c.field) {
        const styleBits = (s) => (s.includes('bold') ? 1 : 0) | (s.includes('italic') ? 2 : 0) | (s.includes('underline') ? 4 : 0);
        m = new members.FieldMember(cast, 1, '', {
          text: c.text, border: 0, margin: 0, boxShadow: 0, boxType: c.fixedLineSpace === undefined ? 0 : 2, alignment: 0, bg: [255, 255, 255], scroll: 0,
          rect: [0, 0, c.width, c.height ?? 200], maxHeight: 0, textShadow: 0, editable: false, autoTab: false, wordWrap: c.wordWrap !== false, textHeight: 0,
          runs: runs.map((r) => ({ start: r.from, font: r.font, size: r.size, style: styleBits(r.styles), color: r.color, fontId: 0, height: 0, ascent: 0 })),
        }, 'field', {});
        if (c.fixedLineSpace) m.fixedLineSpace = c.fixedLineSpace;
      } else {
        const tabType = { left: 1, center: 2, right: 3, decimal: 4 };
        m = new members.TextMember(cast, 1, '', {
          text: c.text, alignment: c.align ?? 'left', wordWrap: c.wordWrap !== false, fixedLineSpace: c.fixedLineSpace ?? 0, size: [c.width, 0],
          spans: runs.map((r) => ({ text: c.text.slice(r.from, r.to), font: r.font, size: r.size, bold: r.styles.includes('bold'), italic: r.styles.includes('italic'), underline: r.styles.includes('underline'), color: r.color })),
          paragraphs: c.tabs ? [{ topSpacing: 0, bottomSpacing: 0, tabs: c.tabs.map(([t, p]) => [p, tabType[t]]) }] : [],
          paragraphRuns: c.tabs ? [[0, 0]] : [],
        });
      }
      if (c.portKerning === false) m.kerning = false;
      if (!m.boxWidth && c.refWidth) m.boxWidth = c.refWidth;
      for (const r of m.styled.runs) await fonts.preloadStyle(r.style);
      const rect = m.rect;
      const w = rect.right - rect.left;
      const h = rect.bottom - rect.top;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = doc?.text?.bg ?? '#ffffff';
      ctx.fillRect(0, 0, w, h);
      const isText = m instanceof members.TextMember;
      tl.drawLines(ctx, m.lines(), 0, 0, undefined, isText && m.antialias ? m.antiAliasThreshold : Infinity);
      const points = [];
      for (let i = 1; i <= m.text.length + 1; i++) {
        const p = m.charPosToLoc(i);
        points.push([p.locH ?? p[0] ?? p.h, p.locV ?? p[1] ?? p.v]);
      }
      const img = ctx.getImageData(0, 0, w, h);
      return { width: w, height: h, points, pixels: Array.from(img.data) };
    },
    { c, doc, runs: c.runs ? runRanges(c) : [] },
  );
}

// ------------------------------------------------------------------ compare

async function main() {
  const [out, ...names] = process.argv.slice(2);
  if (!out) {
    console.error('usage: text-compare.mjs <out-dir> [case names...]');
    process.exit(2);
  }
  mkdirSync(out, { recursive: true });
  const cases = names.length ? CASES.filter((c) => names.includes(c.name)) : CASES;
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: true, args: ['--headless=new'] });
  const page = await (await browser.newContext({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 })).newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`${ORIGIN}/assets/fonts/system/glyphs/verdana.json`);
  let failed = false;
  const summary = [];
  for (const c of cases) {
    const shot = join(out, `_ref-${c.name}.png`);
    const ref = refRender(c, shot);
    // A member whose width comes from its sprite (member 24: the score's 205) gets the reference's.
    const port = await portRender(page, { ...c, refWidth: ref.width });
    // Reference pixels inside the member's box, through the page (no PNG library needed).
    const refPixels = await page.evaluate(
      async ({ data, x, y, w, h }) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + data;
        await img.decode();
        const cv = document.createElement('canvas');
        cv.width = w;
        cv.height = h;
        const g = cv.getContext('2d');
        g.drawImage(img, -x, -y);
        return Array.from(g.getImageData(0, 0, w, h).data);
      },
      { data: readFileSync(shot).toString('base64'), x: LOC[0], y: LOC[1], w: ref.width, h: ref.height },
    );
    const W = Math.max(ref.width, port.width);
    const H = Math.max(ref.height, port.height);
    const ink = (px, w, h, x, y) => {
      if (x >= w || y >= h) return 0;
      const i = (y * w + x) * 4;
      // Darkness of the pixel against the white box, 0..255 (any channel).
      return 255 - Math.min(px[i], px[i + 1], px[i + 2]);
    };
    let diffPx = 0;
    let refInk = 0;
    let sumAbs = 0;
    const S = 3;
    const outW = (W * 3 + 8) * S;
    const outH = H * S;
    const comp = new Uint8ClampedArray(outW * outH * 4).fill(255);
    const put = (X, Y, r, g, b) => {
      for (let dy = 0; dy < S; dy++)
        for (let dx = 0; dx < S; dx++) {
          const i = ((Y * S + dy) * outW + X * S + dx) * 4;
          comp[i] = r;
          comp[i + 1] = g;
          comp[i + 2] = b;
          comp[i + 3] = 255;
        }
    };
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const a = ink(refPixels, ref.width, ref.height, x, y);
        const b = ink(port.pixels, port.width, port.height, x, y);
        if (a > 127) refInk++;
        if ((a > 127) !== (b > 127)) diffPx++;
        sumAbs += Math.abs(a - b);
        put(x, y, 255 - a, 255 - a, 255 - a);
        put(W + 4 + x, y, 255 - b, 255 - b, 255 - b);
        const ra = a > 127;
        const pb = b > 127;
        put(2 * W + 8 + x, y, ra && pb ? 0 : ra ? 255 : pb ? 0 : 255, ra && pb ? 0 : ra ? 0 : pb ? 0 : 255, ra && pb ? 0 : ra ? 0 : pb ? 255 : 255);
      }
    const pngData = await page.evaluate(
      ({ w, h, px }) => {
        const cv = document.createElement('canvas');
        cv.width = w;
        cv.height = h;
        cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(px), w, h), 0, 0);
        return cv.toDataURL('image/png').split(',')[1];
      },
      { w: outW, h: outH, px: Array.from(comp) },
    );
    writeFileSync(join(out, `${c.name}.png`), Buffer.from(pngData, 'base64'));
    const posDiff = [];
    ref.points.forEach((p, i) => {
      const q = port.points[i];
      if (!q || q[0] !== p[0] || q[1] !== p[1]) posDiff.push(i + 1);
    });
    const layoutOk = !posDiff.length && ref.height === port.height;
    if (!layoutOk) failed = true;
    const line = `${layoutOk ? 'ok  ' : 'DIFF'} ${c.name.padEnd(22)} box ref ${ref.width}x${ref.height} port ${port.width}x${port.height}  chars off ${posDiff.length}/${ref.points.length}${posDiff.length ? ` (first: char ${posDiff[0]} ref ${ref.points[posDiff[0] - 1]} port ${port.points[posDiff[0] - 1]})` : ''}  pixels differing ${diffPx} of ${refInk} ink, mean |d| ${(sumAbs / (W * H)).toFixed(2)}`;
    console.log(line);
    summary.push({ name: c.name, layoutOk, ref: { w: ref.width, h: ref.height }, port: { w: port.width, h: port.height }, posDiff, diffPx, refInk });
  }
  writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 1));
  await browser.close();
  process.exit(failed ? 1 : 0);
}

await main();
