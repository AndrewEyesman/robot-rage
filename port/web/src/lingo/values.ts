// Lingo's value semantics, for code translated from the game's scripts. Everything here
// was checked against Adobe's Director 10.1 player (tools/reference) unless a comment
// says otherwise; dirplayer differs in places, noted where it matters.
//
// Numbers. VOID is `undefined`. An integer is a plain JS number with an integral value
// (kept to 32 bits by the helpers, which wrap like Director: the maxinteger + 1 is
// -2147483648). A float is either a plain JS number with a fractional part, or an
// `LFloat` box when its value happens to be integral, so 1.0 stays a float:
//
//   ilk(3) = #integer   ilk(2.5) = #float   ilk(lf(1)) = #float   lingoString(lf(1)) = "1.0000"
//
// `lf(x)` makes a float from any JS number (boxing only when needed); `num(v)` unboxes
// anything numeric back to a JS number. value() produces boxes for float literals, so a
// server's `[#a: 1.0000]` survives a value()/string() round trip.
//
// Scalar code whose types are known can keep using plain JS arithmetic (with
// Math.trunc where Lingo divides two integers). Where the types are only known at run
// time, the helpers apply Lingo's rules:
//
//   speed = add(speed, mul(accel, lf(0.5)))   // int + float * float -> float
//   half = div(count, 2)                      // 7 / 2 -> 3, -7 / 2 -> -3
//   n = mod(7.5, 2)                           // floats round first: 8 mod 2 -> 0
//
// Lists, property lists, points and rects are reference types (mutating a shared one
// shows through every reference); `duplicate` deep-copies.

import { byteToChar, charToByte, collate, foldCase } from './charset';
import { lingoString } from './format';

/** A Lingo script error (index out of range, division by zero...). */
export class LingoError extends Error {}

/** A float whose value is integral, so it can't be told from an integer as a JS number. */
export class LFloat {
  constructor(readonly v: number) {}
  valueOf(): number {
    return this.v;
  }
}

export type LNum = number | LFloat;

export type LValue =
  | undefined
  | number
  | string
  | LFloat
  | LSymbol
  | LList
  | LPropList
  | LPoint
  | LRect
  | LColor
  | LVector
  | object;

/** A float from a JS number: plain when fractional (or NaN/INF), boxed when integral. */
export function lf(x: number): LNum {
  return Number.isInteger(x) ? new LFloat(x) : x;
}

export function isNum(v: LValue): v is LNum {
  return typeof v === 'number' || v instanceof LFloat;
}

export function isFloat(v: LValue): boolean {
  return v instanceof LFloat || (typeof v === 'number' && !Number.isInteger(v));
}

export function isInt(v: LValue): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

/** Unbox to a JS number. VOID is 0; numeric strings parse; anything else is 0. */
export function num(v: LValue): number {
  if (typeof v === 'number') return v;
  if (v instanceof LFloat) return v.v;
  if (typeof v === 'string') return parseNumeric(v) ?? 0;
  return 0;
}

/** Wrap to a signed 32-bit integer (ToInt32: truncate, then modulo 2^32). */
export const i32 = (x: number): number => x | 0;

// Strings read as numbers (comparisons, arithmetic, float()) the way C's strtod does,
// over the whole string: leading whitespace is fine, trailing anything is not.
const NUMERIC = /^[ \t\n\v\f\r]*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
export function parseNumeric(s: string): number | undefined {
  return NUMERIC.test(s) ? Number(s.trim()) : undefined;
}

// ---- symbols ----

export class LSymbol {
  private static readonly table = new Map<string, LSymbol>();
  private constructor(readonly name: string) {}
  /** Symbols are case-insensitive; the first spelling seen is the one displayed. */
  static intern(name: string): LSymbol {
    const key = foldCase(name);
    let s = LSymbol.table.get(key);
    if (!s) LSymbol.table.set(key, (s = new LSymbol(name)));
    return s;
  }
  toString(): string {
    return '#' + this.name;
  }
}

export const sym = (name: string): LSymbol => LSymbol.intern(name);

// ---- lists ----

function toIndex(i: LValue): number {
  const n = integer(i);
  if (typeof n !== 'number') throw new LingoError('index is not a number');
  return n;
}

/** A linear list. Positions are 1-based, as in Lingo. */
export class LList implements Iterable<LValue> {
  /** Set by sort(), cleared by append, addAt and setAt; add() inserts in order while set. */
  sorted = false;
  constructor(public items: LValue[] = []) {}

