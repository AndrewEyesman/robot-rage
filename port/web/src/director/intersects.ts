// `sprite a intersects b`: whether two sprites' opaque pixels overlap on the stage. The
// arena moves its robots as rotated sprites over hidden collision maps and asks this
// every frame (docs/collision.md), so it has to be exact: both sprites are placed with
// their loc, regPoint, stretch and rotation, and stage pixel centres where their
// rotated rects overlap are tested against both mattes.
//
// Mattes: a matte-ink (8) bitmap of 32 bits with alpha mattes by its alpha (alpha > 0
// is opaque); other matte-ink bitmaps are opaque except the white connected to their
// edges; any other ink makes the whole rect opaque. This is what dirplayer does (the
// fixed build of docs/collision.md), checked against an independent reference over a
// full sweep of the arena's maps; the arena's driving was checked against dirplayer
// tick by tick with it (port/tools/physics-trace.mjs).

import { player } from './api';
import { BitmapMember } from './members';
import { INK } from './render';
import type { Sprite } from './sprite';

interface Matte {
  key: string;
  width: number;
  height: number;
  bits: Uint8Array;
}

const mattes = new WeakMap<BitmapMember, Matte>();

function matteOf(m: BitmapMember): Matte {
  const img = m.image;
  const key = `${m.version}|${img.version}|${img.width}x${img.height}`;
  const cached = mattes.get(m);
  if (cached?.key === key) return cached;
  const { width, height, data } = img;
  const bits = new Uint8Array(width * height);
  if (img.depth === 32 && m.useAlpha) {
    for (let i = 0; i < bits.length; i++) bits[i] = data[i * 4 + 3] > 0 ? 1 : 0;
  } else {
    bits.fill(1);
    const white = (i: number) => data[i * 4] === 255 && data[i * 4 + 1] === 255 && data[i * 4 + 2] === 255;
    const stack: number[] = [];
    const push = (x: number, y: number) => {
      const i = y * width + x;
      if (bits[i] && white(i)) {
        bits[i] = 0;
        stack.push(i);
      }
    };
    for (let x = 0; x < width; x++) {
      push(x, 0);
      push(x, height - 1);
    }
    for (let y = 0; y < height; y++) {
      push(0, y);
      push(width - 1, y);
    }
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % width;
      const y = (i - x) / width;
      if (x > 0) push(x - 1, y);
      if (x < width - 1) push(x + 1, y);
      if (y > 0) push(x, y - 1);
      if (y < height - 1) push(x, y + 1);
    }
  }
  const matte = { key, width, height, bits };
  mattes.set(m, matte);
  return matte;
}

/** A sprite placed for the test: its unrotated rect, rotation about its loc, and matte. */
interface Placed {
  locH: number;
  locV: number;
  rect: [number, number, number, number];
  cos: number;
  sin: number;
  matte: Matte | null;
}

function place(s: Sprite): Placed | null {
  if (!s.member) return null;
  const b = s.bounds;
  const rad = (s.rotation * Math.PI) / 180;
  const m = s.memberRef;
  const matte = m instanceof BitmapMember && s.ink === INK.matte && m.image.width && m.image.height ? matteOf(m) : null;
  return { locH: s.locH, locV: s.locV, rect: [b.left, b.top, b.right, b.bottom], cos: Math.cos(rad), sin: Math.sin(rad), matte };
}

function toStage(p: Placed, x: number, y: number): [number, number] {
  const dx = x - p.locH;
  const dy = y - p.locV;
  return [p.locH + dx * p.cos - dy * p.sin, p.locV + dx * p.sin + dy * p.cos];
}

function boundsOf(p: Placed): [number, number, number, number] {
  const [l, t, r, b] = p.rect;
  const pts = [toStage(p, l, t), toStage(p, r, t), toStage(p, r, b), toStage(p, l, b)];
  return [Math.min(...pts.map((q) => q[0])), Math.min(...pts.map((q) => q[1])), Math.max(...pts.map((q) => q[0])), Math.max(...pts.map((q) => q[1]))];
}

/** Whether the sprite covers a stage point: inside its rotated rect, on its matte. */
function covers(p: Placed, x: number, y: number): boolean {
  const dx = x - p.locH;
  const dy = y - p.locV;
  const sx = p.locH + dx * p.cos + dy * p.sin;
  const sy = p.locV - dx * p.sin + dy * p.cos;
  const [l, t, r, b] = p.rect;
  if (sx < l || sx >= r || sy < t || sy >= b) return false;
  const m = p.matte;
  if (!m) return true;
  const bx = Math.floor(((sx - l) / (r - l)) * m.width);
  const by = Math.floor(((sy - t) / (b - t)) * m.height);
  return bx < m.width && by < m.height && m.bits[by * m.width + bx] === 1;
}

/** sprite a intersects b (sprite numbers or sprites). */
export function intersects(a: number | Sprite, b: number | Sprite): boolean {
  const pa = place(typeof a === 'number' ? player.sprite(Math.trunc(a)) : a);
  const pb = place(typeof b === 'number' ? player.sprite(Math.trunc(b)) : b);
  if (!pa || !pb) return false;
  const [al, at, ar, ab] = boundsOf(pa);
  const [bl, bt, br, bb] = boundsOf(pb);
  const l = Math.max(al, bl);
  const t = Math.max(at, bt);
  const r = Math.min(ar, br);
  const btm = Math.min(ab, bb);
  if (l >= r || t >= btm) return false;
  for (let y = Math.floor(t) + 0.5; y < btm; y++) {
    for (let x = Math.floor(l) + 0.5; x < r; x++) {
      if (covers(pa, x, y) && covers(pb, x, y)) return true;
    }
  }
  return false;
}
