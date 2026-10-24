// robotwars movie script 3 "mac_pc": chat and names go over the wire with returns,
// quotes, apostrophes and colons escaped (<CR>, <F2>, <FN>, <CN>), and in Windows
// characters (converted on a Mac; the port reports a Windows machine, the.machineType 256).

import { G, the } from '../../director';
import { LList, LPropList, QUOTE, RETURN, charToNum, ilk, length, listp, numToChar, offset, putInto, stringp, sym, char, type LValue } from '../../lingo';
import { SearchAndReplace } from './s004-new-init';

export function initMacPC() {
  G.gPCMac = new LList([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
  30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56,
  57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83,
  84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108,
  109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 226,
  196, 227, 201, 160, 224, 246, 228, 138, 220, 206, 141, 142, 143, 144, 212, 213, 210, 211, 165, 209, 208, 247,
  170, 154, 221, 207, 157, 158, 217, 202, 193, 162, 163, 219, 180, 166, 164, 172, 169, 187, 199, 194, 173, 168,
  248, 161, 177, 178, 179, 171, 181, 166, 225, 252, 185, 188, 200, 188, 189, 190, 192, 203, 231, 229, 204, 128,
  129, 174, 130, 233, 131, 230, 232, 237, 234, 235, 236, 208, 132, 241, 238, 239, 205, 133, 215, 175, 244, 242,
  243, 134, 221, 222, 167, 136, 135, 137, 139, 138, 140, 190, 141, 143, 142, 144, 145, 147, 146, 148, 149, 240,
  150, 152, 151, 153, 155, 154, 214, 191, 157, 156, 158, 159, 253, 254, 255,
  ]);
  G.gMacPC = new LList([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
  30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56,
  57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83,
  84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108,
  109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 196, 197, 199,
  201, 209, 214, 220, 225, 224, 226, 228, 227, 229, 231, 233, 232, 234, 235, 237, 236, 238, 239, 241, 243, 242,
  244, 246, 245, 250, 249, 251, 252, 134, 176, 162, 163, 167, 149, 182, 223, 174, 169, 153, 180, 168, 173, 198,
  216, 0, 177, 178, 179, 165, 181, 0, 0, 0, 185, 0, 170, 188, 189, 230, 248, 191, 161, 172, 0, 131, 0, 0, 171,
  187, 133, 160, 192, 195, 213, 140, 156, 208, 150, 147, 148, 145, 146, 247, 215, 0, 159, 0, 164, 139, 221,
  222, 0, 135, 183, 130, 132, 137, 194, 202, 193, 203, 200, 205, 206, 207, 204, 211, 212, 240, 210, 218, 219,
  217, 0, 136, 152, 175, 0, 0, 0, 184, 253, 254, 255,
  ]);
}

export function MacToPC(s: string): string {
  if (G.gMacPC === undefined) initMacPC();
  for (let i = 1; i <= length(s); i++) s = putInto(s, numToChar((G.gMacPC as LList).getAt(charToNum(char(s, i)))), ['char', i]);
  return s;
}

export function PCtoMac(s: string): string {
  if (G.gPCMac === undefined) initMacPC();
  for (let i = 1; i <= length(s); i++) s = putInto(s, numToChar((G.gPCMac as LList).getAt(charToNum(char(s, i)))), ['char', i]);
  return s;
}

export function formatOutgoingTextInPropList(s: string): string {
  s = SearchAndReplace(s, QUOTE, '\u00d3');
  return s;
}

export function formatOutgoingText(s: LValue): LValue {
  if (listp(s)) return formatOutgoingList(s);
  s = removeReturns(s);
  s = removeFnutt(s);
  if (the.machineType !== 256) return MacToPC(s as string);
  return s;
}

export function formatOutgoingList(L: LValue): LValue {
  const k = ilk(L);
  if (k === sym('list') || k === sym('propList')) {
    const l = L as LList | LPropList;
    for (let i = 1; i <= l.count; i++) l.setAt(i, formatOutgoingText(l.getAt(i)));
    return L;
  }
  if (k === sym('string')) return formatOutgoingText(L);
  return L;
}

export function formatIncomingText(s: LValue): LValue {
  if (listp(s)) return formatIncomingList(s);
  if (!stringp(s)) return s;
  s = insertReturns(s);
  s = insertFnutt(s);
  if (the.machineType !== 256) return PCtoMac(s as string);
  return s;
}

export function formatIncomingPropList(L: LValue): LValue {
  if (!listp(L)) return L;
  const l = L as LList | LPropList;
  for (let i = 1; i <= l.count; i++) l.setAt(i, formatIncomingText(l.getAt(i)));
  return L;
}

export function formatIncomingList(L: LValue): LValue {
  const k = ilk(L);
  if (k === sym('list') || k === sym('propList')) {
    const l = L as LList | LPropList;
    for (let i = 1; i <= l.count; i++) l.setAt(i, formatIncomingText(l.getAt(i)));
    return L;
  }
  if (k === sym('string')) return formatIncomingText(L);
  return L;
}

// These take any value: offset() reads it as a string, so a number comes back unchanged.

export function removeReturns(theText: LValue): LValue {
  let hasChar = offset(RETURN, theText);
  while (hasChar) {
    theText = putInto(theText as string, '<CR>', ['char', hasChar]);
    hasChar = offset(RETURN, theText);
  }
  return theText;
}

export function insertReturns(theText: LValue): LValue {
  let hasChar = offset('<CR>', theText);
  while (hasChar) {
    theText = putInto(theText as string, RETURN, ['char', hasChar, hasChar + 3]);
    hasChar = offset('<CR>', theText);
  }
  return theText;
}

export function removeFnutt(theText: LValue): LValue {
  let hasChar = offset("'", theText);
  while (hasChar) {
    theText = putInto(theText as string, '<FN>', ['char', hasChar]);
    hasChar = offset("'", theText);
  }
  hasChar = offset(QUOTE, theText);
  while (hasChar) {
    theText = putInto(theText as string, '<F2>', ['char', hasChar]);
    hasChar = offset(QUOTE, theText);
  }
  hasChar = offset(':', theText);
  while (hasChar) {
    theText = putInto(theText as string, '<CN>', ['char', hasChar]);
    hasChar = offset(':', theText);
  }
  return theText;
}

export function insertFnutt(theText: LValue): LValue {
  let hasChar = offset('<FN>', theText);
  while (hasChar) {
    theText = putInto(theText as string, "'", ['char', hasChar, hasChar + 3]);
    hasChar = offset('<FN>', theText);
  }
  hasChar = offset('<F2>', theText);
  while (hasChar) {
    theText = putInto(theText as string, QUOTE, ['char', hasChar, hasChar + 3]);
    hasChar = offset('<F2>', theText);
  }
  hasChar = offset('<CN>', theText);
  while (hasChar) {
    theText = putInto(theText as string, ':', ['char', hasChar, hasChar + 3]);
    hasChar = offset('<CN>', theText);
  }
  return theText;
}
