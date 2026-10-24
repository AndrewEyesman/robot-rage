// Director's image object: a bitmap that scripts read and draw into
// (copyPixels, fill, draw, setPixel...). Pixels live in an RGBA buffer; a canvas
// copy is made on demand for drawing to the stage. 8-bit images also keep their
// palette indices, since the paint maps are edited by index.

import { DColor, type RGB } from './color';
import { SYSTEM_MAC_PALETTE } from './palettes';

export interface DRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const rectOf = (left: number, top: number, right: number, bottom: number): DRect => ({ left, top, right, bottom });

export interface CopyProps {
  ink?: number;
  blend?: number;
  color?: DColor;
  bgColor?: DColor;
  maskImage?: DImage;
  useFastQuads?: boolean;
}

export class DImage {
  readonly data: Uint8ClampedArray;
  /** Palette indices for 8-bit images (kept in step with `data`). */
  indices: Uint8Array | null = null;
  palette: RGB[] = SYSTEM_MAC_PALETTE;
  /** Whether the alpha channel counts (32-bit images with useAlpha). */
  useAlpha = false;
  /** Bumped on every change, so cached canvases know to refresh. */
  version = 0;
  private canvasCache: { version: number; canvas: HTMLCanvasElement } | null = null;

  constructor(
    readonly width: number,
    readonly height: number,
    readonly depth = 32,
    data?: Uint8ClampedArray,
  ) {
    this.data = data ?? new Uint8ClampedArray(width * height * 4).fill(255);
    if (depth <= 8 && !this.indices) this.indices = new Uint8Array(width * height);
  }

  static fromImage(img: CanvasImageSource & { width: number; height: number }, depth = 32): DImage {
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const im = new DImage(c.width, c.height, depth, d);
    if (im.indices) im.reindex();
    return im;
  }

  /** Rebuild palette indices from the RGB pixels (nearest colour). */
  reindex() {
    const cache = new Map<number, number>();
    const idx = (this.indices ??= new Uint8Array(this.width * this.height));
    for (let i = 0; i < idx.length; i++) {
      const r = this.data[i * 4],
        g = this.data[i * 4 + 1],
        b = this.data[i * 4 + 2];
      const key = (r << 16) | (g << 8) | b;
      let n = cache.get(key);
      if (n === undefined) {
        n = new DColor(r, g, b).paletteIndex(this.palette);
        cache.set(key, n);
      }
      idx[i] = n;
    }
  }

  get rect(): DRect {
    return rectOf(0, 0, this.width, this.height);
  }

  touch() {
    this.version++;
  }

  /** An indexed image stores palette indices: a colour drawn into it becomes its palette entry. */
  private stored(c: DColor): DColor {
    if (!this.indices || this.depth > 8) return c;
    return DColor.index(c.paletteIndex(this.palette), this.palette);
  }

  canvas(): HTMLCanvasElement {
    if (this.canvasCache?.version === this.version) return this.canvasCache.canvas;
    const canvas = this.canvasCache?.canvas ?? document.createElement('canvas');
    canvas.width = this.width;
    canvas.height = this.height;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(this.width, this.height);
    img.data.set(this.data);
    if (this.depth === 32 && !this.useAlpha) for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
    ctx.putImageData(img, 0, 0);
    this.canvasCache = { version: this.version, canvas };
    return canvas;
  }

  duplicate(): DImage {
    const d = new DImage(this.width, this.height, this.depth, new Uint8ClampedArray(this.data));
    d.indices = this.indices ? new Uint8Array(this.indices) : null;
    d.palette = this.palette;
    d.useAlpha = this.useAlpha;
    return d;
  }

  crop(r: DRect): DImage {
    const w = Math.max(0, r.right - r.left);
    const h = Math.max(0, r.bottom - r.top);
    const out = new DImage(w, h, this.depth);
    out.palette = this.palette;
    out.useAlpha = this.useAlpha;
    out.copyPixels(this, rectOf(0, 0, w, h), r);
    return out;
  }

