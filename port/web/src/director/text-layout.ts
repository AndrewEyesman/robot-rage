// Styled text and its layout, shared by text (#text) and field (#field) members,
// as Director 10.1 lays it out (measured against Adobe's player with
// port/tools/text-compare.mjs):
//
// - lines wrap at spaces (spaces at the break stay on the line above and don't count
//   towards its width), a word longer than the line breaks mid-word, RETURN ends a
//   paragraph;
// - a line is as tall as its largest ascent plus its largest descent (the fonts' VDMX
//   metrics), counting the style of the RETURN that ends it: a 12 px RETURN after
//   10 px text makes the line 2 px taller; fields add 1 px below every line;
// - a fixed line space puts the extra (or missing) space above the text;
// - text members' paragraphs add their space before/after (par_info) around their
//   lines;
// - TAB in a text member moves to the next tab stop: the paragraph's own (left,
//   center, right) and then every 24 px; in a field it is a .notdef box glyph.

import { deviceScale, drawRun, measure, metrics, notdefAdvance, positions, type TextStyle } from './fonts';

export interface Run {
  start: number;
  style: TextStyle;
  color: string;
}

export class StyledText {
  constructor(
    public text: string,
    /** Sorted by start; the first starts at 0. */
    public runs: Run[],
  ) {
    if (!runs.length) throw new Error('styled text needs a run');
    runs[0].start = 0;
  }

  runAt(i: number): Run {
    let r = this.runs[0];
    for (const run of this.runs) {
      if (run.start <= i) r = run;
      else break;
    }
    return r;
  }

  /** Replace all text, keeping the first character's style (as setting member.text does). */
  setText(t: string) {
    this.text = t;
    this.runs = [{ ...this.runs[0], start: 0 }];
  }

  /** Replace characters [from, to) with `s`, taking the style of the character before. */
  splice(from: number, to: number, s: string) {
    const delta = s.length - (to - from);
    this.text = this.text.slice(0, from) + s + this.text.slice(to);
    const out: Run[] = [];
    for (const r of this.runs) {
      let start = r.start;
      if (start >= to) start += delta;
      else if (start > from) start = from + s.length;
      if (out.length && out[out.length - 1].start === start) out[out.length - 1] = { ...r, start };
      else out.push({ ...r, start });
    }
    out[0].start = 0;
    this.runs = out.filter((r, i) => i === 0 || r.start < this.text.length || this.text.length === 0);
    if (!this.runs.length) this.runs = [out[0]];
  }

  /** Apply a style change to characters [from, to). */
  restyle(from: number, to: number, change: (r: Run) => Run) {
    if (to <= from) return;
    const at = (i: number) => this.runAt(i);
    const next: Run[] = [];
    const cuts = new Set<number>([0, from, to]);
    for (const r of this.runs) cuts.add(r.start);
    const points = [...cuts].filter((c) => c >= 0 && c <= this.text.length).sort((a, b) => a - b);
    for (const p of points) {
      if (p >= this.text.length && p !== 0) break;
      const base = at(p);
      const r = p >= from && p < to ? change({ ...base, style: { ...base.style }, start: p }) : { ...base, style: { ...base.style }, start: p };
      const prev = next[next.length - 1];
      if (prev && prev.color === r.color && JSON.stringify(prev.style) === JSON.stringify(r.style)) continue;
      next.push(r);
    }
    this.runs = next.length ? next : this.runs;
  }

  clone(): StyledText {
    return new StyledText(this.text, this.runs.map((r) => ({ ...r, style: { ...r.style } })));
  }
}

export interface Piece {
  text: string;
  start: number;
  x: number;
  width: number;
  style: TextStyle;
  color: string;
  /** A TAB: drawn as nothing (text members) or a .notdef box (fields). */
  tab?: boolean;
}