  get count(): number {
    return this.items.length;
  }
  getAt(i: LValue): LValue {
    const n = toIndex(i);
    if (n < 1 || n > this.items.length) throw new LingoError(`index ${n} out of range`);
    return this.items[n - 1];
  }
  /** Beyond the end, the gap is filled with 0 (as Director does), not VOID. Unsorts the list. */
  setAt(i: LValue, v: LValue): void {
    const n = toIndex(i);
    if (n < 1) throw new LingoError(`index ${n} out of range`);
    this.sorted = false;
    while (this.items.length < n - 1) this.items.push(0);
    this.items[n - 1] = v;
  }
  /** Appends, or inserts in order (after equal items) once the list is sorted. */
  add(v: LValue): void {
    if (!this.sorted) {
      this.items.push(v);
      return;
    }
    let i = this.items.length;
    while (i > 0 && lingoCompare(this.items[i - 1], v) > 0) i--;
    this.items.splice(i, 0, v);
  }
  /** Unsorts the list (a later add() appends). */
  append(v: LValue): void {
    this.items.push(v);
    this.sorted = false;
  }
  /** Unsorts the list, like append. */
  addAt(i: LValue, v: LValue): void {
    const n = toIndex(i);
    if (n < 1) throw new LingoError(`index ${n} out of range`);
    this.sorted = false;
    while (this.items.length < n - 1) this.items.push(0);
    this.items.splice(n - 1, 0, v);
  }
  deleteAt(i: LValue): void {
    const n = toIndex(i);
    if (n < 1 || n > this.items.length) throw new LingoError(`index ${n} out of range`);
    this.items.splice(n - 1, 1);
  }
  deleteOne(v: LValue): void {
    const i = this.items.findIndex((x) => itemEquals(x, v));
    if (i >= 0) this.items.splice(i, 1);
  }
  /** Position of the first item equal to v (see itemEquals), or 0. */
  getPos(v: LValue): number {
    return this.items.findIndex((x) => itemEquals(x, v)) + 1;
  }
  getOne(v: LValue): number {
    return this.getPos(v);
  }
  getLast(): LValue {
    return this.items[this.items.length - 1];
  }
  duplicate(): LList {
    const l = new LList(this.items.map(duplicate));
    l.sorted = this.sorted;
    return l;
  }
  sort(): void {
    this.items.sort(lingoCompare);
    this.sorted = true;
  }
  [Symbol.iterator](): Iterator<LValue> {
    return this.items[Symbol.iterator]();
  }
}

/**
 * A property list. Keys are found with itemEquals: symbols by identity (so
 * case-insensitively), strings case-sensitively, a symbol also finds the string with
 * its spelling ("a" finds #a and #a finds "a"), numbers by value, and a string finds the
 * number that string()s to it ("1" finds 1).
 */
export class LPropList implements Iterable<LValue> {
  sorted = false;
  keys: LValue[] = [];
  values: LValue[] = [];
  constructor(entries: [LValue, LValue][] = []) {
    for (const [k, v] of entries) {
      this.keys.push(k);
      this.values.push(v);
    }
  }

  get count(): number {
    return this.keys.length;
  }
  private find(k: LValue): number {
    return this.keys.findIndex((x) => itemEquals(x, k));
  }
  private insert(k: LValue, v: LValue): void {
    let i = this.keys.length;
    if (this.sorted) while (i > 0 && lingoCompare(this.keys[i - 1], k) > 0) i--;
    this.keys.splice(i, 0, k);
    this.values.splice(i, 0, v);
  }
  /** VOID when missing. */
  getaProp(k: LValue): LValue {
    const i = this.find(k);
    return i < 0 ? undefined : this.values[i];
  }
  /** Replaces the first matching entry, key included (setaProp(#x: 1, "x", 2) gives ["x": 2]); adds when missing. */
  setaProp(k: LValue, v: LValue): void {
    const i = this.find(k);
    if (i < 0) this.insert(k, v);
    else {
      this.keys[i] = k;
      this.values[i] = v;
    }
  }
  /** A script error when missing. */
  getProp(k: LValue): LValue {
    const i = this.find(k);
    if (i < 0) throw new LingoError(`property ${lingoString(k)} not found`);
    return this.values[i];
  }
  setProp(k: LValue, v: LValue): void {
    const i = this.find(k);
    if (i < 0) throw new LingoError(`property ${lingoString(k)} not found`);
    this.keys[i] = k;
    this.values[i] = v;
  }
  /** Adds even when the key exists (duplicates are allowed); in order when sorted. */
  addProp(k: LValue, v: LValue): void {
    this.insert(k, v);
  }
  deleteProp(k: LValue): void {
    const i = this.find(k);
    if (i >= 0) {
      this.keys.splice(i, 1);
      this.values.splice(i, 1);
    }
  }
  private checkIndex(i: LValue): number {
    const n = toIndex(i);
    if (n < 1 || n > this.keys.length) throw new LingoError(`index ${n} out of range`);
    return n - 1;
  }
  getPropAt(i: LValue): LValue {
    return this.keys[this.checkIndex(i)];
  }
  getAt(i: LValue): LValue {
    return this.values[this.checkIndex(i)];
  }
  setAt(i: LValue, v: LValue): void {
    this.values[this.checkIndex(i)] = v;
  }
  deleteAt(i: LValue): void {
    const n = this.checkIndex(i);
    this.keys.splice(n, 1);
    this.values.splice(n, 1);
  }
  /** Position of a key, or VOID. */
  findPos(k: LValue): number | undefined {
    const i = this.find(k);
    return i < 0 ? undefined : i + 1;
  }
  /** Position of a value, or 0. */
  getPos(v: LValue): number {
    return this.values.findIndex((x) => itemEquals(x, v)) + 1;
  }
  /** The key of a value, or 0. */
  getOne(v: LValue): LValue {
    const i = this.values.findIndex((x) => itemEquals(x, v));
    return i < 0 ? 0 : this.keys[i];
  }
  deleteOne(v: LValue): void {
    const i = this.values.findIndex((x) => itemEquals(x, v));
    if (i >= 0) this.deleteAt(i + 1);
  }
  getLast(): LValue {
    return this.values[this.values.length - 1];
  }
  duplicate(): LPropList {
    const p = new LPropList();
    p.keys = this.keys.map(duplicate);
    p.values = this.values.map(duplicate);
    p.sorted = this.sorted;
    return p;
  }
  /** Sorts by key. */
  sort(): void {
    const order = this.keys.map((_, i) => i).sort((a, b) => lingoCompare(this.keys[a], this.keys[b]));
    this.keys = order.map((i) => this.keys[i]);
    this.values = order.map((i) => this.values[i]);
    this.sorted = true;
  }
  /** `pl.name` and `pl.name = v`: getaProp/setaProp with the symbol. */
  prop(name: string | LSymbol, ...value: [LValue] | []): LValue {
    const k = typeof name === 'string' ? sym(name) : name;
    if (value.length) {
      this.setaProp(k, value[0]);
      return value[0];
    }
    return this.getaProp(k);
  }
  /** `repeat with v in pl` walks the values. */
  [Symbol.iterator](): Iterator<LValue> {
    return this.values[Symbol.iterator]();
  }
}

