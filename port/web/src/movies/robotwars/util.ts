// Small helpers the robotwars translations share (not part of the original scripts).

import { movieHandler, warnOnce } from '../../director';
import { LList, LPropList, integer, lingoEquals, type LValue } from '../../lingo';

/** Lingo `=` (strings compare case-insensitively, "1" = 1): what `case x of` and `if a = b` use. */
export const eq = (a: LValue, b: LValue): boolean => lingoEquals(a, b);

/**
 * A movie-script handler that lives in another cast (the lobby's getrankingindex, the
 * 3D scripts' BuildRobot...), called by name as Lingo does. A missing one is a script
 * error in Director; here it warns and returns VOID.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function callMovie(name: string, ...args: unknown[]): any {
  const h = movieHandler(name);
  if (!h) {
    warnOnce(`robotwars: handler ${name} is not defined in this movie`);
    return undefined;
  }
  return h(...args);
}

/** getaProp(list, key) on whatever the value is: VOID when it isn't a list or lacks the key. */
export function getaPropOf(l: unknown, k: LValue): LValue {
  if (l instanceof LPropList) return l.getaProp(k);
  if (l instanceof LList) {
    const n = integer(k);
    return n !== undefined && n >= 1 && n <= l.count ? l.getAt(n) : undefined;
  }
  return undefined;
}
