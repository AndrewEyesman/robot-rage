// Cast members and cast libraries. A movie's casts are its internal cast plus the
// shared external casts (robotwars.cct, texter.cct); members are found by number or
// by name (case-insensitive, first match), as Director finds them.

import { DColor, type RGB } from './color';
import type { FieldDoc, MemberDoc, MovieDoc, TextDoc } from './docs';
import { registerEmbeddedFont, type TextStyle } from './fonts';
import { DImage, type DRect, rectOf } from './image';
import { StyledText, charPosToLoc, drawLines, layout, lineLocV, textHeight, type Line, type LayoutOptions, type ParagraphFormat } from './text-layout';
import { LList, point, type LPoint } from '../lingo';

export type MemberType = 'bitmap' | 'text' | 'field' | 'button' | 'shape' | 'sound' | 'script' | 'shockwave3d' | 'font' | 'palette' | 'filmLoop' | 'empty';

export class Member {
  name: string;
  /** Scripts and others can rename members, or erase them. */
  constructor(
    readonly castLib: CastLib,
    public number: number,
    readonly type: MemberType,
    name = '',
  ) {
    this.name = name;
  }

  /** Director's member number across casts: castLib number << 16 | member. */
  get slotNumber() {
    return (this.castLib.number << 16) | this.number;
  }

  get castLibNum() {
    return this.castLib.number;
  }

  /** member.memberNum */
  get memberNum() {
    return this.number;
  }

  /** Bumped whenever the member's look changes (sprites re-render). */
  version = 0;
  touch() {
    this.version++;
  }

  get rect(): DRect {
    return rectOf(0, 0, 0, 0);
  }
  get width() {
    return this.rect.right - this.rect.left;
  }
  get height() {
    return this.rect.bottom - this.rect.top;
  }
  get regPoint(): [number, number] {
    return [0, 0];
  }

  erase() {
    this.castLib.erase(this.number);
  }

  toString() {
    return `(member ${this.number} of castLib ${this.castLib.number})`;
  }
}

export class BitmapMember extends Member {
  private _image: DImage | null = null;
  private _reg: [number, number];
  depth: number;
  useAlpha: boolean;
  alphaThreshold = 0;
  /** The member's palette (8-bit bitmaps); the system palette when unset. */
  palette: RGB[] | null = null;
  url: string | null;

  constructor(castLib: CastLib, number: number, name: string, doc?: MemberDoc) {
    super(castLib, number, 'bitmap', name);
    this._reg = doc?.reg ? [doc.reg[0], doc.reg[1]] : [0, 0];
    this.depth = doc?.depth ?? 32;
    this.useAlpha = doc?.useAlpha ?? false;
    this.url = doc?.png ? `${castLib.base}/${doc.png}` : null;
    if (doc?.paletteId && doc.paletteId > 0) this.paletteRef = { id: doc.paletteId, castLib: doc.clutCastLib ?? -1 };
    if (!doc?.png) this._image = new DImage(doc?.width ?? 0, doc?.height ?? 0, this.depth);
  }

  /** The palette member an indexed bitmap names (resolved once every cast is loaded: resolvePalettes). */
  paletteRef: { id: number; castLib: number } | null = null;

  /**
   * Use a member palette: the PNG's colours were drawn through it, so the pixels'
   * indices are found again in it (paint maps are edited and sent by index).
   */
  applyPalette(colors: RGB[]) {
    this.palette = colors;
    const img = this._image;
    if (img && img.depth <= 8 && img.palette !== colors) {
      img.palette = colors;
      img.reindex();
      img.touch();
    }
  }

  /** Decode the member's PNG (done for every bitmap when a cast loads). */
  async load() {
    if (this._image || !this.url) return;
    const img = new Image();
    img.src = this.url;
    await img.decode();
    this._image = DImage.fromImage(img, this.depth);
    this._image.useAlpha = this.useAlpha;
  }