/** `[a, b, c]` */
export const list = (...items: LValue[]): LList => new LList(items);

/** `[k1: v1, k2: v2]` from alternating keys and values. */
export function propList(...kv: LValue[]): LPropList {
  const p = new LPropList();
  for (let i = 0; i + 1 < kv.length; i += 2) p.addProp(kv[i], kv[i + 1]);
  return p;
}

// ---- geometry and colour ----

export class LPoint {
  constructor(public locH: LNum, public locV: LNum) {}
  getAt(i: LValue): LNum {
    const n = toIndex(i);
    if (n === 1) return this.locH;
    if (n === 2) return this.locV;
    throw new LingoError(`index ${n} out of range`);
  }
  duplicate(): LPoint {
    return new LPoint(this.locH, this.locV);
  }
}

export class LRect {
  constructor(public left: LNum, public top: LNum, public right: LNum, public bottom: LNum) {}
  // Measured: rect(1.5, 0, 4, 2).width is 2, so the edges round before subtracting.
  get width(): number {
    return (integer(this.right) as number) - (integer(this.left) as number);
  }
  get height(): number {
    return (integer(this.bottom) as number) - (integer(this.top) as number);
  }
  getAt(i: LValue): LNum {
    const n = toIndex(i);
    const v = [this.left, this.top, this.right, this.bottom][n - 1];
    if (v === undefined) throw new LingoError(`index ${n} out of range`);
    return v;
  }
  duplicate(): LRect {
    return new LRect(this.left, this.top, this.right, this.bottom);
  }
  offset(h: LNum, v: LNum): LRect {
    return new LRect(add(this.left, h), add(this.top, v), add(this.right, h), add(this.bottom, v));
  }
  /** Not normalised: inflate(rect(0, 0, 10, 10), -6, 0) is rect(6, 0, 4, 10). */
  inflate(h: LNum, v: LNum): LRect {
    return new LRect(sub(this.left, h), sub(this.top, v), add(this.right, h), add(this.bottom, v));
  }
  isEmpty(): boolean {
    return num(this.right) <= num(this.left) || num(this.bottom) <= num(this.top);
  }
  /** rect(0, 0, 0, 0) when they don't overlap (touching edges don't). */
  intersect(r: LRect): LRect {
    const out = new LRect(nmax(this.left, r.left), nmax(this.top, r.top), nmin(this.right, r.right), nmin(this.bottom, r.bottom));
    return out.isEmpty() ? new LRect(0, 0, 0, 0) : out;
  }
  /** Empty rects don't count. */
  union(r: LRect): LRect {
    if (this.isEmpty()) return r.duplicate();
    if (r.isEmpty()) return this.duplicate();
    return new LRect(nmin(this.left, r.left), nmin(this.top, r.top), nmax(this.right, r.right), nmax(this.bottom, r.bottom));
  }
  /** Left and top edges are inside, right and bottom aren't. */
  inside(p: LPoint): boolean {
    const h = num(p.locH), v = num(p.locV);
    return h >= num(this.left) && h < num(this.right) && v >= num(this.top) && v < num(this.bottom);
  }
}

