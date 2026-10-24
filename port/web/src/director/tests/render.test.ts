// Drawing: the order sprites are drawn in, inks (render.ts inkedBitmap / remap),
// sprite geometry (sprite.ts rect, regPoint, stretch, rounding).

import { DColor } from '../color';
import { BitmapMember, CastLib } from '../members';
import { drawSprite, inkedBitmap, remap } from '../render';
import { Sprite } from '../sprite';
import { DImage } from '../image';
import { bitmap, describe, eq, ok, play, test, world3d } from './harness';

const RED = new DColor(255, 0, 0);
const WHITE = new DColor(255, 255, 255);
const BLACK = new DColor(0, 0, 0);

const cast = new CastLib(9, 'render-tests', '', null);
let memberNum = 0;

/** A bitmap member of a given depth with pixels drawn by `paint`. */
function bmp(w: number, h: number, depth: number, paint: (img: DImage) => void, reg: [number, number] = [0, 0]): BitmapMember {
  const m = new BitmapMember(cast, ++memberNum, `b${memberNum}`, { lib: 9, num: memberNum, name: '', type: 'Bitmap', width: w, height: h, depth, reg });
  paint(m.image);
  return m;
}

function spriteWith(m: BitmapMember, o: Partial<{ ink: number; fore: DColor; back: DColor; loc: [number, number] }> = {}): Sprite {
  const s = new Sprite(1);
  s.member = m;
  s.ink = o.ink ?? 0;
  if (o.fore) s.foreColor = o.fore;
  if (o.back) s.backColor = o.back;
  if (o.loc) [s.locH, s.locV] = o.loc;
  return s;
}

/** A 3x3 white image with a black pixel in the middle. */
const dot = (depth: number) => bmp(3, 3, depth, (img) => img.setPixel(1, 1, BLACK));

const pixel = (canvas: HTMLCanvasElement, x: number, y: number) => Array.from(canvas.getContext('2d')!.getImageData(x, y, 1, 1).data);

describe('drawing order', () => {
  test('sprites draw by locZ, then channel; empty and invisible channels are skipped', 'Director docs (locZ; equal locZ draws in channel order)', async () => {
    const p = await play({
      frames: 1,
      members: [bitmap(1, 10, 10)],
      sprites: [1, 2, 3, 4, 5].map((ch) => ({ ch, frames: [1, 1] as [number, number], member: 1 })),
    });
    p.stepFrame();
    p.sprite(2).locZ = 10;
    p.sprite(4).visible = false;
    p.sprite(5).locZ = 1;
    eq(p.drawOrder().map((s) => s.spriteNum), [1, 5, 3, 2]);
  });
});

describe('inks', () => {
  test('copy ink: every pixel opaque', 'Director docs (copy ink)', () => {
    const m = dot(32);
    const { alpha } = inkedBitmap(spriteWith(m), m);
    ok(alpha.every((a) => a === 255), 'opaque');
  });

  test('background transparent: pixels of the background colour (white by default) are keyed out', 'Director docs (background transparent ink)', () => {
    const m = dot(32);
    const { alpha } = inkedBitmap(spriteWith(m, { ink: 36 }), m);
    eq(Array.from(alpha), [0, 0, 0, 0, 255, 0, 0, 0, 0]);
  });

  test('background transparent keys out the sprite\'s bgColor', 'Director docs (background transparent ink uses the sprite\'s background colour)', () => {
    const m = bmp(2, 1, 32, (img) => img.setPixel(1, 0, RED));
    const { alpha } = inkedBitmap(spriteWith(m, { ink: 36, back: RED }), m);
    eq(Array.from(alpha), [255, 0]);
  });

  test('an 8-bit image with background transparent keeps its colours and only keys out the bgColor', 'Adobe measurement (render.ts: the Paintshop\'s grey map1A on a magenta bgColor stays grey with ink 36, and turns 139,0,139 with copy or matte)', () => {
    const grey = new DColor(136, 136, 136);
    const magenta = new DColor(255, 0, 255);
    const m = bmp(2, 1, 8, (img) => {
      img.setPixel(0, 0, grey);
      img.setPixel(1, 0, magenta);
    });
    const s = spriteWith(m, { ink: 36, back: magenta });
    const { canvas, alpha } = inkedBitmap(s, m);
    eq(Array.from(alpha), [255, 0], 'magenta keyed');
    const g = m.image.getPixel(0, 0) as DColor;
    eq(pixel(canvas, 0, 0).slice(0, 3), [g.r, g.g, g.b], 'grey kept');
    // With copy ink the same sprite colourises: white shows as the bgColor.
    const s2 = spriteWith(m, { ink: 0, back: magenta });
    ok(pixel(inkedBitmap(s2, m).canvas, 0, 0).join() !== pixel(canvas, 0, 0).join(), 'copy ink colourises the grey');
  });

  test('matte: only white connected to the edges is transparent', 'Director docs (matte ink removes the white bounding area, keeps enclosed white)', () => {
    // 5x5: a black ring around a white centre.
    const m = bmp(5, 5, 32, (img) => img.draw({ left: 1, top: 1, right: 4, bottom: 4 }, { shapeType: 'rect', lineSize: 1, color: BLACK }));
    const { alpha } = inkedBitmap(spriteWith(m, { ink: 8 }), m);
    const at = (x: number, y: number) => alpha[y * 5 + x];
    eq([at(0, 0), at(1, 1), at(2, 2), at(4, 4)], [0, 255, 255, 0], 'outside white clear, ring and enclosed white opaque');
  });

  test('colourising: in 1- and 8-bit art black shows as the foreColor and white as the backColor', 'Director docs (foreColor/backColor tint 1-bit and 8-bit bitmaps)', () => {
    const m = dot(8);
    const { canvas } = inkedBitmap(spriteWith(m, { fore: RED, back: WHITE }), m);
    eq(pixel(canvas, 1, 1).slice(0, 3), [255, 0, 0], 'black -> red');
    eq(pixel(canvas, 0, 0).slice(0, 3), [255, 255, 255], 'white stays the backColor');
  });

  test('32-bit images are not colourised', 'Director docs (colour changes apply to 8-bit and lower)', () => {
    const m = dot(32);
    const { canvas } = inkedBitmap(spriteWith(m, { fore: RED, back: WHITE }), m);
    eq(pixel(canvas, 1, 1).slice(0, 3), [0, 0, 0]);
  });

  test('remap: black text shows in the foreColor, white in the backColor, greys in between', 'Director (text and fields take the sprite\'s colours the same way)', () => {
    eq(remap(BLACK, RED, WHITE).css, 'rgb(255,0,0)');
    eq(remap(WHITE, RED, new DColor(0, 0, 255)).css, 'rgb(0,0,255)');
    eq(remap(new DColor(51, 51, 51), BLACK, WHITE).css, 'rgb(51,51,51)', 'black on white: unchanged');
  });

  test('a copy-ink bitmap draws at its loc less its regPoint', 'Director docs (regPoint)', () => {
    const m = bmp(4, 4, 32, (img) => img.fill(img.rect, RED), [2, 2]);
    const s = spriteWith(m, { loc: [10, 10] });
    const c = document.createElement('canvas');
    c.width = c.height = 20;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    drawSprite(ctx, s, null);
    eq(pixel(c, 8, 8), [255, 0, 0, 255], 'top-left at 8,8');
    eq(pixel(c, 11, 11), [255, 0, 0, 255], 'bottom-right at 11,11');
    eq(pixel(c, 12, 12)[3], 0, 'nothing at 12,12');
    eq(pixel(c, 7, 7)[3], 0, 'nothing at 7,7');
  });

  test('blend draws the sprite partly transparent', 'Director docs (blend)', () => {
    const m = bmp(1, 1, 32, (img) => img.fill(img.rect, RED));
    const s = spriteWith(m);
    s.blend = 50;
    const c = document.createElement('canvas');
    c.width = c.height = 2;
    drawSprite(c.getContext('2d')!, s, null);
    const a = pixel(c, 0, 0)[3];
    ok(a > 120 && a < 135, `alpha ${a} is about half`);
  });
});

