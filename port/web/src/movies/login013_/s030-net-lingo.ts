// login013_ movie script "net lingo": error texts, the rocket number encoding and
// the list checksums the game keeps on its saved records.

import { G } from '../../director';
import {
  LList, LPropList, bitXor, charToNum, concatSpace, ilk, integer, lingoEquals, num, random, sym, symbol, voidp, type LValue,
} from '../../lingo';

export function ShockplayErrorMessage(n: LValue): string {
  const gErrorList = G.gErrorList;
  if (voidp(gErrorList)) return concatSpace('Error:', n);
  const e = (gErrorList as LPropList).getaProp(symbol('e' + String(n)));
  if (e === undefined) return concatSpace('Error:', n);
  return e as string;
}

export function RocketEncode(b: number): LList {
  const a = random(100) + 333;
  const c1 = 12, c2 = 5, c3 = 17, c4 = 2;
  return new LList([c1 * a + c2 * b, c3 * a + c4 * b]);
}

export function RocketDecode(x: LValue, y?: LValue): number | undefined {
  if (x instanceof LList) {
    const L = x;
    x = L.getAt(1);
    y = L.getAt(2);
  }
  const c1 = 12.0, c2 = 5.0, c3 = 17.0, c4 = 2.0;
  const b = (num(x) - (c1 * num(y)) / c3) / (c2 - (c4 * c1) / c3);
  return integer(b);
}

export function getStringSum(s: string): number {
  let n = 0;
  let w = 76;
  for (let i = 1; i <= s.length; i++) {
    n = n + bitXor(charToNum(s[i - 1]), w);
    w = w + ((2683 * n) % 8421);
  }
  return n;
}

export function GetListSum(L: LList | LPropList): number {
  let n = 0;
  let w = 123;
  for (let i = 1; i <= L.count; i++) {
    const p = L instanceof LPropList ? L.getPropAt(i) : 0;
    const q = L.getAt(i);
    switch (ilk(q)) {
      case sym('string'):
        n = n + getStringSum(q as string);
        break;
      case sym('float'):
        n = n + bitXor(integer(num(q) * 100) ?? 0, w);
        break;
      case sym('integer'):
        if (!lingoEquals(p, sym('checksum'))) {
          n = n + bitXor(q as number, w);
          w = w + ((134 * (q as number)) % 164);
        }
        break;
      case sym('list'):
      case sym('propList'): {
        const ls = GetListSum(q as LList);
        n = n + ls;
        w = w + ((5341 * ls) % 3899);
        break;
      }
    }
  }
  return n;
}

export function correctChecksum(L: LPropList, k: number): boolean {
  return lingoEquals(bitXor(GetListSum(L), k), L.getaProp(sym('checksum')));
}

export function updateChecksum(L: LPropList, k: number) {
  L.setaProp(sym('checksum'), bitXor(GetListSum(L), k));
}

export function BalloonMessage(_s?: unknown) {}
export function hideBalloon(_s?: unknown) {}