const nmax = (a: LNum, b: LNum): LNum => (num(b) > num(a) ? b : a);
const nmin = (a: LNum, b: LNum): LNum => (num(b) < num(a) ? b : a);

export const point = (h: LNum, v: LNum): LPoint => new LPoint(h, v);
export const rect = (l: LNum, t: LNum, r: LNum, b: LNum): LRect => new LRect(l, t, r, b);
export const inside = (p: LPoint, r: LRect): boolean => r.inside(p);
export const intersect = (a: LRect, b: LRect): LRect => a.intersect(b);
export const union = (a: LRect, b: LRect): LRect => a.union(b);
export const inflate = (r: LRect, h: LNum, v: LNum): LRect => r.inflate(h, v);
export const offsetRect = (r: LRect, h: LNum, v: LNum): LRect => r.offset(h, v);

/** rgb(r, g, b), or paletteIndex(n) when `index` is set. */
export class LColor {
  constructor(public red: number, public green: number, public blue: number, public index?: number) {}
  hexString(): string {
    return '#' + [this.red, this.green, this.blue].map((c) => c.toString(16).toUpperCase().padStart(2, '0')).join('');
  }
  duplicate(): LColor {
    return new LColor(this.red, this.green, this.blue, this.index);
  }
}

const channel = (c: LValue): number => Math.max(0, Math.min(255, integer(c) ?? 0));

/** rgb(r, g, b) clamps to 0-255 and rounds; rgb("#RRGGBB") parses hex. */
export function rgb(r: LValue, g?: LValue, b?: LValue): LColor {
  if (typeof r === 'string') {
    // "#RRGGBB", and "0xRRGGBB" which Director reads the same way.
    const h = r.replace(/^#|^0x/i, '');
    return new LColor(parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0);
  }
  return new LColor(channel(r), channel(g), channel(b));
}

export const paletteIndex = (n: number): LColor => new LColor(0, 0, 0, n);

export class LVector {
  constructor(public x: number, public y: number, public z: number) {}
  duplicate(): LVector {
    return new LVector(this.x, this.y, this.z);
  }
  // Vector methods and properties (Director's 3D Lingo; the 3D runtime binds vectors
  // read from nodes, so `model.worldPosition.y = 5` moves the model).
  /** v[1], v[2], v[3] */
  getAt(i: LValue): number {
    const n = toIndex(i);
    if (n === 1) return this.x;
    if (n === 2) return this.y;
    if (n === 3) return this.z;
    throw new LingoError(`index ${n} out of range`);
  }
  setAt(i: LValue, v: LValue): void {
    const n = toIndex(i);
    if (n === 1) this.x = num(v);
    else if (n === 2) this.y = num(v);
    else if (n === 3) this.z = num(v);
    else throw new LingoError(`index ${n} out of range`);
  }
  length(): number {
    return Math.hypot(this.x, this.y, this.z);
  }
  get magnitude(): number {
    return this.length();
  }
  dot(o: LVector): number {
    return this.x * o.x + this.y * o.y + this.z * o.z;
  }
  dotProduct(o: LVector): number {
    return this.dot(o);
  }
  cross(o: LVector): LVector {
    return new LVector(this.y * o.z - this.z * o.y, this.z * o.x - this.x * o.z, this.x * o.y - this.y * o.x);
  }
  crossProduct(o: LVector): LVector {
    return this.cross(o);
  }
  perpendicularTo(o: LVector): LVector {
    return this.cross(o);
  }
  /** In place. */
  normalize(): void {
    const l = this.length();
    if (l > 0) {
      const x = this.x / l, y = this.y / l, z = this.z / l;
      this.x = x;
      this.y = y;
      this.z = z;
    }
  }
  getNormalized(): LVector {
    const v = this.duplicate();
    v.normalize();
    return v;
  }
  distanceTo(o: LVector): number {
    return Math.hypot(this.x - o.x, this.y - o.y, this.z - o.z);
  }
  /** Degrees. */
  angleBetween(o: LVector): number {
    const l = this.length() * o.length();
    return l ? (Math.acos(Math.max(-1, Math.min(1, this.dot(o) / l))) * 180) / Math.PI : 0;
  }
}

export const vector = (x: LValue = 0, y: LValue = 0, z: LValue = 0): LVector => new LVector(num(x), num(y), num(z));

/** Deep copy of lists, property lists, points, rects, colours and vectors; other values as they are. */
export function duplicate<T extends LValue>(v: T): T {
  if (v instanceof LList || v instanceof LPropList || v instanceof LPoint || v instanceof LRect || v instanceof LColor || v instanceof LVector)
    return v.duplicate() as T;
  return v;
}

// ---- types ----

const ILK: [Function, string][] = [
  [LFloat, 'float'], [LSymbol, 'symbol'], [LList, 'list'], [LPropList, 'propList'], [LPoint, 'point'],
  [LRect, 'rect'], [LColor, 'color'], [LVector, 'vector'],
];

/** ilk(v) is the type symbol; ilk(v, #type) tests it (#list also matches proplists, points and rects; #number ints and floats). */
export function ilk(v: LValue): LSymbol;
export function ilk(v: LValue, type: LSymbol): boolean;
export function ilk(v: LValue, type?: LSymbol): LSymbol | boolean {
  let name = 'instance';
  if (v === undefined) name = 'void';
  else if (typeof v === 'number') name = Number.isInteger(v) ? 'integer' : 'float';
  else if (typeof v === 'string') name = 'string';
  else for (const [cls, n] of ILK) if (v instanceof cls) name = n;
  const s = sym(name);
  if (!type) return s;
  if (type === s) return true;
  if (type === sym('list')) return listp(v);
  if (type === sym('number')) return isNum(v);
  if (type === sym('object')) return objectp(v);
  return false;
}

export const voidp = (v: LValue): boolean => v === undefined;
export const stringp = (v: LValue): v is string => typeof v === 'string';
export const integerp = (v: LValue): v is number => isInt(v);
export const floatp = (v: LValue): boolean => isFloat(v);
export const symbolp = (v: LValue): v is LSymbol => v instanceof LSymbol;
/** Lists, property lists, points and rects. */
export const listp = (v: LValue): boolean => v instanceof LList || v instanceof LPropList || v instanceof LPoint || v instanceof LRect;
/** Anything but VOID, numbers, strings and symbols. */
export const objectp = (v: LValue): boolean => v !== undefined && typeof v === 'object' && !(v instanceof LFloat) && !(v instanceof LSymbol);

// ---- conversions ----

/**
 * integer(): floats round half away from zero and wrap to 32 bits. Strings go through
 * Lingo's tokenizer: leading spaces and tabs, an optional "-" (spaces may follow), then
 * digits, which must not run into letters or a "." ("12 abc" and "12,3" are 12, "12abc"
 * and "3.7" are VOID). A line break or "--" comment first gives 0. Others are VOID.
 */
export function integer(v: LValue): number | undefined {
  if (typeof v === 'number') return Number.isInteger(v) ? v : i32(roundHalfAway(v));
  if (v instanceof LFloat) return i32(v.v);
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/^[ \t]+/, '');
  if (s === '') return undefined;
  if (/^(\r|\n|--)/.test(s)) return 0;
  const m = /^(-[ \t]*)?(\d+)(?![\w.])/.exec(s);
  if (!m) return undefined;
  // Overflow wraps: integer("2147483648") is -2147483648.
  const n = Number(BigInt.asIntN(32, BigInt(m[2])));
  return m[1] ? i32(-n) : n;
}

