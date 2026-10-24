// A sprite channel. The score sets its properties each frame; properties a script
// sets stay until the sprite's span ends, or for as long as the channel is a puppet.

import { LColor, LPoint, LRect, point, num } from '../lingo';
import { BLACK, DColor, WHITE } from './color';
import { getScriptProp, setScriptProp } from './dispatch';
import type { DRect } from './image';
import { BitmapMember, FieldMember, Member, TextMember, TextualMember } from './members';

/** Lingo colours (rgb(), paletteIndex(), a bare index) as the runtime's colours. */
export function toDColor(c: DColor | LColor | number): DColor {
  if (c instanceof DColor) return c;
  if (typeof c === 'number') return DColor.index(c);
  return c.index !== undefined ? DColor.index(c.index) : new DColor(c.red, c.green, c.blue);
}

export function toLColor(c: DColor): LColor {
  return c.index !== undefined ? new LColor(c.r, c.g, c.b, c.index) : new LColor(c.r, c.g, c.b);
}

export class Sprite {
  /** Finds members by name or number for `sprite.member = "name"` (set by the player). */
  static resolveMember: (m: string | number) => Member | null = () => null;
  private _member: Member | null = null;
  private _locH = 0;
  private _locV = 0;
  /** Set when the sprite is drawn at its own size rather than the member's. */
  stretch = false;
  private w = 0;
  private h = 0;
  ink = 0;
  blend = 100;
  visible = true;
  private _fore: DColor = BLACK;
  private _back: DColor = WHITE;
  rotation = 0;
  skew = 0;
  flipH = false;
  flipV = false;
  /** Drawing order; defaults to the channel number. */
  locZ: number;
  cursor: number | unknown = 0;
  editable = false;
  moveable = false;
  private _puppet = false;
  /** Set when a script releases the puppet: the score takes the channel back in full. */
  released = false;
  get puppet() {
    return this._puppet;
  }
  set puppet(v: boolean) {
    if (this._puppet && !v) this.released = true;
    this._puppet = !!v;
  }
  scriptInstanceList: object[] = [];
  /** The score span this sprite belongs to (key "start-end"), or null when empty. */
  span: string | null = null;
  /** Arbitrary renderer state (3D sprites). */
  userData: Record<string, unknown> = {};

  constructor(readonly spriteNum: number) {
    this.locZ = spriteNum;
  }

  get channel() {
    return this.spriteNum;
  }

  /**
   * A sprite's location and size are whole pixels: Adobe's player rounds a fractional
   * locH/locV/loc/width/height half away from zero (checked: 1210.7 -> 1211, -0.5 -> -1,
   * 47.6 -> 48). dirplayer truncates instead; `Sprite.truncate` switches to that, for
   * comparing the arena's driving with dirplayer tick by tick (port/tools/physics-trace.mjs).
   */
  static truncate = false;
  static whole(v: unknown): number {
    const x = num(v as number);
    return Sprite.truncate ? Math.trunc(x) : Math.sign(x) * Math.round(Math.abs(x));
  }

  get locH() {
    return this._locH;
  }
  set locH(v: number) {
    this._locH = Sprite.whole(v);
  }
  get locV() {
    return this._locV;
  }
  set locV(v: number) {
    this._locV = Sprite.whole(v);
  }

  /** Typed loosely, as Lingo is (`sprite(n).member.text`); `memberRef` is the typed form. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get member(): any {
    return this._member;
  }
  get memberRef(): Member | null {
    return this._member;
  }
  /** sprite.member = member / "name" / number */
  set member(m: Member | string | number | null) {
    this._member = m === null || m instanceof Member ? m : Sprite.resolveMember(m);
  }

  get foreColor(): DColor {
    return this._fore;
  }
  set foreColor(c: DColor | LColor | number) {
    this._fore = toDColor(c);
  }
  get backColor(): DColor {
    return this._back;
  }
  set backColor(c: DColor | LColor | number) {
    this._back = toDColor(c);
  }
  /** sprite.color (rgb form of the foreground colour). */
  get color(): LColor {
    return toLColor(this._fore);
  }
  set color(c: DColor | LColor | number) {
    this._fore = toDColor(c);
  }
  get bgColor(): LColor {
    return toLColor(this._back);
  }
  set bgColor(c: DColor | LColor | number) {
    this._back = toDColor(c);
  }

  get loc(): LPoint {
    return point(this.locH, this.locV);
  }
  set loc(p: LPoint) {
    this.locH = num(p.locH);
    this.locV = num(p.locV);
  }

