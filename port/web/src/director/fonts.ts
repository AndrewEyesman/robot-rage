// Fonts for text and field members. Embedded fonts ("Impact *") are glyph grids
// rasterised from the game's own outlines at every pixel size (port/extract); system
// fonts (Verdana, Arial) are Windows' own TrueType files laid out and drawn the way
// Adobe's Director 10.1 player draws them through GDI (measured against it, see
// port/tools/text-compare.mjs):
//
// - a style's size is the pixel size (ppem); glyph advances are the outline advance
//   scaled to it and rounded to whole pixels, per glyph (not the hinted widths);
// - a line's ascent and descent come from the font's VDMX table for that size, plus
//   the font's line gap below (Arial from 16 px up);
// - aliased text (below the antiAliasThreshold, and fields always) uses the hinted
//   monochrome glyphs, pre-rendered by port/extract/system-fonts.py: identical to
//   Adobe's pixel for pixel at the original 1:1 scale;
// - anti-aliased text, and any text when the stage is scaled, is drawn by the browser
//   glyph by glyph at the same pen positions, at the display's resolution;
//   anti-aliased runs put their baseline at the rounded winAscent below the line's
//   top (Director's anti-aliasing renderer), not at the VDMX ascent;
// - Director lays text out with kerning from kerningThreshold up (charPosToLoc and
//   wrapping see kerned positions) but draws the glyphs of a run unkerned.
//
// Director sizes are pixels (72 dpi).

import type { FontSizeDoc } from './docs';

export interface TextStyle {
  font: string;
  size: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

export interface FontMetrics {
  ascent: number;
  descent: number;
}

/** Windows-1252, the encoding of the game's text and its glyph grids. */
export function charCode(ch: string): number {
  const c = ch.charCodeAt(0);
  if (c < 256) return c;
  const cp1252: Record<number, number> = {
    0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88,
    0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93,
    0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
    0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
  };
  return cp1252[c] ?? 63;
}

/** How many device pixels one stage pixel covers under the context's transform. */
export function deviceScale(ctx: CanvasRenderingContext2D): number {
  const t = ctx.getTransform();
  return Math.hypot(t.a, t.b);
}

interface Atlas {
  px: number;
  doc: FontSizeDoc;
  img: HTMLImageElement;
  tinted: Map<string, HTMLCanvasElement>;
}

/** An embedded font: one glyph grid per pixel size, loaded as needed. */
class EmbeddedFont {
  private readonly atlases = new Map<number, Atlas>();
  private readonly loading = new Map<number, Promise<void>>();

  constructor(
    readonly base: string,
    readonly sizes: Record<string, FontSizeDoc>,
  ) {}

  has(px: number) {
    return !!this.sizes[String(px)];
  }

  load(px: number): Promise<void> {
    if (this.atlases.has(px)) return Promise.resolve();
    let p = this.loading.get(px);
    if (!p) {
      const doc = this.sizes[String(px)];
      if (!doc) return Promise.resolve();
      const img = new Image();
      img.src = `${this.base}/${doc.png}`;
      p = img.decode().then(() => void this.atlases.set(px, { px, doc, img, tinted: new Map() }));
      this.loading.set(px, p);
    }
    return p;
  }

  atlas(px: number): Atlas | undefined {
    const a = this.atlases.get(px);
    if (!a) void this.load(px);
    return a;
  }

  advance(ch: string, size: number): number {
    const doc = this.sizes[String(size)];
    if (!doc) return size / 2;
    const i = charCode(ch) - doc.firstChar;
    return doc.advances[i] ?? doc.widths[i] ?? 0;
  }

  metrics(size: number): FontMetrics {
    const doc = this.sizes[String(size)];
    const h = doc ? doc.cell[1] : size;
    // The grids are laid out with the baseline about 4/5 down the cell.
    return { ascent: Math.round(h * 0.8), descent: h - Math.round(h * 0.8) };
  }

  tinted(a: Atlas, color: string): HTMLCanvasElement {
    let c = a.tinted.get(color);
    if (!c) {
      c = document.createElement('canvas');
      c.width = a.img.width;
      c.height = a.img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(a.img, 0, 0);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, c.width, c.height);
      a.tinted.set(color, c);
    }
    return c;
  }