const roundHalfAway = (x: number): number => (x < 0 ? -Math.round(-x) : Math.round(x));

/** float(): numbers become floats; a numeric string parses (else the string comes back unchanged); others come back as they are. */
export function float(v: LValue): LValue {
  if (typeof v === 'number' || v instanceof LFloat) return lf(num(v));
  if (typeof v === 'string') {
    const n = parseNumeric(v);
    return n === undefined ? v : lf(n);
  }
  return v;
}

/**
 * symbol() reads one token: leading spaces, tabs and LFs are skipped, then the name is
 * the run of letters, digits and "_" (" abc" and LF & "abc" give #abc, "a-b", "a.b" and
 * "hello world" give #a / #hello, "1abc" gives #1abc). A RETURN first gives the empty
 * symbol; another character first is a one-character name.
 */
export function symbol(v: LValue): LSymbol | undefined {
  if (v instanceof LSymbol) return v;
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/^[ \t\n]+/, '');
  if (s === '' || s[0] === '\r') return sym('');
  return sym(/^\w+/.exec(s)?.[0] ?? s[0]);
}

// ---- arithmetic ----

type Op = 'add' | 'sub' | 'mul' | 'div';

function scalar(v: LValue): LNum {
  if (typeof v === 'number' || v instanceof LFloat) return v;
  if (v === undefined) return 0;
  // Strings take part as floats ("3" + 4 is 7.0). Director turns a non-numeric string
  // into garbage; 0.0 here.
  if (typeof v === 'string') return lf(parseNumeric(v) ?? 0);
  throw new LingoError(`can't do arithmetic on ${lingoString(v)}`);
}