  /** The sprite's type: 0 for an empty channel. */
  get type() {
    return this._member ? 16 : 0;
  }

  /** memberNum: the member's number in its cast. */
  get memberNum() {
    return this._member?.number ?? 0;
  }

  /** Reset to an empty channel (the span ended, or puppet released with no score sprite). */
  clear() {
    this._member = null;
    this.locH = this.locV = this.w = this.h = 0;
    this.stretch = false;
    this.ink = 0;
    this.blend = 100;
    this._fore = BLACK;
    this._back = WHITE;
    this.rotation = this.skew = 0;
    this.flipH = this.flipV = false;
    // visible belongs to the channel, not the span (Director: "affects all sprites in
    // the channel, regardless of their position in the Score"); a movie switch resets it.
    this.locZ = this.spriteNum;
    this.cursor = 0;
    this.editable = this.moveable = false;
    this.scriptInstanceList = [];
    this.span = null;
    this.userData = {};
  }

  /** The member's natural size. */
  private memberSize(): [number, number] {
    const m = this.member;
    if (!m) return [0, 0];
    return [m.width, m.height];
  }

  get width() {
    return this.stretch ? this.w : this.memberSize()[0];
  }
  set width(v: number) {
    this.h = this.height;
    this.w = Sprite.whole(v);
    this.stretch = true;
  }
  get height() {
    return this.stretch ? this.h : this.memberSize()[1];
  }
  set height(v: number) {
    this.w = this.width;
    this.h = Sprite.whole(v);
    this.stretch = true;
  }

  /** Score size (the channel's authored width and height). */
  setScoreSize(w: number, h: number, stretch: boolean) {
    this.w = w;
    this.h = h;
    this.stretch = stretch;
  }

  /** The member's registration point, scaled to the sprite's size. */
  regPoint(): [number, number] {
    const m = this.member;
    // 3D sprites are registered at their centre (the arena's 750x449 view at loc 402,233 starts at 27,9).
    if (m?.type === 'shockwave3d') return [Math.trunc(this.width / 2), Math.trunc(this.height / 2)];
    if (!(m instanceof BitmapMember)) return [0, 0];
    const [rx, ry] = m.regPoint;
    if (!this.stretch) return [rx, ry];
    const [mw, mh] = this.memberSize();
    return [mw ? Math.round((rx * this.w) / mw) : rx, mh ? Math.round((ry * this.h) / mh) : ry];
  }

  /** The sprite's bounding box on the stage (numbers, for the runtime). */
  get bounds(): DRect {
    const [rx, ry] = this.regPoint();
    const left = Math.trunc(this.locH) - rx;
    const top = Math.trunc(this.locV) - ry;
    return { left, top, right: left + this.width, bottom: top + this.height };
  }

  /** sprite.rect, a Lingo rect. */
  get rect(): LRect {
    const r = this.bounds;
    return new LRect(r.left, r.top, r.right, r.bottom);
  }

  /** sprite.rect = r: move and stretch the sprite to fill r. */
  set rect(lr: DRect | LRect) {
    const r = { left: num(lr.left), top: num(lr.top), right: num(lr.right), bottom: num(lr.bottom) };
    this.w = r.right - r.left;
    this.h = r.bottom - r.top;
    this.stretch = true;
    const [rx, ry] = this.regPoint();
    this.locH = r.left + rx;
    this.locV = r.top + ry;
    if (this.member instanceof TextualMember && !(this.member instanceof BitmapMember)) {
      if (this.member instanceof TextMember) this.member.boxWidth = this.w;
      if (this.member instanceof FieldMember) this.member.rect = { left: 0, top: 0, right: this.w, bottom: this.h };
    }
  }

  get left() {
    return this.bounds.left;
  }
  get top() {
    return this.bounds.top;
  }
  get right() {
    return this.bounds.right;
  }
  get bottom() {
    return this.bounds.bottom;
  }

  /** A script property on one of the sprite's behaviors (sprite(n).pState). */
  getProp(name: string): unknown {
    for (const s of this.scriptInstanceList) {
      const r = getScriptProp(s, name);
      if (r.found) return r.value;
    }
    return undefined;
  }

  setProp(name: string, value: unknown): boolean {
    for (const s of this.scriptInstanceList) if (setScriptProp(s, name, value)) return true;
    return false;
  }

  /** The first behavior of a class (for typed access from translated code). */
  behavior<T>(cls: new (...a: never[]) => T): T | undefined {
    return this.scriptInstanceList.find((s) => s instanceof cls) as T | undefined;
  }
}
