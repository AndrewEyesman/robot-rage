// robotwars movie script 98 "md5": the robot data checksum (docs/notes.md, getrobot /
// setrobot): MD5 of the uppercased, space-stripped text plus a salt. The original
// computes MD5 in Lingo integer arithmetic; this is a plain MD5 over the text's
// Windows-1252 bytes with the same lowercase hex output. (The Lingo version prints a
// 32-bit word that is exactly 0 wrongly; that one-in-four-billion case isn't copied.)

import { EMPTY, bitAnd, char, charToNum, length, numToChar, putInto } from '../../lingo';

export function cleanSpace(strinin: string): string {
  let newr = EMPTY;
  for (let i = 1; i <= strinin.length; i++) if (!(char(strinin, i) === ' ')) newr = newr + char(strinin, i);
  return newr;
}

/** a-z to A-Z, and the Swedish letters (Mac and Windows bytes) to capitals. */
export function StringToCapital(s: string): string {
  for (let i = 1; i <= length(s); i++) {
    let c = charToNum(char(s, i));
    if (c > 96) {
      if (c <= 122) {
        s = putInto(s, numToChar(bitAnd(charToNum(char(s, i)), 223)), ['char', i]);
        continue;
      }
      switch (c) {
        case 138:
          c = 128;
          break;
        case 154:
          c = 133;
          break;
        case 140:
          c = 129;
          break;
        case 142:
          c = 131;
          break;
        case 228:
          c = 196;
          break;
        case 229:
          c = 197;
          break;
        case 246:
          c = 214;
          break;
        case 233:
          c = 201;
          break;
      }
      s = putInto(s, numToChar(c), ['char', i]);
    }
  }
  return s;
}

const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) | 0);

export function md5(a_sInput: string): string {
  const bytes: number[] = [];
  for (let i = 1; i <= a_sInput.length; i++) bytes.push(charToNum(char(a_sInput, i)) & 255);
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 0; i < 8; i++) bytes.push(i < 4 ? (bitLen >>> (8 * i)) & 255 : 0);
  let a0 = 0x67452301,
    b0 = 0xefcdab89 | 0,
    c0 = 0x98badcfe | 0,
    d0 = 0x10325476;
  for (let off = 0; off < bytes.length; off += 64) {
    const M = Array.from({ length: 16 }, (_, j) => bytes[off + j * 4] | (bytes[off + j * 4 + 1] << 8) | (bytes[off + j * 4 + 2] << 16) | (bytes[off + j * 4 + 3] << 24));
    let A = a0,
      B = b0,
      C = c0,
      D = d0;
    for (let i = 0; i < 64; i++) {
      let F: number, g: number;
      if (i < 16) [F, g] = [(B & C) | (~B & D), i];
      else if (i < 32) [F, g] = [(D & B) | (~D & C), (5 * i + 1) % 16];
      else if (i < 48) [F, g] = [B ^ C ^ D, (3 * i + 5) % 16];
      else [F, g] = [C ^ (B | ~D), (7 * i) % 16];
      F = (F + A + K[i] + M[g]) | 0;
      A = D;
      D = C;
      C = B;
      B = (B + ((F << S[i]) | (F >>> (32 - S[i])))) | 0;
    }
    a0 = (a0 + A) | 0;
    b0 = (b0 + B) | 0;
    c0 = (c0 + C) | 0;
    d0 = (d0 + D) | 0;
  }
  let out = EMPTY;
  for (const w of [a0, b0, c0, d0]) for (let i = 0; i < 4; i++) out += ((w >>> (8 * i)) & 255).toString(16).padStart(2, '0');
  return out;
}