function arith(op: Op, a: LValue, b: LValue): LValue {
  // Points, rects, vectors and lists work per element; list with list stops at the shorter.
  if (a instanceof LPoint || b instanceof LPoint) {
    const [ah, av] = a instanceof LPoint ? [a.locH, a.locV] : [a, a];
    const [bh, bv] = b instanceof LPoint ? [b.locH, b.locV] : [b, b];
    return new LPoint(arith(op, ah, bh) as LNum, arith(op, av, bv) as LNum);
  }
  if (a instanceof LRect || b instanceof LRect) {
    const ea = a instanceof LRect ? [a.left, a.top, a.right, a.bottom] : [a, a, a, a];
    const eb = b instanceof LRect ? [b.left, b.top, b.right, b.bottom] : [b, b, b, b];
    const e = ea.map((x, i) => arith(op, x, eb[i]) as LNum);
    return new LRect(e[0], e[1], e[2], e[3]);
  }
  if (a instanceof LVector || b instanceof LVector) {
    const ea = a instanceof LVector ? [a.x, a.y, a.z] : [num(a), num(a), num(a)];
    const eb = b instanceof LVector ? [b.x, b.y, b.z] : [num(b), num(b), num(b)];
    const e = ea.map((x, i) => num(arith(op, lf(x), lf(eb[i]))));
    return new LVector(e[0], e[1], e[2]);
  }
  if (a instanceof LList || b instanceof LList) {
    if (a instanceof LList && b instanceof LList) {
      const n = Math.min(a.count, b.count);
      return new LList(a.items.slice(0, n).map((x, i) => arith(op, x, b.items[i])));
    }
    return a instanceof LList ? new LList(a.items.map((x) => arith(op, x, b))) : new LList((b as LList).items.map((x) => arith(op, a, x)));
  }
  const x = scalar(a), y = scalar(b);
  if (isInt(x) && isInt(y)) {
    switch (op) {
      case 'add': return i32(x + y);
      case 'sub': return i32(x - y);
      case 'mul': return Math.imul(x, y);
      case 'div':
        if (y === 0) throw new LingoError('division by zero');
        return i32(x / y);
    }
  }
  const p = num(x), q = num(y);
  switch (op) {
    case 'add': return lf(p + q);
    case 'sub': return lf(p - q);
    case 'mul': return lf(p * q);
    case 'div':
      if (q === 0) throw new LingoError('division by zero');
      return lf(p / q);
  }
}

/** `a + b`: int + int wraps at 32 bits; a float on either side gives a float. */
export function add(a: LNum, b: LNum): LNum;
export function add(a: LValue, b: LValue): LValue;
export function add(a: LValue, b: LValue): LValue {
  return arith('add', a, b);
}
export function sub(a: LNum, b: LNum): LNum;
export function sub(a: LValue, b: LValue): LValue;
export function sub(a: LValue, b: LValue): LValue {
  return arith('sub', a, b);
}
export function mul(a: LNum, b: LNum): LNum;
export function mul(a: LValue, b: LValue): LValue;
export function mul(a: LValue, b: LValue): LValue {
  // vector * vector is the dot product in Lingo.
  if (a instanceof LVector && b instanceof LVector) return lf(a.x * b.x + a.y * b.y + a.z * b.z);
  return arith('mul', a, b);
}
/** `a / b`: int / int truncates toward zero. Division by zero is a script error. */
export function div(a: LNum, b: LNum): LNum;
export function div(a: LValue, b: LValue): LValue;
export function div(a: LValue, b: LValue): LValue {
  return arith('div', a, b);
}

/** `a mod b`: both round to integers first (half away from zero); the sign follows a, as in C. */
export function mod(a: LValue, b: LValue): number {
  const x = integer(isNum(a) ? a : scalar(a)) ?? 0, y = integer(isNum(b) ? b : scalar(b)) ?? 0;
  if (y === 0) throw new LingoError('division by zero');
  return i32(x % y);
}

/** Unary minus. */
export function neg(a: LValue): LValue {
  if (a instanceof LPoint || a instanceof LRect || a instanceof LVector || a instanceof LList) return arith('mul', a, -1);
  if (isInt(a)) return i32(-a);
  // -0.0 keeps its sign: value("-0.0") is -0.0000.
  if (isNum(a)) return lf(-num(a));
  return arith('sub', 0, a);
}

// ---- comparison ----

const FLOAT_EPSILON = 1e-13;

function numEquals(a: LNum, b: LNum): boolean {
  if (isInt(a) && isInt(b)) return a === b;
  // Float `=` has a tolerance: 0.1 + 0.2 = 0.3, 1.0 = 1.0 + 1e-13, but not 1.0 + 1.1e-13.
  return Math.abs(num(a) - num(b)) < FLOAT_EPSILON;
}

function components(v: LValue): LValue[] | undefined {
  if (v instanceof LList) return v.items;
  if (v instanceof LPropList) return v.values;
  if (v instanceof LPoint) return [v.locH, v.locV];
  if (v instanceof LRect) return [v.left, v.top, v.right, v.bottom];
  if (v instanceof LVector) return [lf(v.x), lf(v.y), lf(v.z)];
  return undefined;
}

/**
 * Lingo `=`. Strings compare through Director's case fold (charset.ts); a string that
 * reads as a number compares numerically with a number ("1" = 1, " 1" = 1, "1 " <> 1);
 * VOID equals 0 but not ""; a symbol never equals a string. Lists, points and rects
 * compare element by element with itemEquals (so ["a"] <> ["A"] but [#a] = ["a"]); a
 * property list compares only its values, in order ([#a: 1] = [#b: 1]), and [] <> [:].
 */
