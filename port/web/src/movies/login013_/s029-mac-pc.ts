// login013_ movie script "mac_pc": text going to and from the server. Returns and
// quotes travel as <CR>, <FN> and <F2>; Mac character codes are swapped for PC ones
// (the browser player reports a PC, machineType 256, so those branches never run).

import { the } from '../../director';
import { QUOTE, RETURN, charToNum, numToChar, offset, putInto, stringp } from '../../lingo';

const MAC_TO_PC: Record<number, number> = { 128: 196, 133: 214, 129: 197, 138: 228, 154: 246, 140: 229, 142: 233, 131: 201, 136: 224, 191: 248, 175: 216, 190: 230, 174: 198 };
const PC_TO_MAC: Record<number, number> = Object.fromEntries(Object.entries(MAC_TO_PC).map(([m, p]) => [p, Number(m)]));

function swap(s: string, table: Record<number, number>) {
  for (let i = 1; i <= s.length; i++) {
    let ch = charToNum(s[i - 1]);
    ch = table[ch] ?? ch;
    s = putInto(s, numToChar(ch), ['char', i]);
  }
  return s;
}

export const MacToPC = (s: string) => swap(s, MAC_TO_PC);
export const PCtoMac = (s: string) => swap(s, PC_TO_MAC);

export function formatOutgoingText(s: string): string {
  s = removeReturns(s);
  s = removeFnutt(s);
  return the.machineType !== 256 ? MacToPC(s) : s;
}

export function formatIncomingText<T>(s: T): T | string {
  if (!stringp(s as never)) return s;
  let t = insertReturns(s as string);
  t = insertFnutt(t);
  return the.machineType !== 256 ? PCtoMac(t) : t;
}

/** Replace every occurrence of `find`, one at a time from the left, as the original loops do. */
function replaceAll(theText: string, find: string, insert: string) {
  let hasChar = offset(find, theText);
  while (hasChar) {
    theText = putInto(theText, insert, ['char', hasChar, hasChar + find.length - 1]);
    hasChar = offset(find, theText);
  }
  return theText;
}

export const removeReturns = (t: string) => replaceAll(t, RETURN, '<CR>');
export const insertReturns = (t: string) => replaceAll(t, '<CR>', RETURN);
export const removeFnutt = (t: string) => replaceAll(replaceAll(t, "'", '<FN>'), QUOTE, '<F2>');
export const insertFnutt = (t: string) => replaceAll(replaceAll(t, '<FN>', "'"), '<F2>', QUOTE);
