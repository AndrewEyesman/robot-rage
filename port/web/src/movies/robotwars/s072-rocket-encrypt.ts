// robotwars movie script 72: rocket_encrypt / rocket_decrypt, a fixed-seed XOR of
// string(value) as hex (the "doktor" copy of gUserData that catches edited memory).

import { EMPTY, bitXor, char, charToNum, length, lingoString, mod, numToChar, random, randomSeed, setRandomSeed, value, type LValue } from '../../lingo';
import { eq } from './util';

export function rocket_encrypt(L: LValue): string {
  const s = lingoString(L);
  const savedSeed = randomSeed();
  setRandomSeed(14204);
  let z = EMPTY;
  for (let i = 1; i <= length(s); i++) z = z + Num2Hex1(bitXor(charToNum(char(s, i)), random(256) - 1));
  setRandomSeed(savedSeed);
  return lingoString(z);
}

export function rocket_decrypt(z: string): LValue {
  let s = EMPTY;
  const savedSeed = randomSeed();
  setRandomSeed(14204);
  for (let i = 1; i <= Math.trunc(length(z) / 2); i++) s = s + numToChar(bitXor(Hex2Num1(char(z, i * 2 - 1) + char(z, i * 2)), random(256) - 1));
  setRandomSeed(savedSeed);
  // `value(s) <> VOID`: a value of 0 counts as VOID here (VOID = 0 in Lingo).
  if (!eq(value(s), undefined) && s !== EMPTY) return value(s);
  return s;
}

export function Num2Hex1(n: number): string {
  const s = '0123456789ABCDEF';
  return char(s, Math.trunc(n / 16) + 1) + char(s, mod(n, 16) + 1);
}

export function Hex2Num1(s: string): number {
  let n1 = charToNum(char(s, 1)) - 48;
  if (n1 > 9) n1 = n1 - 7;
  let n2 = charToNum(char(s, 2)) - 48;
  if (n2 > 9) n2 = n2 - 7;
  return n1 * 16 + n2;
}