export function lingoEquals(a: LValue, b: LValue): boolean {
  if (a === b) return true;
  if (a === undefined) a = 0;
  if (b === undefined) b = 0;
  if (isNum(a) && isNum(b)) return numEquals(a, b);
  if (typeof a === 'string' && typeof b === 'string') return a.length === b.length && foldCase(a) === foldCase(b);
  if (typeof a === 'string' && isNum(b)) return stringNumEquals(a, b);
  if (typeof b === 'string' && isNum(a)) return stringNumEquals(b, a);
  if (a instanceof LColor && b instanceof LColor)
    return a.index === b.index && a.red === b.red && a.green === b.green && a.blue === b.blue;
  if (a instanceof LPropList !== b instanceof LPropList) return false;
  const ca = components(a), cb = components(b);
  if (ca && cb) return ca.length === cb.length && ca.every((x, i) => itemEquals(x, cb[i]));
  return false;
}

function stringNumEquals(s: string, n: LNum): boolean {
  const x = parseNumeric(s);
  return x !== undefined && numEquals(lf(x), n);
}

/**
 * Equality inside lists and for list lookups (getPos, getOne, deleteOne, property
 * keys). Unlike `=`, strings are case-sensitive, and a string matches a symbol or
 * number whose string() it is: getPos(["a", "B"], "b") is 0, getPos([1, 2.0, "2"], "2")
 * is 3, getaProp(["a": 1], #a) is 1.
 */
export function itemEquals(a: LValue, b: LValue): boolean {
  if (a === b) return true;
  if (typeof a === 'string' || typeof b === 'string') {
    const other = typeof a === 'string' ? b : a;
    const s = (typeof a === 'string' ? a : b) as string;
    if (typeof other === 'string') return other === s;
    if (other instanceof LSymbol) return other.name === s;
    if (isNum(other)) return lingoString(other) === s;
    return false;
  }
  if (a instanceof LSymbol || b instanceof LSymbol) return false;
  return lingoEquals(a, b);
}

/**
 * Ordering for `<`, `>`, `<=`, `>=` and sort: -1, 0 or 1. Numbers compare exactly (no
 * tolerance); strings collate like Windows ("a" < "A" < "b"; charset.ts); a numeric
 * string against a number compares numerically, any other string against a number
 * compares with the number's string(). VOID is 0 against numbers and "" against strings.
 * Director's sort of mixed types isn't a consistent order, so mixed lists may sort
 * differently from Director.
 */
export function lingoCompare(a: LValue, b: LValue): number {
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) a = isNum(b) ? 0 : '';
  if (b === undefined) b = isNum(a) ? 0 : '';
  const sa = a instanceof LSymbol ? a.name : a, sb = b instanceof LSymbol ? b.name : b;
  if (isNum(sa) && isNum(sb)) return Math.sign(num(sa) - num(sb));
  if (typeof sa === 'string' && typeof sb === 'string') return collate(sa, sb);
  if (typeof sa === 'string' && isNum(sb)) {
    const x = parseNumeric(sa);
    return x === undefined ? collate(sa, lingoString(sb)) : Math.sign(x - num(sb));
  }
  if (typeof sb === 'string' && isNum(sa)) return -lingoCompare(sb, sa);
  return 0;
}

export const lt = (a: LValue, b: LValue): boolean => lingoCompare(a, b) < 0;
export const gt = (a: LValue, b: LValue): boolean => lingoCompare(a, b) > 0;
export const le = (a: LValue, b: LValue): boolean => lingoCompare(a, b) <= 0;
export const ge = (a: LValue, b: LValue): boolean => lingoCompare(a, b) >= 0;

// ---- strings ----

/** `a & b`: both sides as string() gives them (VOID is "", symbols lose their #, lists keep quotes). */
export const concat = (a: LValue, b: LValue): string => lingoString(a) + lingoString(b);
/** `a && b` */
export const concatSpace = (a: LValue, b: LValue): string => lingoString(a) + ' ' + lingoString(b);

/** `a contains b`, through the `=` case fold. Anything contains "". */
export const contains = (a: LValue, b: LValue): boolean => foldCase(lingoString(a)).includes(foldCase(lingoString(b)));
/** `a starts b`, through the `=` case fold. */
export const starts = (a: LValue, b: LValue): boolean => foldCase(lingoString(a)).startsWith(foldCase(lingoString(b)));
/** offset(sub, str): 1-based position through the `=` case fold, 0 when absent; offset("", s) is 1. */
export const offset = (sub: LValue, str: LValue): number => foldCase(lingoString(str)).indexOf(foldCase(lingoString(sub))) + 1;

export function length(s: LValue): number {
  return lingoString(s).length;
}