  /** One run with its top-left at (x, y), pen positions rounded as Director lays out PFR text. */
  draw(ctx: CanvasRenderingContext2D, text: string, size: number, x: number, y: number, color: string) {
    const k = deviceScale(ctx);
    const want = Math.max(6, Math.min(64, Math.round(size * k)));
    const a = this.atlas(want) ?? this.atlas(size);
    if (!a) return;
    const { cell, columns, firstChar, advances, widths } = a.doc;
    const stretch = (size * k) / a.px;
    const origin = ctx.getTransform().transformPoint(new DOMPoint(x, y));
    const src = this.tinted(a, color);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = Math.abs(stretch - 1) > 0.01;
    let pen = 0;
    const ox = Math.round(origin.x);
    const oy = Math.round(origin.y);
    for (const ch of text) {
      const i = charCode(ch) - firstChar;
      if (i >= 0 && i < advances.length) {
        const gx = Math.round(pen * stretch);
        ctx.drawImage(src, (i % columns) * cell[0], Math.floor(i / columns) * cell[1], cell[0], cell[1], ox + gx, oy, cell[0] * stretch, cell[1] * stretch);
        pen += advances[i] ?? widths[i];
      }
    }
    ctx.restore();
  }
}

interface SystemSizeDoc {
  png: string;
  cell: [number, number];
  columns: number;
  firstChar: number;
  /** Pen origin inside each cell. */
  originX: number;
  baseline: number;
  /** Line metrics (VDMX). */
  ascent: number;
  descent: number;
  /** The hhea line gap at this size, below the descent. */
  leading?: number;
  /** Baseline of anti-aliased runs below the line's top (rounded winAscent). */
  aaAscent?: number;
  advances: number[];
  /** Hinted advances (hdmx): GDI's spacing when it draws a field's glyphs. */
  hinted?: number[];
}

interface SystemFaceDoc {
  upm: number;
  sizes: Record<string, SystemSizeDoc>;
  /** [char code, char code, font units] */
  kern: [number, number, number][];
}

/** A Windows TrueType face with its metrics and hinted monochrome glyph grids. */
class SystemFace {
  private readonly atlases = new Map<number, { img: HTMLImageElement; tinted: Map<string, HTMLCanvasElement> }>();
  private readonly loading = new Map<number, Promise<void>>();
  private readonly kerns = new Map<number, number>();

  constructor(
    readonly base: string,
    readonly doc: SystemFaceDoc,
  ) {
    for (const [a, b, v] of doc.kern) this.kerns.set((a << 8) | b, v);
  }

  size(px: number): SystemSizeDoc | undefined {
    return this.doc.sizes[String(px)];
  }

  advance(code: number, px: number, hinted = false): number {
    const d = this.size(px)!;
    const a = (hinted && d.hinted) || d.advances;
    return a[code - d.firstChar] ?? a[63 - d.firstChar];
  }

  /** Kerning between two characters in pixels, rounded as FreeType scales (26.6). */
  kern(a: number, b: number, px: number): number {
    const v = this.kerns.get((a << 8) | b);
    if (!v) return 0;
    return Math.round((v * px) / this.doc.upm);
  }

  load(px: number): Promise<void> {
    if (this.atlases.has(px)) return Promise.resolve();
    let p = this.loading.get(px);
    if (!p) {
      const d = this.size(px);
      if (!d) return Promise.resolve();
      const img = new Image();
      img.src = `${this.base}/${d.png}`;
      p = img.decode().then(() => void this.atlases.set(px, { img, tinted: new Map() }));
      this.loading.set(px, p);
    }
    return p;
  }

