// robotwars movie script 5 "changes": a pretty-printer for lists (debugging), an email
// check, and whether this computer is "behind a router" (decides the IRC ipcode).

import { put, sprite, the, MultiuserXtra } from '../../director';
import { EMPTY, LPropList, QUOTE, RETURN, char, concatSpace, ilk, length, lingoString, starts, stringp, sym, voidp, word, type LList, type LValue } from '../../lingo';
import { eq } from './util';

export function tidyup(z: LValue, indent?: string): string {
  if (voidp(indent)) indent = '     ';
  else indent = indent + '     ';
  let s = EMPTY;
  const k = ilk(z);
  if (k === sym('propList')) {
    const pl = z as LPropList;
    if (length(lingoString(z)) < 85) s = s + lingoString(z);
    else {
      s = s + '[ ' + RETURN + indent;
      for (let i = 1; i <= pl.count; i++) {
        let p = pl.getAt(i);
        if (voidp(p)) p = '<void>';
        s = s + '#' + lingoString(pl.getPropAt(i)) + ':' + ' ' + tidyup(p, indent);
        if (i < pl.count) s = s + ', ' + RETURN + indent;
      }
      s = s + ' ]';
    }
  } else if (k === sym('list')) {
    const l = z as LList;
    if (length(lingoString(z)) < 85) s = s + lingoString(z);
    else {
      s = s + '[ ';
      for (let i = 1; i <= l.count; i++) {
        s = s + tidyup(l.getAt(i), indent);
        if (i < l.count) s = s + ', ' + RETURN + indent;
      }
      s = s + ' ]';
    }
  } else if (k === sym('string')) {
    s = QUOTE + (z as string) + QUOTE;
  } else if (eq(z, EMPTY)) {
    s = QUOTE + QUOTE;
  } else {
    s = lingoString(z);
  }
  return s;
}

/** Debugging: lists the text sprites and whether they're editable. */
export function checkeditable() {
  for (let i = 1; i <= the.lastChannel; i++) {
    if (sprite(i).type !== 0) {
      const t = sprite(i).member.type;
      if (t === 'text' || t === 'richText') put(i, concatSpace(sym(t), sprite(i).member.editable ? 1 : 0));
    }
  }
}

export function isAnEmailAddress(s: string): number {
  let foundDot = 0;
  let foundAt = 0;
  for (let i = s.length - 1; i >= 1; i--) {
    if (char(s, i) === '.') {
      if (foundAt && !foundDot) return 0;
      if (!foundAt) foundDot = 1;
    }
    if (char(s, i) === '@') {
      if (!foundDot) return 0;
      // foundAt is never set, so the first "@" after a dot decides.
      if (!foundAt && i > 1) return 1;
    }
  }
  return 0;
}

/** 1 unless one of the machine's address cookies is a public address. */
export function isBehindRouter(): number {
  const x = new MultiuserXtra();
  let pfoundIP: LValue = 0;
  for (let i = 1; i <= 10; i++) {
    const ip = x.getNetAddressCookie(1, i);
    if (!isLocalIP(ip)) pfoundIP = ip;
  }
  if (stringp(pfoundIP)) return 0;
  return 1;
}

/** An address cookie that is empty or one of the encrypted local ranges. */
export function isLocalIP(ip: string): number {
  if (eq(ip, EMPTY)) return 1;
  ip = word(ip, 2);
  if (starts(ip, 'bd8e5e342066')) return 1;
  if (starts(ip, 'bd8e53e4')) return 1;
  if (starts(ip, 'bd874ff')) return 1;
  return 0;
}