  get image(): DImage {
    return (this._image ??= new DImage(0, 0, this.depth));
  }

  /**
   * member.image = img: the member takes a copy. An image object got from member.image
   * earlier refers to the member, not to a snapshot, so it sees (and still draws into)
   * the new pixels: the Paintshop keeps one and swaps the member's image under it.
   */
  set image(img: DImage) {
    const cur = this._image;
    if (cur && cur !== img && cur.width === img.width && cur.height === img.height && cur.depth === img.depth) {
      cur.data.set(img.data);
      cur.indices = img.indices ? new Uint8Array(img.indices) : cur.indices;
      cur.palette = img.palette;
      cur.useAlpha = img.useAlpha;
      cur.touch();
    } else if (cur !== img) {
      this._image = img.duplicate();
    }
    this.depth = img.depth;
    this.touch();
  }

  /** Assigning member.image keeps the regPoint where it was unless scripts move it. */
  get regPoint(): [number, number] {
    return this._reg;
  }
  set regPoint(p: [number, number]) {
    this._reg = [p[0], p[1]];
    this.touch();
  }

  get rect(): DRect {
    return rectOf(0, 0, this.image.width, this.image.height);
  }

  get version2() {
    return this.version + (this._image?.version ?? 0);
  }
}

/** Shared by text and field members: styled text with a box. */
export abstract class TextualMember extends Member {
  styled!: StyledText;
  alignment: 'left' | 'center' | 'right' = 'left';
  wordWrap = true;
  fixedLineSpace = 0;
  /** The box width (and height when fixed). */
  boxWidth = 0;
  boxHeight = 0;
  editable = false;
  autoTab = false;
  antialias = true;
  /** Text members draw runs from this size up anti-aliased (Director's default 14). */
  antiAliasThreshold = 14;
  /** Text members kern runs from kerningThreshold up (Director's defaults). */
  kerning = true;
  kerningThreshold = 14;
  /** Text members' paragraph formats (space before/after, tab stops), by start. */
  paragraphs: ParagraphFormat[] = [];
  scrollTop = 0;
  private cache: { key: string; lines: Line[] } | null = null;

  get text() {
    return this.styled.text;
  }
  set text(t: string) {
    this.styled.setText(String(t ?? ''));
    // Like the first character's style, the first paragraph's format stays.
    if (this.paragraphs.length) this.paragraphs = [{ ...this.paragraphs[0], start: 0 }];
    this.touch();
    TextualMember.textSet(this);
  }

