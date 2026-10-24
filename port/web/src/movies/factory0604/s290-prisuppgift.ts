// factory0604 behavior 290 "Prisuppgift" (price; unused in the score): shows a part's price.

import { Behavior, sprite } from '../../director';
import { lingoString, type LSymbol, type LValue } from '../../lingo';
import { parts, propOf } from './util';

export class Prisuppgift extends Behavior {
  sp = 0;
  name: LValue;
  state: LSymbol | undefined;
  txt: LValue;

  beginSprite() {
    this.sp = this.spriteNum;
  }

  setPris(pname: LValue) {
    const t = pname;
    const k = parts().getaProp(t);
    const r = propOf(k, 'pris');
    if (r !== undefined) sprite(this.sp).member.text = lingoString(r);
  }
}
