// Lingo chunk expressions: char, word, item and line of a string, and `put ... into /
// before / after` and `delete` on them (which return the new string here). Checked
// against Adobe's player; dirplayer differs on lines (it also splits on LF and CRLF).
//
// - Lines are separated by RETURN ("\r") only: LF is an ordinary character. Items by
//   `the itemDelimiter` (one character, default ","). Both count separators + 1, so ""
//   has 1 item and "a,b," has 3.
// - Words are runs of characters above SPACE: every control character (TAB, RETURN, LF,
//   NUL...) separates words, a non-breaking space doesn't. "" has 0 words.
// - Chunk 0 (or below) is the whole string. A range past the end stops at the end; a
//   reversed range is the first chunk alone (item[3..1] is item 3), except for chars,
//   where it is "" (char[4..2]).
//
// Nested chunks are paths from the outside in, as in dot syntax: s.item[2].word[1] is
// getChunk(s, ['item', 2], ['word', 1]); `put x into word 1 of item 2 of s` is
// putInto(s, x, ['item', 2], ['word', 1]).

import { lingoString } from './format';
import type { LValue } from './values';

export const EMPTY = '';
export const RETURN = '\r';
export const TAB = '\t';
export const QUOTE = '"';
export const BACKSPACE = '\b';
export const SPACE = ' ';
export const ENTER = '\x03';

let delimiter = ',';

/** the itemDelimiter */
export const itemDelimiter = (): string => delimiter;
/** Only the first character counts (setting "ab" gives "a"). */
export const setItemDelimiter = (d: string): void => {
  if (d !== '') delimiter = d[0];
};

export type ChunkType = 'char' | 'word' | 'item' | 'line';
/** [type, first, last?]: char 2 is ['char', 2], char 2 to 9 is ['char', 2, 9]. */
export type ChunkRef = readonly [type: ChunkType, first: number, last?: number];

/** [start, end) of every chunk. */
function spans(s: string, type: ChunkType): [number, number][] {
  const out: [number, number][] = [];
  if (type === 'char') {
    for (let i = 0; i < s.length; i++) out.push([i, i + 1]);
  } else if (type === 'word') {
    const re = /[^\0- ]+/g;
    for (let m; (m = re.exec(s)); ) out.push([m.index, m.index + m[0].length]);
  } else {
    const sep = type === 'line' ? '\r' : delimiter;
    let start = 0;
    for (let i = s.indexOf(sep); i >= 0; i = s.indexOf(sep, i + 1)) {
      out.push([start, i]);
      start = i + 1;
    }
    out.push([start, s.length]);
  }
  return out;
}

export function chunkCount(s: string, type: ChunkType): number {
  return spans(s, type).length;
}

export const charCount = (s: string): number => s.length;
export const wordCount = (s: string): number => chunkCount(s, 'word');
export const itemCount = (s: string): number => chunkCount(s, 'item');
export const lineCount = (s: string): number => chunkCount(s, 'line');

/** Range of chunks first..last as string offsets, or null when it is past the end. */
function range(s: string, [type, first, last = first]: ChunkRef): [number, number] | null {
  if (first < 1) return [0, s.length];
  const sp = spans(s, type);
  if (first > sp.length) return null;
  if (last < first) {
    if (type === 'char') return [sp[first - 1][0], sp[first - 1][0]];
    last = first;
  }
  return [sp[first - 1][0], sp[Math.min(last, sp.length) - 1][1]];
}

/** s.char[2], s.item[2..5], s.item[2].word[1]... "" past the end. */
export function getChunk(s: string, ...path: ChunkRef[]): string {
  for (const ref of path) {
    const r = range(s, ref);
    if (!r) return '';
    s = s.slice(r[0], r[1]);
  }
  return s;
}

export const char = (s: string, first: number, last?: number): string => getChunk(s, ['char', first, last]);
export const word = (s: string, first: number, last?: number): string => getChunk(s, ['word', first, last]);
export const item = (s: string, first: number, last?: number): string => getChunk(s, ['item', first, last]);
export const line = (s: string, first: number, last?: number): string => getChunk(s, ['line', first, last]);
/** chars(s, first, last) */
export const chars = (s: string, first: number, last: number): string => getChunk(s, ['char', first, last]);

type Mode = 'into' | 'before' | 'after';

/**
 * The range a put writes to. Past the end, items and lines are padded with delimiters
 * ("a,b,c" into item 5 is "a,b,c,,X"), chars with spaces up to the chunk ("abc" into
 * char 5 is "abc X"), and words go at the very end ("a b" into word 5 is "a bX").
 */
function putRange(s: string, ref: ChunkRef): [string, number, number] {
  const r = range(s, ref);
  if (r) return [s, r[0], r[1]];
  const [type, first] = ref;
  if (type === 'item' || type === 'line') s += (type === 'line' ? '\r' : delimiter).repeat(first - chunkCount(s, type));
  else if (type === 'char') s = s.padEnd(first - 1, ' ');
  return [s, s.length, s.length];
}

function put(s: string, v: LValue, mode: Mode, path: ChunkRef[]): string {
  const text = lingoString(v);
  if (path.length === 0) return mode === 'into' ? text : mode === 'before' ? text + s : s + text;
  const [ref, ...rest] = path;
  // Chunk 0 is the whole string: before it is the start, after it the end.
  if (ref[1] < 1 && rest.length === 0) return put(s, v, mode, []);
  const [padded, a, b] = putRange(s, ref);
  const inner = rest.length ? put(padded.slice(a, b), v, mode, rest) : put('', v, 'into', []);
  if (rest.length || mode === 'into') return padded.slice(0, a) + inner + padded.slice(b);
  return mode === 'before' ? padded.slice(0, a) + inner + padded.slice(a) : padded.slice(0, b) + inner + padded.slice(b);
}

/** put v into <chunk> of s */
export const putInto = (s: string, v: LValue, ...path: ChunkRef[]): string => put(s, v, 'into', path);
/** put v before <chunk> of s */
export const putBefore = (s: string, v: LValue, ...path: ChunkRef[]): string => put(s, v, 'before', path);
/** put v after <chunk> of s */
export const putAfter = (s: string, v: LValue, ...path: ChunkRef[]): string => put(s, v, 'after', path);

/**
 * delete <chunk> of s. An item or line takes its following delimiter with it, or its
 * preceding one when it is the last ("a,b,c" less item 3 is "a,b"); a word takes the
 * whitespace after it ("a b  c d" less word 2 is "a c d"). Past the end, nothing changes.
 */
export function deleteChunk(s: string, ...path: ChunkRef[]): string {
  if (path.length === 0) return '';
  const [ref, ...rest] = path;
  const r = range(s, ref);
  if (!r) return s;
  if (rest.length) return s.slice(0, r[0]) + deleteChunk(s.slice(r[0], r[1]), ...rest) + s.slice(r[1]);
  const [type, first, last = first] = ref;
  if (first < 1) return '';
  if (type === 'char') return s.slice(0, r[0]) + s.slice(r[1]);
  const sp = spans(s, type);
  const end = Math.max(first, Math.min(last, sp.length));
  if (type === 'word') return s.slice(0, r[0]) + (end < sp.length ? s.slice(sp[end][0]) : '');
  if (end < sp.length) return s.slice(0, r[0]) + s.slice(sp[end][0]);
  return first > 1 ? s.slice(0, sp[first - 2][1]) : '';
}