  get font() {
    return this.styled.runs[0].style.font;
  }
  set font(f: string) {
    this.styled.restyle(0, Math.max(1, this.text.length), (r) => ({ ...r, style: { ...r.style, font: f } }));
    for (const r of this.styled.runs) r.style.font = f;
    this.touch();
  }
  get fontSize() {
    return this.styled.runs[0].style.size;
  }
  set fontSize(s: number) {
    for (const r of this.styled.runs) r.style.size = s;
    this.touch();
  }
  /** fontStyle as a list of #plain, #bold, #italic, #underline names. */
  get fontStyle(): string[] {
    const s = this.styled.runs[0].style;
    const out = [s.bold && 'bold', s.italic && 'italic', s.underline && 'underline'].filter(Boolean) as string[];
    return out.length ? out : ['plain'];
  }
  set fontStyle(list: string[]) {
    const has = (n: string) => list.some((x) => x.toLowerCase() === n);
    for (const r of this.styled.runs) Object.assign(r.style, { bold: has('bold'), italic: has('italic'), underline: has('underline') });
    this.touch();
  }
  get color(): DColor {
    return DColor.hex(this.styled.runs[0].color);
  }
  set color(c: DColor) {
    // Runs keep colours as "#rrggbb" (what the text renderer parses).
    const hex = `#${[c.r, c.g, c.b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
    for (const r of this.styled.runs) r.color = hex;
    this.touch();
  }

  layoutOptions(): LayoutOptions {
    const field = this instanceof FieldMember;
    return {
      width: this.boxWidth, wordWrap: this.wordWrap, alignment: this.alignment, fixedLineSpace: this.fixedLineSpace,
      field, paragraphs: field ? undefined : this.paragraphs, kerningThreshold: !field && this.kerning ? this.kerningThreshold : 0,
    };
  }

  lines(): Line[] {
    const o = this.layoutOptions();
    const key = `${this.version}|${JSON.stringify(o)}`;
    if (this.cache?.key !== key) this.cache = { key, lines: layout(this.styled, o) };
    return this.cache.lines;
  }

  get lineCount() {
    return this.lines().length;
  }

  /** Height of all the text. */
  get textHeight() {
    return textHeight(this.lines());
  }

  lineHeightAt(n: number) {
    return this.lines()[n - 1]?.height ?? 0;
  }

  /** member.charPosToLoc(n): where character n (1-based) starts; v as Director reports it (lineLocV). */
  charPosToLoc(n: number): LPoint {
    const lines = this.lines();
    const p = charPosToLoc(lines, Math.max(0, Math.min(this.text.length, n - 1)));
    const inset = this instanceof FieldMember ? this.border + this.margin : 0;
    return point(Math.round((p?.x ?? 0) + inset), Math.round((p ? lineLocV(p.line) : 0) + inset));
  }

  /** The focused field's selection [selStart, selEnd] (the player provides it). */
  static selectionOf: (m: TextualMember) => [number, number] = () => [0, 0];
  /** Told when a script sets the text (the player keeps the focused field's selection inside it). */
  static textSet: (m: TextualMember) => void = () => {};
  get selection(): LList {
    return new LList(TextualMember.selectionOf(this));
  }

  /** member.char.count and friends work on the text. */
  get length() {
    return this.text.length;
  }
}

function alignmentOf(a: string | number): 'left' | 'center' | 'right' {
  if (typeof a === 'number') return a === 1 ? 'center' : a === -1 ? 'right' : 'left';
  const s = a.toLowerCase();
  return s === 'center' ? 'center' : s === 'right' ? 'right' : 'left';
}

const styleBits = (bits: number) => ({ bold: !!(bits & 1), italic: !!(bits & 2), underline: !!(bits & 4) });

/** A text member (#text): styled text in a box of fixed width that grows to fit. */
export class TextMember extends TextualMember {
  constructor(castLib: CastLib, number: number, name: string, doc?: TextDoc) {
    super(castLib, number, 'text', name);
    // Spans without text are the parser's placeholder; a member authored empty keeps
    // its style only as the member's default (the robot list's name rows).
    const real = (doc?.spans ?? []).filter((s) => s.text.length > 0);
    const fallback = {
      text: doc?.text ?? '', font: doc?.defaultFont ?? 'Arial', size: doc?.defaultSize ?? 12, color: doc?.defaultColor ?? '#000000',
      bold: false, italic: false, underline: false,
    };
    const spans = real.length ? real : [fallback];
    let pos = 0;
    const runs = spans.map((s) => {
      const r = {
        start: pos,
        style: { font: s.font ?? 'Arial', size: s.size ?? 12, bold: s.bold, italic: s.italic, underline: s.underline },
        color: s.color ? `#${s.color.slice(-6)}` : '#000000',
      };
      pos += s.text.length;
      return r;
    });
    this.styled = new StyledText(doc?.text ?? spans.map((s) => s.text).join(''), runs);
    this.alignment = alignmentOf(doc?.alignment ?? 'left');
    this.wordWrap = doc?.wordWrap ?? true;
    this.fixedLineSpace = doc?.fixedLineSpace ?? 0;
    const tabType = ['left', 'left', 'center', 'right', 'decimal'] as const;
    this.paragraphs = (doc?.paragraphRuns ?? []).map(([start, i]) => {
      const p = doc?.paragraphs?.[i];
      return {
        start,
        spaceBefore: p?.topSpacing ?? 0,
        spaceAfter: p?.bottomSpacing ?? 0,
        tabs: (p?.tabs ?? []).map(([position, type]) => ({ position, type: tabType[type] ?? 'left' })),
      };
    });
    this.boxWidth = doc && doc.size[0] > 0 ? doc.size[0] : 0;
    this.boxHeight = doc && doc.size[1] > 0 ? doc.size[1] : 0;
    if (doc?.bg) this.bgColor = DColor.hex(doc.bg);
  }

  /** member.bgColor: what copy ink fills the box with (the garage's stats text is on black). */
  bgColor = new DColor(255, 255, 255);

  /** Text members are as wide as their box (or their longest line) and as tall as the text. */
  get rect(): DRect {
    const lines = this.lines();
    const w = this.boxWidth || Math.ceil(Math.max(0, ...lines.map((l) => l.width)));
    return rectOf(0, 0, w, Math.max(this.boxHeight, this.textHeight));
  }

  set width(w: number) {
    this.boxWidth = w;
    this.touch();
  }
  get width() {
    return this.rect.right;
  }

  /**
   * member.image of a text member: a new 32-bit image of the text with alpha (clear
   * where there is no text), the size of the member (the Highscore list scrolls one).
   */
  get image(): DImage {
    const r = this.rect;
    const c = document.createElement('canvas');
    c.width = Math.max(1, r.right);
    c.height = Math.max(1, r.bottom);
    drawLines(c.getContext('2d')!, this.lines(), 0, 0, undefined, this.antialias ? this.antiAliasThreshold : Infinity);
    const im = DImage.fromImage(c, 32);
    im.useAlpha = true;
    return im;
  }
}

