// factory0604 behaviors 174 and 289 "Storlek" (size; identical, unused in the score):
// shows a part's space ("Storlek: n").

import { Behavior, sprite } from '../../director';
import { EMPTY, lingoString, type LSymbol, type LValue } from '../../lingo';
import { parts, propOf } from './util';

export class Storlek extends Behavior {
  sp = 0;
  name: LValue;
  state: LSymbol | undefined;
  txt: LValue;

  beginSprite() {
    this.sp = this.spriteNum;
    sprite(this.sp).member.text = EMPTY;
  }

  setUtrymme(pname: LValue) {
    const t = pname;
    const k = parts().getaProp(t);
    const r = propOf(k, 'utrymme');
    if (r !== undefined) sprite(this.sp).member.text = 'Storlek: ' + lingoString(r);
  }
}
