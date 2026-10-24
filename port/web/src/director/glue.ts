// Where the player meets the Lingo value library.

import { value, LPropList, LSymbol } from '../lingo';

/** A behavior's score parameters ("[#visiblePassword: \"visiblePassword\"]") as name/value pairs. */
export function parseParams(src: string): [string, unknown][] {
  const v = value(src);
  if (!(v instanceof LPropList)) return [];
  const out: [string, unknown][] = [];
  for (let i = 1; i <= v.count; i++) {
    const k = v.getPropAt(i);
    out.push([k instanceof LSymbol ? k.name : String(k), v.getAt(i)]);
  }
  return out;
}