export interface Line {
  start: number;
  /** Exclusive, before the line break. */
  end: number;
  top: number;
  height: number;
  ascent: number;
  /** Paragraph space after this line (its paragraph's last line), below `height`. */
  after: number;
  x: number;
  width: number;
  pieces: Piece[];
  /** Kern the line's runs (sizes from the member's kerningThreshold). */
  kern?: number;
  field?: boolean;
}

export interface TabStop {
  position: number;
  type: 'left' | 'center' | 'right' | 'decimal';
}

/** A text member's paragraph format (par_info), from character `start` on. */
export interface ParagraphFormat {
  start: number;
  spaceBefore: number;
  spaceAfter: number;
  tabs: TabStop[];
}

export interface LayoutOptions {
  width: number;
  wordWrap: boolean;
  alignment: 'left' | 'center' | 'right';
  fixedLineSpace: number;
  /** Field (#field/#button) layout rules instead of a text member's. */
  field?: boolean;
  /** Sorted by start (text members). */
  paragraphs?: ParagraphFormat[];
  /** Kern runs whose size is at least this (0: never). */
  kerningThreshold?: number;
}

const DEFAULT_TAB = 24;

function paragraphAt(o: LayoutOptions, pos: number): ParagraphFormat | undefined {
  let p: ParagraphFormat | undefined;
  for (const q of o.paragraphs ?? []) {
    if (q.start <= pos) p = q;
    else break;
  }
  return p;
}

/** Lay out characters [from, to) as one line from x = 0: pieces of one style, tabs placed. */
function placeLine(st: StyledText, from: number, to: number, o: LayoutOptions, tabs: TabStop[]): Piece[] {
  const out: Piece[] = [];
  const kernFrom = o.kerningThreshold || Infinity;
  let x = 0;
  let i = from;
  // A center/right tab's text: pieces placed since that tab, shifted when it ends.
  let pending: { stop: TabStop; first: number; x0: number } | null = null;
  const settle = () => {
    if (!pending) return;
    const w = x - pending.x0;
    const target = pending.stop.type === 'center' ? pending.stop.position - Math.floor(w / 2) : pending.stop.position - w;
    const dx = Math.max(0, target - pending.x0);
    for (let k = pending.first; k < out.length; k++) out[k].x += dx;
    x += dx;
    pending = null;
  };
  while (i < to) {
    const run = st.runAt(i);
    if (st.text[i] === '\t') {
      settle();
      let w: number;
      if (o.field) w = notdefAdvance(run.style);
      else {
        const stop = tabs.find((t) => t.position > x);
        if (stop && stop.type !== 'left') {
          out.push({ text: '\t', start: i, x, width: 0, style: run.style, color: run.color, tab: true });
          pending = { stop, first: out.length, x0: x };
          i++;
          continue;
        }
        w = (stop ? stop.position : (Math.floor(x / DEFAULT_TAB) + 1) * DEFAULT_TAB) - x;
      }
      out.push({ text: '\t', start: i, x, width: w, style: run.style, color: run.color, tab: true });
      x += w;
      i++;
      continue;
    }
    const nextRun = st.runs.find((r) => r.start > i);
    let end = Math.min(to, nextRun ? nextRun.start : to);
    const tab = st.text.indexOf('\t', i);
    if (tab >= 0 && tab < end) end = tab;
    const text = st.text.slice(i, end);
    const width = measure(run.style, text, run.style.size >= kernFrom);
    out.push({ text, start: i, x, width, style: run.style, color: run.color });
    x += width;
    i = end;
  }
  settle();
  return out;
}

const piecesWidth = (ps: Piece[]) => (ps.length ? ps[ps.length - 1].x + ps[ps.length - 1].width : 0);

/** Width of characters [from, to) without trailing spaces. */
function inkWidth(st: StyledText, from: number, to: number, o: LayoutOptions, tabs: TabStop[]) {
  let e = to;
  while (e > from && st.text[e - 1] === ' ') e--;
  return piecesWidth(placeLine(st, from, e, o, tabs));
}