/** numToChar: Windows-1252, of the low byte (numToChar(321) is "A"). numToChar(0) is a one-character string. */
export const numToChar = (n: LValue): string => byteToChar(integer(n) ?? 0);

/** charToNum of the first character as a Windows-1252 byte; 0 for "". */
export function charToNum(s: LValue): number {
  const str = lingoString(s);
  if (str === '') return 0;
  const b = charToByte(str);
  return b >= 0 ? b : str.charCodeAt(0);
}

// ---- maths ----

export const maxInteger = 2147483647;
export const PI = Math.PI;

const bitArg = (v: LValue): number => {
  // Floats truncate here (bitNot(5.7) is -6), unlike integer(). Strings are a script error.
  if (typeof v === 'string') throw new LingoError('bit operation on a string');
  return i32(num(v));
};
export const bitAnd = (a: LValue, b: LValue): number => bitArg(a) & bitArg(b);
export const bitOr = (a: LValue, b: LValue): number => bitArg(a) | bitArg(b);
export const bitXor = (a: LValue, b: LValue): number => bitArg(a) ^ bitArg(b);
export const bitNot = (a: LValue): number => ~bitArg(a);

/** abs keeps the type; non-numbers (strings included) give 0. */
export function abs(v: LValue): LNum {
  if (isInt(v)) return i32(Math.abs(v));
  if (isNum(v)) return lf(Math.abs(num(v)));
  return 0;
}

/**
 * sqrt of an integer is the rounded integer (sqrt(10) = 3, sqrt(15) = 4); of a float or
 * numeric string, a float. Negative gives NAN. dirplayer always returns a float.
 */
export function sqrt(v: LValue): LNum {
  const x = num(v);
  if (isInt(v) && x >= 0) return Math.round(Math.sqrt(x));
  return lf(Math.sqrt(x));
}

/** Always a float. */
export const power = (a: LValue, b: LValue): LNum => lf(Math.pow(num(a), num(b)));
/** atan(x), or atan(y, x) as atan2. A float. */
export const atan = (a: LValue, b?: LValue): LNum => lf(b === undefined ? Math.atan(num(a)) : Math.atan2(num(a), num(b)));
export const sin = (a: LValue): LNum => lf(Math.sin(num(a)));
export const cos = (a: LValue): LNum => lf(Math.cos(num(a)));
export const tan = (a: LValue): LNum => lf(Math.tan(num(a)));
export const exp = (a: LValue): LNum => lf(Math.exp(num(a)));
export const log = (a: LValue): LNum => lf(Math.log(num(a)));

function extreme(args: LValue[], better: (a: LValue, b: LValue) => boolean): LValue {
  const vals = args.length === 1 && (args[0] instanceof LList || args[0] instanceof LPropList) ? [...args[0]] : args;
  // Director returns the list itself for an empty list; VOID here.
  if (vals.length === 0) return undefined;
  // Ties go to the later value: max(2, 2.0) is 2.0, max(2.0, 2) is 2.
  return vals.reduce((m, v) => (better(m, v) ? m : v));
}
/** max(a, b, ...) or max(list): by lingoCompare. */
export const max = (...args: LValue[]): LValue => extreme(args, gt);
export const min = (...args: LValue[]): LValue => extreme(args, lt);

// ---- random ----

// Director's generator, reconstructed from Adobe's output (the same algorithm as
// ScummVM's Director engine): a 32-bit Galois LFSR (taps 0xA3000000) stepped once per
// call, its state hashed. random(n) is hash mod n + 1. Matches Adobe for every seed
// tried, including the game's cipher seed (rocket_encrypt sets the randomSeed to
// 14204). dirplayer uses an LCG instead, so its sequence differs from the real game.
let seed = (Date.now() & 0x7fffffff) || 1;

const mix = (v: number): number => (((v << 13) ^ v) - (v >> 21)) | 0;
function nextHash(): number {
  seed = seed & 1 ? (seed >>> 1) ^ 0xa3000000 : seed >>> 1;
  const val = mix(Math.imul(seed, 71));
  const res = (Math.imul(val, Math.imul(Math.imul(val, val), 15731) + 789221) + 1376312589) & 0x7fffffff;
  return mix((res + val) | 0);
}

/** the randomSeed (setting 0 gives 1). */
export const randomSeed = (): number => seed | 0;
export const setRandomSeed = (n: number): void => {
  seed = n >>> 0 || 1;
};

/** random(n) is 1..n; random(lo, hi) is lo..hi (undocumented but in Director). random(n <= 0) returns the raw hash. */
export function random(n: LValue, hi?: LValue): number {
  if (hi !== undefined) {
    let a = integer(n) ?? 0, b = integer(hi) ?? 0;
    if (a > b) [a, b] = [b, a];
    return a + random(b - a + 1) - 1;
  }
  const range = integer(n) ?? 0;
  const h = nextHash();
  return range > 0 ? ((h & 0x7fffffff) % range) + 1 : h;
}
