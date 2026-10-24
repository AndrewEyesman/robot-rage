// Text as the game drew it. Embedded fonts ("Impact *") come from the game files as
// glyph grids (rasterised by port/extract); system fonts (Verdana) are drawn without
// anti-aliasing, the way Windows drew small text into Director's text members.
//
// A text member's own colour is black or white; on the stage, ink 36 shows black
// as the sprite's foreColor and white as its backColor, so callers pass the colour
// the player saw.

interface AtlasDoc {
  png: string;
  cell: [number, number];
  columns: number;
  firstChar: number;
  widths: number[];
  advances: number[];
}

interface MemberDoc {
  lib: number;
  num: number;
  font?: { name: string; sizes: Record<string, AtlasDoc> };
}

/** Windows-1252, the encoding of the game's text and its glyph grids. */
function charCode(ch: string): number {
  const c = ch.charCodeAt(0);
  if (c < 256) return c;
  const cp1252: Record<number, number> = { 0x20ac: 0x80, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2013: 0x96, 0x2014: 0x97, 0x2122: 0x99 };
  return cp1252[c] ?? 63;
}

/** One embedded font at one size. */
export class BitmapFont {
  private readonly tinted = new Map<string, HTMLCanvasElement>();

  private constructor(
    private readonly atlas: HTMLImageElement,
    private readonly doc: AtlasDoc,
  ) {}

  /** Load the font named `name` (as text members name it, e.g. "Impact *") at a size. */
  static async load(assets: string, movie: string, name: string, size: number): Promise<BitmapFont> {
    const index = await (await fetch(`${assets}/${movie}/index.json`)).json();
    const member = (index.members as (MemberDoc & { name: string })[]).find((m) => m.font && m.name === name);
    const doc = member?.font?.sizes[String(size)];
    if (!doc) throw new Error(`no embedded font ${name} at ${size}`);
    const img = new Image();
    img.src = `${assets}/${movie}/${doc.png}`;
    await img.decode();
    return new BitmapFont(img, doc);
  }

  private atlasIn(color: string): HTMLCanvasElement {
    let c = this.tinted.get(color);
    if (!c) {
      c = document.createElement('canvas');
      c.width = this.atlas.width;
      c.height = this.atlas.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(this.atlas, 0, 0);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, c.width, c.height);
      this.tinted.set(color, c);
    }
    return c;
  }

  /**
   * Draw one line with its top-left at (x, y). Advances accumulate fractionally and
   * each glyph lands on the rounded pen position, as Director lays out PFR text.
   */
  draw(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
    const { cell, columns, firstChar, advances, widths } = this.doc;
    const src = this.atlasIn(color);
    const smoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    let pen = 0;
    for (const ch of text) {
      const i = charCode(ch) - firstChar;
      if (i >= 0 && i < advances.length) {
        const gx = Math.round(pen);
        ctx.drawImage(src, (i % columns) * cell[0], Math.floor(i / columns) * cell[1], cell[0], cell[1], x + gx, y, cell[0], cell[1]);
        pen += advances[i] ?? widths[i];
      }
    }
    ctx.imageSmoothingEnabled = smoothing;
  }
}

/**
 * Draw system-font text without anti-aliasing: render it once at stage resolution,
 * keep only pixels at least half covered, then blit those pixels.
 */
export class AliasedText {
  private cache = new Map<string, HTMLCanvasElement>();

  constructor(private readonly font: string) {}

  draw(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
    const key = `${text}|${color}`;
    let c = this.cache.get(key);
    if (!c) {
      c = document.createElement('canvas');
      const m = c.getContext('2d')!;
      m.font = this.font;
      c.width = Math.ceil(m.measureText(text).width) + 4;
      c.height = 24;
      const g = c.getContext('2d')!;
      g.font = this.font;
      g.textBaseline = 'top';
      g.fillStyle = color;
      g.fillText(text, 0, 0);
      const img = g.getImageData(0, 0, c.width, c.height);
      for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i] >= 128 ? 255 : 0;
      g.putImageData(img, 0, 0);
      if (this.cache.size > 64) this.cache.clear();
      this.cache.set(key, c);
    }
    const smoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(c, x, y);
    ctx.imageSmoothingEnabled = smoothing;
  }
}