  /** The glyph grid tinted in a colour, or undefined while it loads. */
  tinted(px: number, color: string): HTMLCanvasElement | undefined {
    const a = this.atlases.get(px);
    if (!a) {
      void this.load(px);
      return undefined;
    }
    let c = a.tinted.get(color);
    if (!c) {
      c = document.createElement('canvas');
      c.width = a.img.width;
      c.height = a.img.height;
      const g = c.getContext('2d')!;
      g.drawImage(a.img, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = color;
      g.fillRect(0, 0, c.width, c.height);
      if (a.tinted.size > 16) a.tinted.clear();
      a.tinted.set(color, c);
    }
    return c;
  }
}

const systemFaces = new Map<string, SystemFace>();
const faceKey = (family: string, bold: boolean, italic: boolean) => `${family.toLowerCase()}|${bold ? 1 : 0}|${italic ? 1 : 0}`;

const FACES: [string, string, boolean, boolean][] = [
  ['Verdana', 'verdana', false, false], ['Verdana', 'verdanab', true, false], ['Verdana', 'verdanai', false, true], ['Verdana', 'verdanaz', true, true],
  ['Arial', 'arial', false, false], ['Arial', 'arialbd', true, false], ['Arial', 'ariali', false, true], ['Arial', 'arialbi', true, true],
  ['Arial Black', 'ariblk', false, false], ['Impact', 'impact', false, false],
  ['Times New Roman', 'times', false, false], ['Times New Roman', 'timesbd', true, false], ['Times New Roman', 'timesi', false, true], ['Times New Roman', 'timesbi', true, true],
  ['Courier New', 'cour', false, false], ['Courier New', 'courbd', true, false], ['Courier New', 'couri', false, true], ['Courier New', 'courbi', true, true],
  ['Georgia', 'georgia', false, false], ['Georgia', 'georgiab', true, false], ['Georgia', 'georgiai', false, true], ['Georgia', 'georgiaz', true, true],
  ['Trebuchet MS', 'trebuc', false, false], ['Trebuchet MS', 'trebucbd', true, false], ['Trebuchet MS', 'trebucit', false, true], ['Trebuchet MS', 'trebucbi', true, true],
  ['Comic Sans MS', 'comic', false, false], ['Comic Sans MS', 'comicbd', true, false],
];

/**
 * Windows' core fonts as the game's text names them (Verdana, Arial...), from
 * port/assets/fonts/system: registered with the browser under their own names (for
 * drawing at display resolution), plus their GDI metrics and glyph grids.
 */
export async function loadSystemFonts(assets: string) {
  const base = `${assets}/fonts/system`;
  await Promise.all(
    FACES.map(async ([family, file, bold, italic]) => {
      try {
        const f = new FontFace(family, `url(${base}/${file}.ttf)`, { weight: bold ? 'bold' : 'normal', style: italic ? 'italic' : 'normal' });
        await f.load();
        document.fonts.add(f);
      } catch {
        // Not extracted: the browser's substitute will do.
      }
      try {
        const r = await fetch(`${base}/glyphs/${file}.json`);
        if (r.ok) systemFaces.set(faceKey(family, bold, italic), new SystemFace(`${base}/glyphs`, (await r.json()) as SystemFaceDoc));
      } catch {
        // No glyph grids (port/extract.sh not re-run): the browser lays the text out.
      }
    }),
  );
  // The game's usual text: its glyphs ready before the first frame.
  const common: Promise<void>[] = [];
  for (const fam of ['Verdana', 'Arial']) for (const bold of [false, true]) for (const px of [9, 10, 11, 12]) common.push(systemFaces.get(faceKey(fam, bold, false))?.load(px) ?? Promise.resolve());
  await Promise.all(common);
  metricsCache.clear();
}

const embedded = new Map<string, EmbeddedFont>();
const measureCtx = document.createElement('canvas').getContext('2d')!;
const metricsCache = new Map<string, FontMetrics>();

/** Register an embedded font found in a cast (keyed by its member name, e.g. "Impact *"). */
export function registerEmbeddedFont(name: string, base: string, sizes: Record<string, FontSizeDoc>) {
  const key = name.toLowerCase();
  if (!embedded.has(key)) embedded.set(key, new EmbeddedFont(base, sizes));
}

function embeddedFor(style: TextStyle): EmbeddedFont | undefined {
  const f = embedded.get(style.font.toLowerCase());
  return f && f.has(style.size) ? f : undefined;
}

/** The system face for a style at its size; a missing bold/italic face falls back to the regular one. */
function systemFor(style: TextStyle): SystemFace | undefined {
  const fam = style.font.replace(/\s*\*$/, '');
  const f = systemFaces.get(faceKey(fam, style.bold, style.italic)) ?? systemFaces.get(faceKey(fam, style.bold, false)) ?? systemFaces.get(faceKey(fam, false, false));
  return f && f.size(style.size) ? f : undefined;
}

/** Make sure the glyph grids a style needs at a display scale are loaded. */
export function preloadStyle(style: TextStyle, scale = 1): Promise<void> {
  const s = systemFor(style);
  if (s) return s.load(style.size);
  const f = embeddedFor(style);
  if (!f) return Promise.resolve();
  return Promise.all([f.load(style.size), f.load(Math.max(6, Math.min(64, Math.round(style.size * scale))))]).then(() => {});
}

const FALLBACK: Record<string, string> = {
  verdana: 'Verdana, "DejaVu Sans", sans-serif',
  arial: 'Arial, "Liberation Sans", Helvetica, sans-serif',
  'arial black': '"Arial Black", Arial, sans-serif',
  tahoma: 'Tahoma, Verdana, "DejaVu Sans", sans-serif',
  'courier new': '"Courier New", "Liberation Mono", monospace',
  'times new roman': '"Times New Roman", "Liberation Serif", serif',
  impact: 'Impact, "Haettenschweiler", sans-serif',
};

function cssFont(style: TextStyle, px: number) {
  const name = style.font.replace(/\s*\*$/, '');
  const family = FALLBACK[name.toLowerCase()] ?? `"${name}", Verdana, sans-serif`;
  return `${style.italic ? 'italic ' : ''}${style.bold ? 'bold ' : ''}${px}px ${family}`;
}

/**
 * Pen positions of each character of a run (n + 1 values, the last is the width).
 * `kern` applies the font's kerning pairs (Director kerns from kerningThreshold up).
 */
export function positions(style: TextStyle, text: string, kern = false, hinted = false): number[] {
  const out = [0];
  const s = systemFor(style);
  if (s) {
    let pen = 0;
    let prev = -1;
    for (const ch of text) {
      const c = ch === '\t' ? -1 : charCode(ch);
      if (kern && prev >= 0 && c >= 0) {
        pen += s.kern(prev, c, style.size);
        out[out.length - 1] = pen;
      }
      pen += c < 0 ? 0 : s.advance(c, style.size, hinted);
      out.push(pen);
      prev = c;
    }
    return out;
  }
  const f = embeddedFor(style);
  let pen = 0;
  for (const ch of text) {
    if (ch === '\t') {
      out.push(pen);
      continue;
    }
    if (f) pen += f.advance(ch, style.size);
    else {
      measureCtx.font = cssFont(style, style.size);
      pen += measureCtx.measureText(ch).width;
    }
    out.push(pen);
  }
  return out;
}

/** Width of a run (tabs count as nothing here: the layout places them). */
export function measure(style: TextStyle, text: string, kern = false, hinted = false): number {
  const s = systemFor(style);
  const f = embeddedFor(style);
  if (s || f) {
    const p = positions(style, text, kern, hinted);
    return p[p.length - 1];
  }
  measureCtx.font = cssFont(style, style.size);
  return measureCtx.measureText(text.replace(/\t/g, '')).width;
}

/** Width of the .notdef box GDI draws for a TAB in a field (Verdana 10: 10). */
export function notdefAdvance(style: TextStyle, hinted = false): number {
  const s = systemFor(style);
  if (s) return s.advance(127, style.size, hinted);
  return Math.round(style.size * 0.75);
}

export function metrics(style: TextStyle): FontMetrics {
  const s = systemFor(style);
  if (s) {
    const d = s.size(style.size)!;
    return { ascent: d.ascent, descent: d.descent + (d.leading ?? 0) };
  }
  const f = embeddedFor(style);
  if (f) return f.metrics(style.size);
  const key = cssFont(style, style.size);
  let m = metricsCache.get(key);
  if (!m) {
    measureCtx.font = key;
    const t = measureCtx.measureText('Mg');
    m = { ascent: Math.round(t.fontBoundingBoxAscent ?? style.size * 0.8), descent: Math.round(t.fontBoundingBoxDescent ?? style.size * 0.2) };
    metricsCache.set(key, m);
  }
  return m;
}

const runCache = new Map<string, { c: HTMLCanvasElement; ox: number; oy: number }>();

/**
 * A run drawn by the browser glyph by glyph at Director's pen positions, `k` device
 * pixels per stage pixel, cached as a bitmap with its baseline origin at (ox, oy).
 */
function browserRun(style: TextStyle, text: string, pos: number[], k: number, color: string) {
  const key = `${cssFont(style, style.size)}|${k}|${color}|${text}|${pos.join(',')}`;
  let r = runCache.get(key);
  if (!r) {
    const m = metrics(style);
    const pad = Math.ceil(style.size * k * 0.5) + 2;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(pos[pos.length - 1] * k) + 2 * pad);
    c.height = Math.max(1, Math.ceil((m.ascent + m.descent) * k) + 2 * pad);
    const g = c.getContext('2d')!;
    g.font = cssFont(style, style.size * k);
    g.textBaseline = 'alphabetic';
    g.fillStyle = color;
    const oy = pad + Math.round(m.ascent * k);
    let i = 0;
    for (const ch of text) {
      if (ch !== '\t' && ch !== ' ') g.fillText(ch, pad + Math.round(pos[i] * k), oy);
      i++;
    }
    r = { c, ox: pad, oy };
    if (runCache.size > 512) runCache.clear();
    runCache.set(key, r);
  }
  return r;
}