describe('sprite geometry', () => {
  test('rect is loc less regPoint, the member\'s size', 'Director docs (sprite.rect, regPoint)', async () => {
    const p = await play({ frames: 1, members: [bitmap(1, 20, 10, { reg: [10, 5] })], sprites: [{ ch: 1, frames: [1, 1], member: 1, loc: [100, 100] }] });
    p.stepFrame();
    const s = p.sprite(1);
    eq([s.left, s.top, s.right, s.bottom], [90, 95, 110, 105]);
    eq([s.width, s.height], [20, 10]);
  });

  test('a stretched sprite scales its regPoint with it', 'Director (the registration point keeps its relative place in a stretched sprite)', async () => {
    const p = await play({ frames: 1, members: [bitmap(1, 20, 10, { reg: [10, 5] })], sprites: [{ ch: 1, frames: [1, 1], member: 1, loc: [100, 100], size: [40, 10], stretch: true }] });
    p.stepFrame();
    const s = p.sprite(1);
    eq(s.regPoint(), [20, 5]);
    eq([s.left, s.right], [80, 120]);
    s.width = 10;
    eq([s.left, s.right], [95, 105], 'width set by a script');
  });

  test('setting sprite.rect moves and stretches the sprite to fill it', 'Director docs (sprite.rect)', async () => {
    const p = await play({ frames: 1, members: [bitmap(1, 20, 10, { reg: [10, 5] })], sprites: [{ ch: 1, frames: [1, 1], member: 1, loc: [100, 100] }] });
    p.stepFrame();
    const s = p.sprite(1);
    s.rect = { left: 0, top: 0, right: 40, bottom: 20 };
    eq([s.left, s.top, s.right, s.bottom], [0, 0, 40, 20]);
    eq([s.locH, s.locV], [20, 10]);
  });

  test('fractional locations and sizes round half away from zero', 'Adobe measurement (sprite.ts: 1210.7 -> 1211, -0.5 -> -1, 47.6 -> 48; dirplayer truncates)', () => {
    const s = new Sprite(1);
    const r: number[] = [];
    for (const v of [1210.7, -0.5, 47.6, 10.5, 10.4, -2.6]) {
      s.locH = v;
      r.push(s.locH);
    }
    eq(r, [1211, -1, 48, 11, 10, -3]);
    s.locV = 2.5;
    eq(s.locV, 3, 'locV');
    s.width = 9.5;
    eq(s.width, 10, 'width');
  });

  test('3D sprites are registered at their centre', 'Adobe measurement (sprite.ts: the arena\'s 750x449 view at loc 402,233 starts at 27,9)', async () => {
    const p = await play({ frames: 1, members: [world3d(1)], sprites: [{ ch: 1, frames: [1, 1], member: 1, loc: [402, 233], size: [750, 449], stretch: true }] });
    p.stepFrame();
    eq([p.sprite(1).left, p.sprite(1).top], [27, 9]);
  });
});