/** A field (#field) or push button (#button): Director's older text box. */
export class FieldMember extends TextualMember {
  border = 0;
  margin = 0;
  boxShadow = 0;
  /** 0 adjust to fit, 1 scrolling, 2 fixed, 3 limit to field size. */
  boxType = 0;
  bgColor = new DColor(255, 255, 255);
  /** Button members: 0 push button, 1 check box, 2 radio button (as stored + 1 in some files). */
  buttonType: number | null = null;
  hilite = false;
  maxHeight = 0;

  constructor(castLib: CastLib, number: number, name: string, doc: FieldDoc | undefined, type: 'field' | 'button', fonts: Record<string, string>) {
    super(castLib, number, type, name);
    const runs = (doc?.runs?.length ? doc.runs : [{ start: 0, font: 'Arial', size: 12, style: 0, color: '#000000', fontId: 0, height: 0, ascent: 0 }]).map((r) => ({
      start: r.start,
      style: { font: r.font || fonts[String(r.fontId)] || 'Arial', size: r.size || 12, ...styleBits(r.style) } as TextStyle,
      color: r.color,
    }));
    this.styled = new StyledText(doc?.text ?? '', runs);
    if (doc) {
      this.alignment = alignmentOf(doc.alignment);
      this.wordWrap = doc.wordWrap;
      this.border = doc.border;
      this.margin = doc.margin;
      this.boxShadow = doc.boxShadow;
      this.boxType = doc.boxType;
      this.bgColor = new DColor(doc.bg[0], doc.bg[1], doc.bg[2]);
      this.editable = doc.editable;
      this.autoTab = doc.autoTab;
      this.boxWidth = doc.rect[2] - doc.rect[0];
      this.boxHeight = doc.rect[3] - doc.rect[1];
      this.maxHeight = doc.maxHeight;
      this.scrollTop = doc.scroll;
      if (type === 'button') this.buttonType = doc.buttonType ?? 0;
    }
    this.antialias = false;
  }