export function layout(st: StyledText, o: LayoutOptions): Line[] {
  const lines: Line[] = [];
  const text = st.text;
  let top = 0;
  const kern = o.kerningThreshold || undefined;
  const push = (start: number, end: number, para: ParagraphFormat | undefined, first: boolean, last: boolean, tabs: TabStop[]) => {
    const ps = placeLine(st, start, end, o, tabs);
    let ascent = 0;
    let descent = 0;
    const styles = ps.map((p) => p.style);
    // The RETURN ending a paragraph counts towards its last line; an empty line is
    // as tall as its RETURN.
    if (last && end < text.length) styles.push(st.runAt(end).style);
    if (!styles.length) styles.push(st.runAt(Math.max(0, Math.min(start, text.length - 1))).style);
    for (const s of styles) {
      const m = metrics(s);
      ascent = Math.max(ascent, m.ascent);
      descent = Math.max(descent, m.descent);
    }
    const natural = ascent + descent + (o.field ? 1 : 0);
    const height = o.fixedLineSpace > 0 ? o.fixedLineSpace : natural;
    // A fixed line space puts the extra space above the text.
    const lineAscent = o.fixedLineSpace > 0 ? height - descent - (o.field ? 1 : 0) : ascent;
    if (first && para) top += para.spaceBefore;
    const w = piecesWidth(ps);
    const x = o.alignment === 'center' ? Math.floor((o.width - w) / 2) : o.alignment === 'right' ? Math.round(o.width - w) : 0;
    const after = last && para ? para.spaceAfter : 0;
    lines.push({ start, end, top, height, ascent: lineAscent, after, x, width: w, pieces: ps, kern, field: o.field });
    top += height + after;
  };
  let lineStart = 0;
  for (let i = 0; i <= text.length; i++) {
    const c = text[i];
    if (i === text.length || c === '\r' || c === '\n') {
      // Wrap the paragraph [lineStart, i).
      const para = o.field ? undefined : paragraphAt(o, lineStart);
      const tabs = para?.tabs ?? [];
      let s = lineStart;
      let first = true;
      while (o.wordWrap && o.width > 0 && s < i && inkWidth(st, s, i, o, tabs) > o.width) {
        // Last space that still fits; a word longer than the line breaks mid-word.
        let brk = -1;
        for (let j = s + 1; j <= i; j++) {
          if (text[j - 1] !== ' ' && (j === i || text[j] === ' ')) {
            if (inkWidth(st, s, j, o, tabs) > o.width) break;
            brk = j;
          }
        }
        if (brk <= s) {
          brk = s + 1;
          while (brk < i && inkWidth(st, s, brk + 1, o, tabs) <= o.width) brk++;
        }
        // Spaces at the break stay on the line above.
        while (brk < i && text[brk] === ' ') brk++;
        if (brk >= i) break;
        push(s, brk, para, first, false, tabs);
        first = false;
        s = brk;
      }
      push(s, i, para, first, true, tabs);
      if (c === '\r' && text[i + 1] === '\n') i++;
      lineStart = i + 1;
    }
  }
  return lines;
}

/** Height of laid-out text, with the last paragraph's space after. */
export function textHeight(lines: Line[]): number {
  const l = lines[lines.length - 1];
  return l ? l.top + l.height + l.after : 0;
}

/**
 * The v of member.charPosToLoc for a character on this line: a text member reports
 * the bottom of the line (with its paragraph's space after) less one; a field its
 * ascent plus two (both measured in Director 10.1).
 */
export function lineLocV(l: Line): number {
  return l.field ? l.top + l.ascent + 2 : l.top + l.height + l.after - 1;
}

/** x of character i within a piece. */
function xIn(p: Piece, i: number, kern?: number): number {
  if (p.tab) return i > p.start ? p.width : 0;
  return positions(p.style, p.text, !!kern && p.style.size >= kern)[i - p.start];
}

