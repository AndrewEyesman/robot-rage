// robotwars movie script 4 "New Init": main.ini parsing, string replacement, and the
// IRC nick encoding (`_R<rank><name><ipcode>`, unusual characters as `_<hex>`).

import { put } from '../../director';
import {
  EMPTY, LList, LPropList, char, charToNum, chars, concatSpace, itemCount, item, length, line, lineCount,
  lingoString, mod, numToChar, offset, putInto, setItemDelimiter, itemDelimiter, sqrt, starts, symbol, value, word,
  type LPoint, type LValue, num,
} from '../../lingo';
import { formatIncomingText, formatOutgoingText } from './s003-mac-pc';

export function parseIniFile(txt: string): LPropList {
  const L = new LPropList();
  let m: LPropList | LList = new LPropList();
  let p1: LValue;
  let cn = 0;
  const tsd = itemDelimiter();
  setItemDelimiter('=');
  for (let i = 1; i <= lineCount(txt); i++) {
    const ln = line(txt, i);
    switch (char(word(ln, 1), 1)) {
      case '[': {
        let s = ln;
        s = SearchAndReplace(s, '[', EMPTY);
        s = SearchAndReplace(s, ']', EMPTY);
        s = SearchAndReplace(s, ' ', EMPTY);
        p1 = symbol(s);
        L.addProp(p1, new LPropList());
        m = L.getProp(p1) as LPropList;
        cn = 0;
        break;
      }
      case ';':
      case EMPTY:
        break;
      default:
        if (itemCount(ln) === 2) {
          (m as LPropList).addProp(symbol(item(ln, 1)), value(item(ln, 2)));
        } else {
          if (cn === 0) {
            L.setaProp(p1, new LList());
            m = L.getProp(p1) as LList;
          }
          (m as LList).add(lingoString(symbol(ln)));
        }
        cn = cn + 1;
    }
  }
  setItemDelimiter(tsd);
  return L;
}

export function SearchAndReplace(theText: string, stringToFind: string, stringToInsert: string): string {
  let hasChar = offset(stringToFind, theText);
  while (hasChar) {
    theText = putInto(theText, stringToInsert, ['char', hasChar, hasChar + length(stringToFind) - 1]);
    hasChar = offset(stringToFind, theText);
  }
  return theText;
}

/** An IRC nick back to the robot's name: drops `_R<rank>` and the ipcode, decodes `_<hex>`. */
export function FormatUserName(s: string): string {
  if (starts(s, '_R')) s = chars(s, 4, length(s));
  let p = offset('_', s);
  if (p > 0) {
    while (p > 0) {
      let n = Hex2Num(chars(s, p + 1, p + 2));
      if (n < 32) n = 32;
      if (n === 95) n = 32;
      s = putInto(s, numToChar(n), ['char', p, p + 2]);
      p = offset('_', s);
    }
  }
  if (s.toLowerCase() === 'shockplay001') return 'Shockplay';
  if (s.toLowerCase() === 'shockplay002') return 'Shockplay';
  if (s.toLowerCase() === 'shockplay003') return 'Shockplay';
  return formatIncomingText(chars(s, 1, s.length - 4)) as string;
}

export function getUserIpCode(s: string): string {
  return chars(s, s.length - 3, s.length);
}

/** A robot name as an IRC nick: `_R`, the name with odd characters as `_<hex>`, the ipcode. */
export function formatInternalUserName(s: string, ipcode?: string): string {
  s = formatOutgoingText(s) as string;
  let r = '_R';
  for (let i = 1; i <= s.length; i++) {
    const ch = charToNum(char(s, i));
    if (ch < 48 || ch > 122 || ch === 95 || (ch < 65 && i === 1) || ch === 64 || ch === 60 || ch === 62) {
      r = r + '_' + Num2Hex(ch);
      continue;
    }
    r = r + char(s, i);
  }
  return r + lingoString(ipcode);
}

export function AddDebugLog(s1: LValue, s2?: LValue) {
  put(concatSpace('debuglog', s1), s2);
}

export function Num2Hex(n: number, dignum?: number): string {
  const hex = '0123456789ABCDEF';
  let s = EMPTY;
  while (n > 0) {
    s = char(hex, mod(n, 16) + 1) + s;
    n = Math.trunc(n / 16);
  }
  for (let i = s.length + 1; i <= (dignum ?? 0); i++) s = '0' + s;
  return s;
}

export function Hex2Num(s: string): number {
  let n = 0;
  for (let i = 1; i <= s.length; i++) {
    let n1 = charToNum(char(s, i)) - 48;
    if (n1 > 9) n1 = n1 - 7;
    n = 16 * n + n1;
  }
  return n;
}

/** The ipcode of an external address ("behind a router"): four hex digits. */
export function makeCheckSum(s: string): string {
  let n = 0;
  let f = 1;
  for (let i = 1; i <= length(s); i++) {
    n = n + f * charToNum(char(s, i));
    f = f * 7;
    if (f > 1000000) f = 2;
  }
  n = mod(n, 65536);
  if (n === 0) n = 1;
  return Num2Hex(n, 4);
}

export function GetDistance(pt1: LPoint, pt2: LPoint) {
  const dx = num(pt2.locH) - num(pt1.locH);
  const dy = num(pt2.locV) - num(pt1.locV);
  return sqrt(dx * dx + dy * dy);
}