  getPixel(x: number, y: number, asInteger = false): DColor | number | undefined {
    x = Math.trunc(x);
    y = Math.trunc(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return undefined;
    const i = y * this.width + x;
    if (asInteger && this.indices) return this.indices[i];
    const d = this.data;
    if (this.indices && this.depth <= 8) return DColor.index(this.indices[i], this.palette);
    return new DColor(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
  }

  /** setPixel(x, y, color); on an indexed image an integer is a palette index. */
  setPixel(x: number, y: number, c: DColor | number): boolean {
    x = Math.trunc(x);
    y = Math.trunc(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    const i = y * this.width + x;
    let color: DColor;
    if (typeof c === 'number') {
      if (this.indices) this.indices[i] = c;
      color = this.depth <= 8 ? DColor.index(c, this.palette) : new DColor((c >> 16) & 255, (c >> 8) & 255, c & 255);
    } else {
      color = this.stored(c);
      if (this.indices) this.indices[i] = c.index !== undefined && this.depth <= 8 ? c.index : c.paletteIndex(this.palette);
    }
    this.data[i * 4] = color.r;
    this.data[i * 4 + 1] = color.g;
    this.data[i * 4 + 2] = color.b;
    this.data[i * 4 + 3] = 255;
    this.touch();
    return true;
  }

  /**
   * fill(rect, color {, #oval}): a solid rectangle, or the oval inscribed in it
   * (fill(..., [#shapeType: #oval])), clipped to the image. Float coordinates round,
   * and reversed corners are put in order (Adobe's player: fill(1.5, 1.5, 4.5, 4.5)
   * covers pixels 2-4).
   */
  fill(r: DRect, c: DColor, shape: string = 'rect') {
    c = this.stored(c);
    const b0 = box(r);
    const l = Math.max(0, b0.left);
    const t = Math.max(0, b0.top);
    const rr = Math.min(this.width, b0.right);
    const b = Math.min(this.height, b0.bottom);
    const idx = this.indices ? c.paletteIndex(this.palette) : 0;
    const inside = shape === 'oval' ? ovalTest(b0, 0) : null;
    for (let y = t; y < b; y++)
      for (let x = l; x < rr; x++) {
        if (inside && !inside(x, y)) continue;
        const i = y * this.width + x;
        this.data.set([c.r, c.g, c.b, 255], i * 4);
        if (this.indices) this.indices[i] = idx;
      }
    this.touch();
  }

  /**
   * draw(x1, y1, x2, y2, [#shapeType, #lineSize, #color]): lines, rect outlines and
   * oval outlines. Checked against Adobe's player: a line stops one pixel short of its
   * end point; a rect's or oval's lineSize grows inward from the box. Thick lines
   * are drawn with a round brush (Adobe's brush differs by a pixel here and there).
   * An unknown #shapeType (the Paintshop's #pen) draws a line.
   */
  draw(r: DRect, props: { shapeType?: string; lineSize?: number; color?: DColor }) {
    const c = this.stored(props.color ?? new DColor(0, 0, 0));
    const size = Math.max(1, Math.round(props.lineSize ?? 1));
    const shape = props.shapeType ?? 'line';
    if (shape === 'rect' || shape === 'oval') {
      const b = box(r);
      const outer = shape === 'oval' ? ovalTest(b, 0) : () => true;
      const inner = shape === 'oval' ? ovalTest(b, size) : (x: number, y: number) => x >= b.left + size && x < b.right - size && y >= b.top + size && y < b.bottom - size;
      for (let y = Math.max(0, b.top); y < Math.min(this.height, b.bottom); y++)
        for (let x = Math.max(0, b.left); x < Math.min(this.width, b.right); x++) if (outer(x, y) && !inner(x, y)) this.setPixelQuiet(x, y, c);
      this.touch();
      return;
    }
    const rad = (size - 1) / 2;
    const plot =
      size === 1
        ? (x: number, y: number) => this.setPixelQuiet(x, y, c)
        : (x: number, y: number) => {
            for (let dy = -Math.ceil(rad); dy <= Math.ceil(rad); dy++)
              for (let dx = -Math.ceil(rad); dx <= Math.ceil(rad); dx++) if (dx * dx + dy * dy <= rad * rad + 0.5) this.setPixelQuiet(x + dx, y + dy, c);
          };
    this.line(Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom), plot, true);
    this.touch();
  }

  private line(x0: number, y0: number, x1: number, y1: number, plot: (x: number, y: number) => void, skipLast = false) {
    x0 = Math.trunc(x0);
    y0 = Math.trunc(y0);
    x1 = Math.trunc(x1);
    y1 = Math.trunc(y1);
    const dx = Math.abs(x1 - x0),
      dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1,
      sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      const last = x0 === x1 && y0 === y1;
      if (!(last && skipLast && (dx || dy))) plot(x0, y0);
      if (last) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  private setPixelQuiet(x: number, y: number, c: DColor) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = y * this.width + x;
    this.data[i * 4] = c.r;
    this.data[i * 4 + 1] = c.g;
    this.data[i * 4 + 2] = c.b;
    this.data[i * 4 + 3] = 255;
    if (this.indices) this.indices[i] = c.paletteIndex(this.palette);
  }

  /**
   * copyPixels(source, destRect, sourceRect, props): scale the source rect into the
   * destination rect (nearest neighbour), through the ink. Supported inks: copy (0),
   * matte (8, as background transparent), background transparent (36), blend (32),
   * darkest (39), lightest (40), add pin (33), subtract pin (35); others copy.
   */
  copyPixels(src: DImage, dest: DRect, srcRect: DRect, props: CopyProps = {}) {
    const ink = props.ink ?? 0;
    const blend = (props.blend ?? 100) / 100;
    const bg = props.bgColor ?? new DColor(255, 255, 255);
    const dw = dest.right - dest.left;
    const dh = dest.bottom - dest.top;
    const sw = srcRect.right - srcRect.left;
    const sh = srcRect.bottom - srcRect.top;
    if (dw === 0 || dh === 0 || sw === 0 || sh === 0) return;
    const mask = props.maskImage;
    const colorize = props.color && !props.color.isBlack && src.depth <= 8 ? props.color : null;
    const x0 = Math.max(0, Math.trunc(Math.min(dest.left, dest.right)));
    const x1 = Math.min(this.width, Math.trunc(Math.max(dest.left, dest.right)));
    const y0 = Math.max(0, Math.trunc(Math.min(dest.top, dest.bottom)));
    const y1 = Math.min(this.height, Math.trunc(Math.max(dest.top, dest.bottom)));
    const sd = src.data;
    const dd = this.data;
    for (let y = y0; y < y1; y++) {
      const sy = Math.trunc(srcRect.top + ((y - dest.top) * sh) / dh);
      if (sy < 0 || sy >= src.height) continue;
      for (let x = x0; x < x1; x++) {
        const sx = Math.trunc(srcRect.left + ((x - dest.left) * sw) / dw);
        if (sx < 0 || sx >= src.width) continue;
        const si = (sy * src.width + sx) * 4;
        const di = (y * this.width + x) * 4;
        let r = sd[si],
          g = sd[si + 1],
          b = sd[si + 2];
        let a = src.depth === 32 && src.useAlpha ? sd[si + 3] / 255 : 1;
        if (mask) {
          const mi = (Math.min(mask.height - 1, sy) * mask.width + Math.min(mask.width - 1, sx)) * 4;
          a *= mask.useAlpha ? mask.data[mi + 3] / 255 : 1 - mask.data[mi] / 255;
        }
        if ((ink === 36 || ink === 8) && r === bg.r && g === bg.g && b === bg.b) continue;
        if (colorize) {
          const k = (r + g + b) / 765;
          r = colorize.r + (255 - colorize.r) * k;
          g = colorize.g + (255 - colorize.g) * k;
          b = colorize.b + (255 - colorize.b) * k;
        }
        const dr = dd[di],
          dg = dd[di + 1],
          db = dd[di + 2];
        switch (ink) {
          case 39:
            r = Math.min(r, dr);
            g = Math.min(g, dg);
            b = Math.min(b, db);
            break;
          case 40:
            r = Math.max(r, dr);
            g = Math.max(g, dg);
            b = Math.max(b, db);
            break;
          case 33:
            r = Math.min(255, r + dr);
            g = Math.min(255, g + dg);
            b = Math.min(255, b + db);
            break;
          case 35:
            r = Math.max(0, dr - r);
            g = Math.max(0, dg - g);
            b = Math.max(0, db - b);
            break;
        }
        const k = a * blend;
        dd[di] = dr + (r - dr) * k;
        dd[di + 1] = dg + (g - dg) * k;
        dd[di + 2] = db + (b - db) * k;
        if (this.depth === 32 && this.useAlpha) dd[di + 3] = Math.max(dd[di + 3], k * 255);
        else dd[di + 3] = 255;
        if (this.indices) {
          const pi = (y * this.width + x);
          this.indices[pi] = src.indices && k === 1 && ink === 0 && !colorize ? src.indices[sy * src.width + sx] : new DColor(dd[di], dd[di + 1], dd[di + 2]).paletteIndex(this.palette);
        }
      }
    }
    this.touch();
  }

  /** floodFill(x, y, color). */
  floodFill(x: number, y: number, c: DColor) {
    x = Math.trunc(x);
    y = Math.trunc(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const w = this.width;
    const d = this.data;
    c = this.stored(c);
    const idx = this.indices ? c.paletteIndex(this.palette) : 0;
    // Indexed images fill the area of one palette index; others the area of one colour.
    const ix = this.indices;
    const at = ix ? (i: number) => ix[i] : (i: number) => (d[i * 4] << 16) | (d[i * 4 + 1] << 8) | d[i * 4 + 2];
    const target = at(y * w + x);
    const repl = ix ? idx : (c.r << 16) | (c.g << 8) | c.b;
    if (target === repl) return;
    const stack = [y * w + x];
    while (stack.length) {
      const i = stack.pop()!;
      if (at(i) !== target) continue;
      d[i * 4] = c.r;
      d[i * 4 + 1] = c.g;
      d[i * 4 + 2] = c.b;
      d[i * 4 + 3] = 255;
      if (this.indices) this.indices[i] = idx;
      const px = i % w;
      if (px > 0) stack.push(i - 1);
      if (px < w - 1) stack.push(i + 1);
      if (i >= w) stack.push(i - w);
      if (i < d.length / 4 - w) stack.push(i + w);
    }
    this.touch();
  }

  /** The alpha channel as an 8-bit greyscale image. */
  extractAlpha(): DImage {
    const out = new DImage(this.width, this.height, 8);
    for (let i = 0; i < this.width * this.height; i++) {
      const a = this.useAlpha ? this.data[i * 4 + 3] : 255;
      out.data.set([a, a, a, 255], i * 4);
    }
    out.reindex();
    return out;
  }

  setAlpha(a: number | DImage) {
    for (let i = 0; i < this.width * this.height; i++) this.data[i * 4 + 3] = typeof a === 'number' ? a : a.data[i * 4];
    this.useAlpha = true;
    this.touch();
  }
}

/** A rect's corners rounded and put in order (image fill/draw coordinates). */
function box(r: DRect): DRect {
  const a = Math.round(r.left),
    b = Math.round(r.right),
    c = Math.round(r.top),
    d = Math.round(r.bottom);
  return { left: Math.min(a, b), right: Math.max(a, b), top: Math.min(c, d), bottom: Math.max(c, d) };
}

/** Whether a pixel lies in the oval inscribed in a box, shrunk by `inset` pixels. */
function ovalTest(b: DRect, inset: number): (x: number, y: number) => boolean {
  const cx = (b.left + b.right) / 2;
  const cy = (b.top + b.bottom) / 2;
  const rx = (b.right - b.left) / 2 - inset;
  const ry = (b.bottom - b.top) / 2 - inset;
  if (rx <= 0 || ry <= 0) return () => false;
  return (x, y) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
}