  /** Adjust-to-fit fields grow with their text; the others keep their box. */
  get rect(): DRect {
    const pad = 2 * (this.border + this.margin);
    const h = this.boxType === 0 ? Math.max(this.textHeight, this.lineHeightAt(1)) : this.boxHeight;
    return rectOf(0, 0, this.boxWidth + pad, h + pad);
  }

  set rect(r: DRect) {
    this.boxWidth = r.right - r.left;
    this.boxHeight = r.bottom - r.top;
    this.touch();
  }

  /** member.lineHeight */
  get lineHeight() {
    return this.fixedLineSpace || this.lineHeightAt(1);
  }
  set lineHeight(h: number) {
    this.fixedLineSpace = h;
    this.touch();
  }
}

export class ShapeMember extends Member {
  /** #rect, #roundRect, #oval, #line */
  shapeType: string;
  filled: boolean;
  lineSize: number;
  pattern: number;
  foreColorIndex: number;
  backColorIndex: number;
  lineDirection: number;
  private box: DRect;

  constructor(castLib: CastLib, number: number, name: string, doc: MemberDoc) {
    super(castLib, number, 'shape', name);
    const s = doc.shape!;
    this.shapeType = ['rect', 'rect', 'roundRect', 'oval', 'line', 'line'][s.shapeType] ?? 'rect';
    this.filled = !!s.filled;
    // Stored one-based: 1 is no border, 2 is 1 pixel (dirplayer, checked against Director).
    this.lineSize = Math.max(0, s.lineSize - 1);
    this.pattern = s.pattern;
    this.foreColorIndex = s.fore;
    this.backColorIndex = s.back;
    this.lineDirection = s.lineDirection;
    this.box = rectOf(0, 0, s.rect[2] - s.rect[0], s.rect[3] - s.rect[1]);
  }

  get rect() {
    return this.box;
  }
}

export class SoundMember extends Member {
  url: string;
  /** member.loop: the member's Loop checkbox, which a play with no #loopCount follows. */
  loop: boolean;
  constructor(castLib: CastLib, number: number, name: string, doc: MemberDoc) {
    super(castLib, number, 'sound', name);
    this.url = `${castLib.base}/${doc.sound!.file}`;
    this.loop = doc.sound!.loop ?? false;
  }
}

export class W3dMemberRef extends Member {
  url: string;
  constructor(castLib: CastLib, number: number, name: string, doc: MemberDoc) {
    super(castLib, number, 'shockwave3d', name);
    this.url = `${castLib.base}/${doc.w3d!}`;
  }

  /** Load the member's 3D world (the 3D runtime's subclass does; see director/s3d). */
  async load() {}
}

/**
 * Makes the cast's Shockwave 3D members: director/s3d installs its runtime member here,
 * so `member("arena")` is a live 3D world once its cast has loaded.
 */
export const memberHooks: { w3d: ((castLib: CastLib, number: number, name: string, doc: MemberDoc) => W3dMemberRef) | null } = { w3d: null };

export class PaletteMember extends Member {
  colors: RGB[];
  constructor(castLib: CastLib, number: number, name: string, doc: MemberDoc) {
    super(castLib, number, 'palette', name);
    this.colors = (doc.palette ?? []).map((h) => {
      const c = DColor.hex(h);
      return [c.r, c.g, c.b];
    });
  }
}

export class CastLib {
  readonly members = new Map<number, Member>();
  private byName = new Map<string, Member>();

  constructor(
    public number: number,
    readonly name: string,
    /** URL of the folder holding this cast's assets. */
    readonly base: string,
    readonly doc: MovieDoc | null,
  ) {
    if (doc) for (const m of doc.members) this.addFromDoc(m, doc.fonts ?? {});
  }

