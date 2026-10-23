// The arena's hidden 2D collision map. The original moves each robot as a rotated,
// off-stage sprite and tests it against wall, fence and pit sprites with
// `sprite a intersects b`; this reproduces those sprites and that test.

export interface Matte {
  width: number;
  height: number;
  bits: Uint8Array;
}

/** Load a bitmap member's PNG and build its matte the way matte ink does. */
export async function loadMatte(url: string, useAlpha: boolean): Promise<Matte> {
  const img = await createImageBitmap(await (await fetch(url)).blob());
  const canvas = new OffscreenCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, img.width, img.height);
  const bits = new Uint8Array(width * height);
  if (useAlpha) {
    // 32-bit images with alpha matte by their alpha channel.
    for (let i = 0; i < bits.length; i++) bits[i] = data[i * 4 + 3] > 0 ? 1 : 0;
    return { width, height, bits };
  }
  // Otherwise white pixels connected to the image's edge are transparent.
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
  return { width, height, bits };
}

/** A sprite on the hidden map: a member drawn at `loc` (its regPoint), stretched and rotated. */
export class MapSprite {
  locH = 0;
  locV = 0;
  rotation = 0;

  constructor(
    /** null for copy ink: the whole rect collides. */
    readonly matte: Matte | null,
    readonly memberWidth: number,
    readonly memberHeight: number,
    readonly reg: [number, number],
    public width: number,
    public height: number,
    loc: [number, number],
  ) {
    this.locH = loc[0];
    this.locV = loc[1];
  }

  /** Director stores sprite locations as integers. */
  setLoc(h: number, v: number) {
    this.locH = Math.trunc(h);
    this.locV = Math.trunc(v);
  }

  /** The unrotated rect: loc minus the regPoint (scaled with the stretch, in whole pixels). */
  rect(): [number, number, number, number] {
    const l = this.locH - Math.round((this.reg[0] * this.width) / this.memberWidth);
    const t = this.locV - Math.round((this.reg[1] * this.height) / this.memberHeight);
    return [l, t, l + this.width, t + this.height];
  }

  private toStage(x: number, y: number, c: number, s: number): [number, number] {
    const dx = x - this.locH;
    const dy = y - this.locV;
    return [this.locH + dx * c - dy * s, this.locV + dx * s + dy * c];
  }

  bounds(): [number, number, number, number] {
    const [l, t, r, b] = this.rect();
    const rad = (this.rotation * Math.PI) / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    const pts = [
      this.toStage(l, t, c, s),
      this.toStage(r, t, c, s),
      this.toStage(r, b, c, s),
      this.toStage(l, b, c, s),
    ];
    return [
      Math.min(...pts.map((p) => p[0])),
      Math.min(...pts.map((p) => p[1])),
      Math.max(...pts.map((p) => p[0])),
      Math.max(...pts.map((p) => p[1])),
    ];
  }

  /** Whether the sprite covers a stage point (inside its rotated rect, on its matte). */
  covers(x: number, y: number, rect: [number, number, number, number], c: number, s: number): boolean {
    const dx = x - this.locH;
    const dy = y - this.locV;
    const sx = this.locH + dx * c + dy * s;
    const sy = this.locV - dx * s + dy * c;
    const [l, t, r, b] = rect;
    if (sx < l || sx >= r || sy < t || sy >= b) return false;
    const m = this.matte;
    if (!m) return true;
    const bx = Math.floor(((sx - l) / (r - l)) * m.width);
    const by = Math.floor(((sy - t) / (b - t)) * m.height);
    return bx < m.width && by < m.height && m.bits[by * m.width + bx] === 1;
  }
}

/** `sprite a intersects b`: sample stage pixel centres where the two overlap. */
export function intersects(a: MapSprite, b: MapSprite): boolean {
  const [al, at, ar, ab] = a.bounds();
  const [bl, bt, br, bb] = b.bounds();
  const l = Math.max(al, bl);
  const t = Math.max(at, bt);
  const r = Math.min(ar, br);
  const btm = Math.min(ab, bb);
  if (l >= r || t >= btm) return false;
  const ra = a.rect();
  const rb = b.rect();
  const radA = (a.rotation * Math.PI) / 180;
  const radB = (b.rotation * Math.PI) / 180;
  const ca = Math.cos(radA);
  const sa = Math.sin(radA);
  const cb = Math.cos(radB);
  const sb = Math.sin(radB);
  for (let y = Math.floor(t) + 0.5; y < btm; y++) {
    for (let x = Math.floor(l) + 0.5; x < r; x++) {
      if (a.covers(x, y, ra, ca, sa) && b.covers(x, y, rb, cb, sb)) return true;
    }
  }
  return false;
}
