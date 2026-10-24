// Director's image object (image.ts): copyPixels with inks, fill, draw, setPixel /
// getPixel (indexed too), floodFill, crop.

import { DColor } from '../color';
import { DImage, rectOf } from '../image';
import { SYSTEM_MAC_PALETTE } from '../palettes';
import { describe, eq, ok, test } from './harness';

const RED = new DColor(255, 0, 0);
const BLUE = new DColor(0, 0, 255);
const WHITE = new DColor(255, 255, 255);
const BLACK = new DColor(0, 0, 0);

const rgb = (img: DImage, x: number, y: number) => {
  const c = img.getPixel(x, y) as DColor;
  return [c.r, c.g, c.b];
};
/** The image's rows as strings, one character per pixel: '.' for white, '#' for anything else. */
const rows = (img: DImage) =>
  Array.from({ length: img.height }, (_, y) => Array.from({ length: img.width }, (_, x) => (rgb(img, x, y).join() === '255,255,255' ? '.' : '#')).join(''));

function solid(w: number, h: number, c: DColor, depth = 32) {
  const im = new DImage(w, h, depth);
  im.fill(im.rect, c);
  return im;
}

describe('image ops', () => {
  test('a new image is white', 'Director docs (image(w, h, depth) starts white)', () => {
    eq(rgb(new DImage(2, 2), 1, 1), [255, 255, 255]);
  });

  test('copyPixels copies a source rect into a destination rect, clipped to the image', 'Director docs (copyPixels)', () => {
    const dst = new DImage(4, 4);
    dst.copyPixels(solid(2, 2, RED), rectOf(3, 3, 5, 5), rectOf(0, 0, 2, 2));
    eq(rows(dst), ['....', '....', '....', '...#']);
  });

  test('copyPixels scales to the destination rect (nearest pixel)', 'Director docs (copyPixels stretches the source rect to the destination rect)', () => {
    const src = new DImage(2, 1);
    src.setPixel(0, 0, BLACK);
    const dst = new DImage(4, 2);
    dst.copyPixels(src, rectOf(0, 0, 4, 2), rectOf(0, 0, 2, 1));
    eq(rows(dst), ['##..', '##..']);
  });

  test('copyPixels with background transparent (36) and matte (8) skips the bgColor', 'Director docs (copyPixels #ink; port/web/src/director/image.ts treats matte like background transparent)', () => {
    const src = new DImage(2, 1);
    src.setPixel(1, 0, BLACK);
    for (const ink of [36, 8]) {
      const dst = solid(2, 1, RED);
      dst.copyPixels(src, dst.rect, src.rect, { ink });
      eq([rgb(dst, 0, 0), rgb(dst, 1, 0)], [[255, 0, 0], [0, 0, 0]], `ink ${ink}`);
    }
    const dst = solid(2, 1, RED);
    dst.copyPixels(src, dst.rect, src.rect, { ink: 36, bgColor: BLACK });
    eq([rgb(dst, 0, 0), rgb(dst, 1, 0)], [[255, 255, 255], [255, 0, 0]], 'a #bgColor keyed instead');
  });

  test('copyPixels with #blend mixes source and destination', 'Director docs (copyPixels #blend)', () => {
    const dst = solid(1, 1, BLACK);
    dst.copyPixels(solid(1, 1, WHITE), dst.rect, dst.rect, { blend: 50 });
    const [r] = rgb(dst, 0, 0);
    ok(Math.abs(r - 128) <= 1, `half grey (${r})`);
  });

  test('copyPixels inks: darkest (39), add pin (33), subtract pin (35)', 'Director docs (ink effects); the arena paints damage marks with #ink: 39, the lobby room menu with 33', () => {
    const grey = new DColor(100, 150, 200);
    const src = solid(1, 1, new DColor(120, 120, 120));
    const run = (ink: number) => {
      const d = solid(1, 1, grey);
      d.copyPixels(src, d.rect, d.rect, { ink });
      return rgb(d, 0, 0);
    };
    eq(run(39), [100, 120, 120], 'darkest');
    eq(run(33), [220, 255, 255], 'add pin clamps at 255');
    eq(run(35), [0, 30, 80], 'subtract pin clamps at 0');
  });

  test('copyPixels with a maskImage copies only where the mask is black', 'Director docs (copyPixels #maskImage)', () => {
    const mask = new DImage(2, 1);
    mask.setPixel(0, 0, BLACK);
    const dst = new DImage(2, 1);
    dst.copyPixels(solid(2, 1, RED), dst.rect, dst.rect, { maskImage: mask });
    eq([rgb(dst, 0, 0), rgb(dst, 1, 0)], [[255, 0, 0], [255, 255, 255]]);
  });

  test('copyPixels #color tints an 8-bit source', 'Director docs (copyPixels #color: the foreground colour of 1/8-bit sources)', () => {
    const src = new DImage(1, 1, 8);
    src.setPixel(0, 0, BLACK);
    const dst = new DImage(1, 1);
    dst.copyPixels(src, dst.rect, src.rect, { color: RED });
    eq(rgb(dst, 0, 0), [255, 0, 0]);
  });

  test('copyPixels between 8-bit images keeps palette indices', 'Port rule (image.ts: the paint maps are edited and sent by index)', () => {
    const src = new DImage(1, 1, 8);
    src.setPixel(0, 0, 178);
    const dst = new DImage(1, 1, 8);
    dst.copyPixels(src, dst.rect, src.rect);
    eq(dst.getPixel(0, 0, true), 178);
  });

  test('fill: float corners round, reversed corners are put in order', 'Adobe measurement (image.ts: fill(1.5, 1.5, 4.5, 4.5) covers pixels 2-4)', () => {
    const a = new DImage(6, 6);
    a.fill(rectOf(1.5, 1.5, 4.5, 4.5), BLACK);
    eq(rows(a), ['......', '......', '..###.', '..###.', '..###.', '......']);
    const b = new DImage(6, 6);
    b.fill(rectOf(4.5, 4.5, 1.5, 1.5), BLACK);
    eq(rows(b), rows(a), 'reversed');
  });

  test('fill with #oval fills the inscribed oval', 'Director docs (fill(rect, [#shapeType: #oval, ...]))', () => {
    const a = new DImage(5, 5);
    a.fill(a.rect, BLACK, 'oval');
    eq(rows(a), ['.###.', '#####', '#####', '#####', '.###.']);
  });

  test('draw: a line stops one pixel short of its end point', 'Adobe measurement (image.ts draw)', () => {
    const a = new DImage(5, 1);
    a.draw(rectOf(0, 0, 4, 0), { color: BLACK });
    eq(rows(a), ['####.']);
  });

  test("draw: a rect outline's lineSize grows inward", 'Adobe measurement (image.ts draw)', () => {
    const a = new DImage(6, 6);
    a.draw(rectOf(0, 0, 6, 6), { shapeType: 'rect', lineSize: 2, color: BLACK });
    eq(rows(a), ['######', '######', '##..##', '##..##', '######', '######']);
  });

  test('setPixel / getPixel on a 32-bit image; an integer is 0xRRGGBB; outside the image does nothing', 'Director docs (setPixel, getPixel)', () => {
    const a = new DImage(2, 2);
    ok(a.setPixel(1, 0, RED), 'setPixel returns TRUE');
    eq(rgb(a, 1, 0), [255, 0, 0]);
    a.setPixel(0, 1, 0x0000ff);
    eq(rgb(a, 0, 1), [0, 0, 255], 'integer colour');
    eq(a.setPixel(5, 5, RED), false, 'outside: FALSE');
    eq(a.getPixel(-1, 0), undefined, 'outside: VOID');
    a.setPixel(0.9, 0.9, BLUE);
    eq(rgb(a, 0, 0), [0, 0, 255], 'coordinates truncate');
  });

  test('setPixel / getPixel on an 8-bit image work in palette indices', 'Director docs (getPixel(x, y, #integer) on an indexed image returns the index)', () => {
    const a = new DImage(2, 1, 8);
    a.setPixel(0, 0, 35);
    eq(a.getPixel(0, 0, true), 35, 'index back');
    const c = a.getPixel(0, 0) as DColor;
    eq([c.index, c.r, c.g, c.b], [35, ...SYSTEM_MAC_PALETTE[35]], 'as a colour: paletteIndex form');
    a.setPixel(1, 0, RED);
    eq(a.getPixel(1, 0, true), RED.paletteIndex(), 'an rgb colour becomes its nearest palette entry');
  });

  test('floodFill fills the connected area of one colour (one index on 8-bit images)', 'Director docs (floodFill); the Paintshop bucket', () => {
    const a = new DImage(5, 3);
    a.draw(rectOf(2, 0, 2, 3), { color: BLACK });
    a.setPixel(2, 2, BLACK);
    a.floodFill(0, 0, RED);
    eq(rows(a), ['###..', '###..', '###..']);
    eq(rgb(a, 0, 0), [255, 0, 0]);
    const b = new DImage(3, 1, 8);
    b.setPixel(2, 0, 5);
    b.floodFill(0, 0, new DColor(...SYSTEM_MAC_PALETTE[167]));
    eq([b.getPixel(0, 0, true), b.getPixel(1, 0, true), b.getPixel(2, 0, true)], [167, 167, 5], 'indexed');
  });

  test('crop and duplicate make independent copies', 'Director docs (image.crop, image.duplicate)', () => {
    const a = new DImage(4, 4);
    a.setPixel(2, 2, BLACK);
    const c = a.crop(rectOf(2, 2, 4, 4));
    eq([c.width, c.height, rgb(c, 0, 0)], [2, 2, [0, 0, 0]]);
    const d = a.duplicate();
    d.setPixel(0, 0, RED);
    eq(rgb(a, 0, 0), [255, 255, 255], 'original untouched');
  });
});
