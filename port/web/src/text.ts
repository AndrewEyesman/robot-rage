// Text as the game drew it, at the display's resolution.
//
// Embedded fonts ("Impact *") come from the game files as glyph grids rasterised from
// their outlines at every pixel size (port/extract), so text is drawn from the grid
// for the size it really covers on screen instead of enlarging small glyphs. System
// fonts (Verdana) are drawn by the browser at that size.
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

interface Atlas {
  px: number;
  doc: AtlasDoc;
  img: HTMLImageElement;
  tinted: Map<string, HTMLCanvasElement>;
}

/** Windows-1252, the encoding of the game's text and its glyph grids. */
function charCode(ch: string): number {
  const c = ch.charCodeAt(0);
  if (c < 256) return c;
  const cp1252: Record<number, number> = { 0x20ac: 0x80, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2013: 0x96, 0x2014: 0x97, 0x2122: 0x99 };
  return cp1252[c] ?? 63;
}

/** How many device pixels one stage pixel covers under the context's transform. */
function deviceScale(ctx: CanvasRenderingContext2D): number {
  const t = ctx.getTransform();
  return Math.hypot(t.a, t.b);
}

/** An embedded font at a text member's size. */
export class BitmapFont {
  private readonly atlases = new Map<number, Atlas>();
  private readonly loading = new Set<number>();

  private constructor(
    private readonly base: string,
    private readonly sizes: Record<string, AtlasDoc>,
    private readonly size: number,
  ) {}

  /** The font named `name` (as text members name it, e.g. "Impact *") at `size`. */
  static async load(assets: string, movie: string, name: string, size: number): Promise<BitmapFont> {
    const index = await (await fetch(`${assets}/${movie}/index.json`, { cache: 'no-cache' })).json();
    const member = (index.members as { name: string; font?: { sizes: Record<string, AtlasDoc> } }[]).find(
      (m) => m.font && m.name === name,
    );
    if (!member?.font?.sizes[String(size)]) throw new Error(`no embedded font ${name} at ${size}`);
    const font = new BitmapFont(`${assets}/${movie}`, member.font.sizes, size);
    await font.atlas(size);
    return font;
  }

  /** The grid for a pixel size; loads it in the background the first time. */
  private atlas(px: number): Promise<Atlas> | Atlas | undefined {
    const ready = this.atlases.get(px);
    if (ready) return ready;
    const doc = this.sizes[String(px)];
    if (!doc || this.loading.has(px)) return undefined;
    this.loading.add(px);
    const img = new Image();
    img.src = `${this.base}/${doc.png}`;
    return img.decode().then(() => {
      const a = { px, doc, img, tinted: new Map() };
      this.atlases.set(px, a);
      return a;
    });
  }

  private tinted(a: Atlas, color: string): HTMLCanvasElement {
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

  /**
   * Draw one line with its top-left at stage point (x, y). Advances accumulate
   * fractionally and each glyph lands on the rounded pen position, as Director lays
   * out PFR text, but in device pixels at the size the text covers on screen.
   */
  draw(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
    const k = deviceScale(ctx);
    const want = Math.max(6, Math.min(64, Math.round(this.size * k)));
    let a = this.atlas(want);
    if (!(a && 'doc' in a)) a = this.atlases.get(this.size)!; // until the right size loads
    const { cell, columns, firstChar, advances, widths } = a.doc;
    // Stretch only by what rounding the size left over (none at whole sizes).
    const stretch = (this.size * k) / a.px;
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

/**
 * System-font text (Verdana, not embedded). At the original 1:1 scale it's drawn
 * without anti-aliasing, as Windows drew small text into Director's text members;
 * at any other scale the browser draws it at the device's resolution.
 */
export class SystemText {
  private cache = new Map<string, HTMLCanvasElement>();

  constructor(
    private readonly weight: string,
    private readonly sizePx: number,
    private readonly family: string,
  ) {}

  private font(px: number) {
    return `${this.weight} ${px}px ${this.family}`;
  }

  draw(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
    const k = deviceScale(ctx);
    if (Math.abs(k - 1) > 0.05) {
      const p = ctx.getTransform().transformPoint(new DOMPoint(x, y));
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.font = this.font(this.sizePx * k);
      ctx.textBaseline = 'top';
      ctx.fillStyle = color;
      ctx.fillText(text, Math.round(p.x), Math.round(p.y));
      ctx.restore();
      return;
    }
    const key = `${text}|${color}`;
    let c = this.cache.get(key);
    if (!c) {
      c = document.createElement('canvas');
      const m = c.getContext('2d')!;
      m.font = this.font(this.sizePx);
      c.width = Math.ceil(m.measureText(text).width) + 4;
      c.height = this.sizePx * 2;
      const g = c.getContext('2d')!;
      g.font = this.font(this.sizePx);
      g.textBaseline = 'top';
      g.fillStyle = color;
      g.fillText(text, 0, 0);
      const img = g.getImageData(0, 0, c.width, c.height);
      for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i] >= 128 ? 255 : 0;
      g.putImageData(img, 0, 0);
      if (this.cache.size > 64) this.cache.clear();
      this.cache.set(key, c);
    }
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(c, x, y);
    ctx.restore();
  }
}
