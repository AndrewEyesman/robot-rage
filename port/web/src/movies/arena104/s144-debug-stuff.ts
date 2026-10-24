// arena104 movie script 144 "debug stuff": reading the opponent's globals over the
// match connection (getvar / var in the multiuser scripts).

import { G, player } from '../../director';
import { LPropList, propList, sym, symbol, type LValue } from '../../lingo';
import { eq } from './util';

// global muInstance, gOpponent

export function getOpponentVariable(V: LValue) {
  G.muInstance.sendNetMessage(propList(sym('recipients'), G.gOpponent, sym('subject'), 'getvar', sym('content'), propList(sym('name'), V), sym('upd'), 0));
}

/** `the globals` as a property list of every global. */
function theGlobals(): LPropList {
  const out = new LPropList();
  for (const k of Object.keys(player.globals)) out.addProp(sym(k), player.globals[k] as LValue);
  return out;
}

export function getPlayerVariable(V: LValue): LValue {
  if (eq(V, 'all')) {
    // `return the globals, symbol(V)`: Lingo returns the first value.
    return theGlobals();
  } else {
    return theGlobals().getProp(symbol(V));
  }
}
