// Director's text runs on Windows-1252 bytes. Strings here are JS strings whose
// characters are the decoded bytes (numToChar(151) is '—', U+2014), so this module maps
// between the two and holds the two orderings Director uses on text, both measured in
// Adobe's Director 10.1 player (tools/reference, `sort` and `=` over every byte):
//
// - `=`, `contains`, `starts` and `offset` fold case through a per-byte table. It is
//   not plain ASCII case folding: É = é, but Ñ <> ñ, while ñ = ˜ and ò = œ = Œ (a Mac
//   Roman table applied to Windows bytes).
// - `<`, `>` and `sort` collate like Windows' CompareString: letters ignore accents and
//   case first ("ab" > "Aa"), then compare accents, then case (lowercase first: "a" <
//   "A"); punctuation sorts before digits before letters; hyphen, apostrophe, dashes and
//   control characters are ignored until the last level; æ œ ß þ ™ sort as ae oe ss th tm.

// Windows-1252 0x80-0x9F. The five undefined bytes map to the same-numbered C1 controls.
const HIGH = [
  0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152, 0x8d, 0x17d, 0x8f,
  0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0x9d, 0x17e, 0x178,
];
const fromByte: string[] = [];
const toByte = new Map<number, number>();
for (let b = 0; b < 256; b++) {
  const code = b >= 0x80 && b < 0xa0 ? HIGH[b - 0x80] : b;
  fromByte.push(String.fromCharCode(code));
  toByte.set(code, b);
}

/** Lingo numToChar: the Windows-1252 character for the low byte of n. */
export function byteToChar(n: number): string {
  return fromByte[n & 0xff];
}

/** The Windows-1252 byte of a character, or -1 when it has none. */
export function charToByte(c: string): number {
  return toByte.get(c.charCodeAt(0)) ?? -1;
}

// `=` folding: pairs of bytes Director's `=` treats as equal (besides themselves).
const FOLD_PAIRS = [
  [138, 154], [140, 156], [140, 242], [152, 241], [157, 244], [158, 243], [159, 255],
  ...Array.from({ length: 26 }, (_, i) => [65 + i, 97 + i]),
  ...Array.from({ length: 17 }, (_, i) => [192 + i, 224 + i]),
  [213, 245], [214, 246], [216, 248], [217, 249], [218, 250], [219, 251], [220, 252], [221, 253], [222, 254],
];
const fold = Array.from({ length: 256 }, (_, i) => i);
const root = (b: number): number => (fold[b] === b ? b : root(fold[b]));
for (const [a, b] of FOLD_PAIRS) {
  const ra = root(a), rb = root(b);
  if (ra !== rb) fold[Math.max(ra, rb)] = Math.min(ra, rb);
}
for (let b = 0; b < 256; b++) fold[b] = root(b);

/** A string with every character replaced by its `=` class representative. */
export function foldCase(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const b = toByte.get(s.charCodeAt(i));
    out += b === undefined ? s[i] : fromByte[fold[b]];
  }
  return out;
}

// Collation, from Adobe's sort of all 255 bytes. Ignorable bytes first, in order; then
// primary groups separated by spaces, accent variants by '/', case variants by ','.
const IGNORABLE = [173, 1, 2, 3, 4, 5, 6, 7, 8, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 127, 39, 45, 150, 151];
const ORDER =
  '32 160 9 10 11 12 13 33 34 35 36 37 38 40 41 42 44 46 47 58 59 63 64 91 92 93 136,94 95 96 123 124 125 126 161 ' +
  '166 168 175 180 184 191 152 145 146 130 147 148 132 139 155 162 163 164 165 128 43 60 61 62 177 171 187 215 247 ' +
  '167 169 172 174 176 181 182 183 133 134 135 149 137 129/141/143/144/157 48 188 189 190 49,185 50,178 51,179 52 53 ' +
  '54 55 56 57 97,65/170/225,193/224,192/226,194/228,196/227,195/229,197 230,198 98,66 99,67/231,199 100,68/240,208 ' +
  '101,69/233,201/232,200/234,202/235,203 102,70/131 103,71 104,72 105,73/237,205/236,204/238,206/239,207 106,74 ' +
  '107,75 108,76 109,77 110,78/241,209 111,79/186/243,211/242,210/244,212/246,214/245,213/248,216 156,140 112,80 ' +
  '113,81 114,82 115,83/154,138 223 116,84 254,222 153 117,85/250,218/249,217/251,219/252,220 118,86 119,87 120,88 ' +
  '121,89/253,221/255,159 122,90/158,142';
// Ligatures sort as their letters.
const EXPANSIONS: Record<number, string> = { 230: 'ae', 198: 'AE', 156: 'oe', 140: 'OE', 223: 'ss', 254: 'th', 222: 'TH', 153: 'TM' };

const ignWeight = new Int16Array(256).fill(-1);
IGNORABLE.forEach((b, i) => (ignWeight[b] = i));
const primary = new Int16Array(256), secondary = new Int16Array(256), tertiary = new Int16Array(256);
ORDER.split(' ').forEach((group, p) =>
  group.split('/').forEach((accents, s) =>
    accents.split(',').forEach((b, t) => {
      primary[+b] = p + 1;
      secondary[+b] = s;
      // ˆ and ^ collate equal.
      tertiary[+b] = +b === 94 ? 0 : t;
    }),
  ),
);

interface Keys { p: number[]; s: number[]; t: number[]; i: number[] }

function keys(str: string): Keys {
  const k: Keys = { p: [], s: [], t: [], i: [] };
  for (let n = 0; n < str.length; n++) {
    const b = toByte.get(str.charCodeAt(n));
    if (b === undefined) {
      // Not representable in Windows-1252: after everything, by code point.
      k.p.push(1000 + str.charCodeAt(n)); k.s.push(0); k.t.push(0);
    } else if (ignWeight[b] >= 0) {
      // Last level: an ignorable nearer the start weighs more ("-a" > "a-").
      k.i.push((1000 - n) * 64 + ignWeight[b]);
    } else if (EXPANSIONS[b]) {
      // ™ sorts after both "tm" and "TM"; the other ligatures equal their spelling.
      for (const c of EXPANSIONS[b]) {
        const e = c.charCodeAt(0);
        k.p.push(primary[e]); k.s.push(b === 153 ? 1 : 0); k.t.push(tertiary[e]);
      }
    } else {
      k.p.push(primary[b]); k.s.push(secondary[b]); k.t.push(tertiary[b]);
    }
  }
  return k;
}

function cmpSeq(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return a.length === b.length ? 0 : a.length < b.length ? -1 : 1;
}

/** Director's string ordering for `<`, `>`, `<=`, `>=` and sort: -1, 0 or 1. */
export function collate(a: string, b: string): number {
  if (a === b) return 0;
  // Ordering stops at a NUL, as C strings do (`=` doesn't).
  const za = a.indexOf('\0'), zb = b.indexOf('\0');
  if (za >= 0) a = a.slice(0, za);
  if (zb >= 0) b = b.slice(0, zb);
  const ka = keys(a), kb = keys(b);
  return cmpSeq(ka.p, kb.p) || cmpSeq(ka.s, kb.s) || cmpSeq(ka.t, kb.t) || cmpSeq(ka.i, kb.i);
}
