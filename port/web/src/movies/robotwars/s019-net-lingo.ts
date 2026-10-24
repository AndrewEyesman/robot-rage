// robotwars movie script 19 "net lingo": posting to main.asp and reading its replies
// (Lingo property lists), the message balloon, and two small checksums.

import { G, dot, netDone, netError, netTextResult, postNetText, put, sendAllSprites, the } from '../../director';
import {
  LList, LPropList, add, bitXor, char, charToNum, concatSpace, ilk, integer, lingoString, listp, mod, mul, numToChar, putInto, random,
  stringp, sym, value, type LValue,
} from '../../lingo';
import { eq } from './util';
import { gameFixes, watchSave } from '../fixes';

export function RobotWarsSend(scriptName: string, infoList: LPropList): number {
  infoList.setaProp('robotid', dot(G.gGameGlobals, 'userID'));
  infoList.setaProp('robotname', dot(G.gGameGlobals, 'robotname'));
  infoList.setaProp('sessionid', dot(G.gLobby, 'session'));
  G.gStartSendTime = the.milliSeconds;
  if (the.machineType !== 256) {
    for (let i = 1; i <= infoList.count; i++) if (stringp(infoList.getAt(i))) infoList.setAt(i, MacToPC(infoList.getAt(i) as string));
  }
  // The port's fix (movies/fixes.ts, gameFixes.economy): a save asks for the server's
  // money back and takes it.
  const saving = gameFixes.economy && eq(infoList.getaProp('action'), 'setrobot');
  if (saving) infoList.setaProp('economy', 1);
  put(concatSpace(concatSpace('sending', lingoString(G.gUrl) + scriptName), infoList));
  setMessage('Kontaktar servern...', 5000);
  const id = postNetText(lingoString(G.gUrl) + scriptName, infoList);
  if (saving) watchSave(id, Number(dot(G.gUserData, 'propertyList', 'money')));
  return id;
}

/** The reply's property list, its text when it isn't one, or #waiting / #error. */
export function RobotWarsReceive(id: number): LValue {
  if (netDone(id)) {
    HideMessage();
    const err = netError(id);
    let txt: LValue = netTextResult(id);
    put(err, txt);
    if (eq(err, 'OK')) {
      if (the.machineType !== 256) txt = PCtoMac(lingoString(txt));
      const L = value(txt);
      if (listp(L)) {
        const e = L instanceof LPropList ? L.getaProp(sym('err')) : undefined;
        if (!eq(e, 0)) {
          setMessage(RobotwarsErrorMessage(e));
          return sym('error');
        }
        return L;
      }
      return txt;
    }
    setMessage('Kunde inte ansluta till servern. (' + lingoString(err) + ')', 0, 5000);
    return sym('error');
  }
  if (the.milliSeconds > (G.gStartSendTime ?? 0) + 20000) {
    setMessage('Ingen kontakt med servern', 0, 5000);
    return sym('error');
  }
  return sym('waiting');
}

export function RobotwarsErrorMessage(n: LValue): string {
  // The error table lookup after this return never runs.
  return lingoString(n);
}

// Script 3 has handlers with the same names (a Mac/Windows table); these are only
// reached on a Mac, which the port never reports, and aren't registered as handlers.
const MAC_TO_PC: Record<number, number> = { 128: 196, 133: 214, 129: 197, 138: 228, 154: 246, 140: 229, 142: 233, 131: 201, 136: 224, 191: 248, 175: 216, 190: 230, 174: 198 };
const PC_TO_MAC: Record<number, number> = { 196: 128, 214: 133, 197: 129, 228: 138, 246: 154, 229: 140, 233: 142, 201: 131, 224: 136, 216: 191, 248: 175, 230: 190, 198: 174 };

export function MacToPC(s: string): string {
  for (let i = 1; i <= s.length; i++) {
    const ch = charToNum(char(s, i));
    s = putInto(s, numToChar(MAC_TO_PC[ch] ?? ch), ['char', i]);
  }
  return s;
}

export function PCtoMac(s: string): string {
  for (let i = 1; i <= s.length; i++) {
    const ch = charToNum(char(s, i));
    s = putInto(s, numToChar(PC_TO_MAC[ch] ?? ch), ['char', i]);
  }
  return s;
}

/** The message balloon (message box behavior's #say): text, delay before showing, duration. */
export function setMessage(memberName: LValue, s1?: LValue, duration?: LValue) {
  sendAllSprites('say', memberName, s1, duration);
}

export function HideMessage() {
  sendAllSprites('hideBalloon');
}

export function RocketEncode(b: number): LList {
  const a = random(100) + 333;
  const c1 = 12;
  const c2 = 5;
  const c3 = 17;
  const c4 = 2;
  const x = c1 * a + c2 * b;
  const y = c3 * a + c4 * b;
  return new LList([x, y]);
}

export function RocketDecode(x: LValue, y?: LValue): number {
  if (listp(x)) {
    const L = x as LList;
    x = L.getAt(1);
    y = L.getAt(2);
  }
  const c1 = 12.0;
  const c2 = 5.0;
  const c3 = 17.0;
  const c4 = 2.0;
  const b = (Number(x) - (c1 * Number(y)) / c3) / (c2 - (c4 * c1) / c3);
  return integer(b) ?? 0;
}

export function getStringSum(s: string): number {
  let n = 0;
  let w = 76;
  for (let i = 1; i <= s.length; i++) {
    n = add(n, bitXor(charToNum(char(s, i)), w)) as number;
    w = add(w, mod(mul(2683, n), 8421)) as number;
  }
  return n;
}

export function GetListSum(L: LList | LPropList): number {
  let n = 0;
  let w = 123;
  for (let i = 1; i <= L.count; i++) {
    let p: LValue;
    if (ilk(L) === sym('propList')) p = (L as LPropList).getPropAt(i);
    else p = 0;
    const q = L.getAt(i);
    const k = ilk(q);
    if (k === sym('string')) n = add(n, getStringSum(q as string)) as number;
    else if (k === sym('float')) n = add(n, bitXor(integer(mul(q, 100)) ?? 0, w)) as number;
    else if (k === sym('integer')) {
      if (!eq(p, sym('checksum'))) {
        n = add(n, bitXor(q, w)) as number;
        w = add(w, mod(mul(134, q), 164)) as number;
      }
    } else if (k === sym('list') || k === sym('propList')) {
      const ls = GetListSum(q as LList | LPropList);
      n = add(n, ls) as number;
      w = add(w, mod(mul(5341, ls), 3899)) as number;
    }
  }
  return n;
}

export function correctChecksum(L: LPropList, k: number): boolean {
  return eq(bitXor(GetListSum(L), k), dot(L, 'checksum'));
}

export function updateChecksum(L: LPropList, k: number) {
  L.setaProp(sym('checksum'), bitXor(GetListSum(L), k));
}