/** The character index nearest a point (relative to the text's top-left). */
export function locToCharPos(lines: Line[], x: number, y: number): number {
  if (!lines.length) return 0;
  let line = lines[lines.length - 1];
  for (const l of lines) {
    if (y < l.top + l.height + l.after) {
      line = l;
      break;
    }
  }
  for (const p of line.pieces) {
    const n = p.tab ? 1 : p.text.length;
    for (let k = 0; k < n; k++) {
      const a = line.x + p.x + xIn(p, p.start + k, line.kern);
      const b = line.x + p.x + (k + 1 < n ? xIn(p, p.start + k + 1, line.kern) : p.width);
      if (x < (a + b) / 2) return p.start + k;
    }
  }
  return line.end;
}

/** Top-left of character `i` (relative to the text's top-left) and its line. */
export function charPosToLoc(lines: Line[], i: number): { x: number; y: number; line: Line } | null {
  for (const [n, l] of lines.entries()) {
    // The first character of a wrapped line belongs to that line, not after the one above.
    if (i >= l.start && (i < l.end || (i === l.end && lines[n + 1]?.start !== i))) {
      for (const p of l.pieces) {
        const n = p.tab ? 1 : p.text.length;
        if (i < p.start + n) return { x: l.x + p.x + xIn(p, i, l.kern), y: l.top, line: l };
      }
      return { x: l.x + l.width, y: l.top, line: l };
    }
  }
  const last = lines[lines.length - 1];
  return last ? { x: last.x + last.width, y: last.top, line: last } : null;
}

/**
 * Draw laid-out text with its top-left at (x, y), clipped by the caller. Runs from
 * `antialiasFrom` pixels up are anti-aliased (text members' antiAliasThreshold);
 * Infinity draws everything aliased, as fields are.
 */
const fieldTextFix = !(typeof location === 'undefined' ? '' : new URLSearchParams(location.search).get('quirks') ?? '').split(',').includes('fieldtext');

export function drawLines(ctx: CanvasRenderingContext2D, lines: Line[], x: number, y: number, colorOverride?: string, antialiasFrom: number | boolean = Infinity) {
  // Enhancement (?quirks=fieldtext restores the original, #61): on a scaled stage the
  // browser draws each glyph from its outline, so a field's hinted GDI advances only
  // spread the letters out ("Gizm o"), the clip cut the last one off and the caret,
  // placed by the layout, sat inside it. Scaled, fields draw at the layout's positions.
  const gdi = !fieldTextFix || Math.abs(deviceScale(ctx) - 1) < 0.01;
  for (const l of lines) {
    // GDI draws a field's line in one go with the fonts' hinted advances, wider than
    // the layout's, and Director clips it to the line's laid-out width: the end of a
    // line can lose a glyph or two (as in Director).
    let hx = 0;
    if (l.field && !gdi) {
      for (const p of l.pieces) {
        const m = metrics(p.style);
        drawRun(ctx, p.style, p.tab ? '\x7f' : p.text, x + l.x + p.x, y + l.top + l.ascent - m.ascent, colorOverride ?? p.color, false, false, false);
      }
      continue;
    }
    if (l.field) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + l.x, y + l.top, l.width, l.height);
      ctx.clip();
    }
    for (const p of l.pieces) {
      const m = metrics(p.style);
      if (l.field) {
        const text = p.tab ? '\x7f' : p.text;
        drawRun(ctx, p.style, text, x + l.x + hx, y + l.top + l.ascent - m.ascent, colorOverride ?? p.color, false, false, true);
        hx += p.tab ? notdefAdvance(p.style, true) : measure(p.style, p.text, false, true);
        continue;
      }
      const aa = typeof antialiasFrom === 'boolean' ? antialiasFrom : p.style.size >= antialiasFrom;
      const text = p.tab ? '' : p.text;
      // Runs are placed at their kerned positions, their glyphs drawn unkerned (as Director does).
      drawRun(ctx, p.style, text, x + l.x + p.x, y + l.top + l.ascent - m.ascent, colorOverride ?? p.color, aa, false);
    }
    if (l.field) ctx.restore();
  }
}