/**
 * Draw a run with its top-left at stage point (x, y) (the baseline is `ascent` below).
 * Aliased system text at the original 1:1 scale uses the hinted glyph grids; otherwise
 * (anti-aliased, or a scaled stage) the browser draws each glyph at Director's pen
 * positions at the device's resolution.
 */
export function drawRun(ctx: CanvasRenderingContext2D, style: TextStyle, text: string, x: number, y: number, color: string, antialias = true, kern = false, hinted = false) {
  if (!text) return;
  const s = systemFor(style);
  const f = s ? undefined : embeddedFor(style);
  if (f) {
    f.draw(ctx, text, style.size, x, y, color);
  } else if (s) {
    const k = deviceScale(ctx);
    const d = s.size(style.size)!;
    const pos = positions(style, text, kern, hinted);
    const origin = ctx.getTransform().transformPoint(new DOMPoint(x, y));
    const atlas = !antialias && Math.abs(k - 1) < 0.01 ? s.tinted(style.size, color) : undefined;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const ox = Math.round(origin.x);
    const base = Math.round(origin.y + (antialias ? d.aaAscent ?? d.ascent : d.ascent) * k);
    if (atlas) {
      ctx.imageSmoothingEnabled = false;
      const [cw, ch] = d.cell;
      let i = 0;
      for (const chr of text) {
        const c = chr === '\t' ? -1 : charCode(chr) - d.firstChar;
        if (c >= 0 && c !== 0) {
          ctx.drawImage(atlas, (c % d.columns) * cw, Math.floor(c / d.columns) * ch, cw, ch, ox + pos[i] - d.originX, base - d.baseline, cw, ch);
        }
        i++;
      }
    } else {
      const r = browserRun(style, text, pos, k, color);
      ctx.drawImage(r.c, ox - r.ox, base - r.oy);
    }
    ctx.restore();
  } else {
    // A font we don't have: the browser's substitute at the device's resolution.
    const k = deviceScale(ctx);
    const p = ctx.getTransform().transformPoint(new DOMPoint(x, y));
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = cssFont(style, style.size * k);
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = color;
    ctx.fillText(text, Math.round(p.x), Math.round(p.y + metrics(style).ascent * k));
    ctx.restore();
  }
  if (style.underline) {
    const m = metrics(style);
    ctx.fillStyle = color;
    ctx.fillRect(x, y + m.ascent + 1, measure(style, text, kern), Math.max(1, Math.round(style.size / 12)));
  }
}
