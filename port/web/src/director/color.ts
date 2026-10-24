// Colours as Director stores them on sprites and members: an RGB value or an index
// into the current palette (the Mac system palette unless a movie sets another).

import { SYSTEM_MAC_PALETTE } from './palettes';

export type RGB = [number, number, number];

export class DColor {
  constructor(
    readonly r: number,
    readonly g: number,
    readonly b: number,
    /** Set when the colour was given as a palette index (paletteIndex form). */
    readonly index?: number,
  ) {}

  static rgb(r: number, g: number, b: number) {
    return new DColor(r, g, b);
  }

  static index(i: number, palette: RGB[] = SYSTEM_MAC_PALETTE) {
    const [r, g, b] = palette[((i % 256) + 256) % 256];
    return new DColor(r, g, b, i);
  }

  /** "#RRGGBB" or "RRGGBB". */
  static hex(s: string) {
    const h = s.replace(/^#|^0x/i, '');
    const n = parseInt(h.length === 8 ? h.slice(2) : h, 16);
    return new DColor((n >> 16) & 255, (n >> 8) & 255, n & 255);
  }

  get css() {
    return `rgb(${this.r},${this.g},${this.b})`;
  }

  equals(o: DColor) {
    return o.r === this.r && o.g === this.g && o.b === this.b;
  }

  get isBlack() {
    return this.r === 0 && this.g === 0 && this.b === 0;
  }

  get isWhite() {
    return this.r === 255 && this.g === 255 && this.b === 255;
  }

  /** Nearest palette index (Director's color.paletteIndex on an RGB colour). */
  paletteIndex(palette: RGB[] = SYSTEM_MAC_PALETTE): number {
    if (this.index !== undefined) return this.index;
    let best = 0;
    let dist = Infinity;
    palette.forEach(([r, g, b], i) => {
      const d = (r - this.r) ** 2 + (g - this.g) ** 2 + (b - this.b) ** 2;
      if (d < dist) {
        dist = d;
        best = i;
      }
    });
    return best;
  }
}

export const BLACK = new DColor(0, 0, 0, 255);
export const WHITE = new DColor(255, 255, 255, 0);
