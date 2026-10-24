// robotwars movie script 38 "alert": the alertHook that logs the first script errors
// and tells Director not to show its alert. The player logs errors itself; this is
// here for completeness (purl installs it as the alertHook).

import { G, put } from '../../director';
import { lingoString, num, type LValue } from '../../lingo';

export function alertHook(_me: unknown, err: LValue, Msg: LValue): number {
  if (num(G.gErrorCounter) < 5) put(lingoString(err) + '#' + lingoString(G.gErrorCounter) + ' ' + '   ' + lingoString(Msg));
  G.gErrorCounter = num(G.gErrorCounter) + 1;
  return 1;
}