  private addFromDoc(d: MemberDoc, fonts: Record<string, string>) {
    let m: Member;
    if (d.font) registerEmbeddedFont(d.name, this.base, d.font.sizes);
    if (d.w3d) m = memberHooks.w3d?.(this, d.num, d.name, d) ?? new W3dMemberRef(this, d.num, d.name, d);
    else if (d.type === 'Bitmap') m = new BitmapMember(this, d.num, d.name, d);
    else if (d.text) m = new TextMember(this, d.num, d.name, d.text);
    else if (d.field) m = new FieldMember(this, d.num, d.name, d.field, d.type === 'Button' ? 'button' : 'field', fonts);
    else if (d.shape) m = new ShapeMember(this, d.num, d.name, d);
    else if (d.sound) m = new SoundMember(this, d.num, d.name, d);
    else if (d.palette) m = new PaletteMember(this, d.num, d.name, d);
    else if (d.font) m = new Member(this, d.num, 'font', d.name);
    else if (d.type === 'Script') m = new Member(this, d.num, 'script', d.name);
    else if (d.type === 'FilmLoop') m = new Member(this, d.num, 'filmLoop', d.name);
    else m = new Member(this, d.num, 'empty', d.name);
    this.set(d.num, m);
  }

  /** Decode every bitmap and load every 3D world (scripts use members synchronously). */
  async loadBitmaps() {
    await Promise.all(
      [...this.members.values()].map((m) =>
        m instanceof BitmapMember
          ? m.load().catch(() => {})
          : m instanceof W3dMemberRef
            ? m.load().catch((e) => console.error(`3D member ${m.name}:`, e))
            : null,
      ),
    );
  }

  set(num: number, m: Member) {
    this.members.set(num, m);
    m.number = num;
    this.reindex();
  }

  reindex() {
    this.byName = new Map();
    const nums = [...this.members.keys()].sort((a, b) => a - b);
    for (const n of nums) {
      const m = this.members.get(n)!;
      const k = m.name.toLowerCase();
      if (m.name && !this.byName.has(k)) this.byName.set(k, m);
    }
  }

  get(num: number): Member | undefined {
    return this.members.get(num);
  }

  find(name: string): Member | undefined {
    return this.byName.get(name.toLowerCase());
  }

  erase(num: number) {
    this.members.delete(num);
    this.reindex();
  }

  /** The first free member slot (for new(#bitmap, castLib n)). */
  freeSlot(): number {
    let n = 1;
    while (this.members.has(n)) n++;
    return n;
  }

  get memberCount() {
    return Math.max(0, ...this.members.keys());
  }
}

/** Create a member of a type at runtime (new(#bitmap) and friends). */
export function newMember(cast: CastLib, type: string, slot?: number): Member {
  const num = slot ?? cast.freeSlot();
  let m: Member;
  switch (type.toLowerCase()) {
    case 'bitmap':
      m = new BitmapMember(cast, num, '');
      break;
    case 'text':
      m = new TextMember(cast, num, '');
      break;
    case 'field':
      m = new FieldMember(cast, num, '', undefined, 'field', {});
      break;
    default:
      m = new Member(cast, num, type as MemberType, '');
  }
  cast.set(num, m);
  return m;
}

/**
 * Give indexed bitmaps the palette member they name, once a movie's casts are all
 * loaded: in their own cast (clutCastLib -1), in the numbered cast, or in any cast
 * (0, or when the number is stale), as dirplayer resolves them.
 */
export function resolvePalettes(libs: CastLib[]) {
  const isPalette = (m: Member | undefined): m is PaletteMember => m instanceof PaletteMember;
  for (const lib of libs) {
    for (const m of lib.members.values()) {
      if (!(m instanceof BitmapMember) || !m.paletteRef || m.palette) continue;
      const { id, castLib } = m.paletteRef;
      const own = lib.get(id);
      const numbered = castLib > 0 ? libs.find((c) => c.number === castLib)?.get(id) : undefined;
      const pal = (castLib < 0 && isPalette(own) ? own : undefined) ?? (isPalette(numbered) ? numbered : undefined) ?? libs.map((c) => c.get(id)).find(isPalette);
      if (pal) m.applyPalette(pal.colors);
    }
  }
}
