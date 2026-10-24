// factory0604 script 192 "horizontal scroll behavior": a parent script that slides an
// inventory sprite (number pNum, or pNum - 100 for the button under it) with the
// scroll bar (#setHorizontalScroll, -1..1).

import { sprite } from '../../director';
import { num, type LValue } from '../../lingo';
import { inventory } from './util';

export class HorizontalScrollBehavior {
  sp: number;
  n: LValue;
  pos: number;
  pNum: number;

  constructor(sp0: number, nummer: number) {
    this.pNum = nummer;
    this.sp = sp0;
    this.pos = sprite(this.sp).locH;
  }

  setHorizontalScroll(dx: LValue) {
    const diff = inventory().count - 1;
    const d = num(dx);
    if (this.pNum < 100) sprite(this.sp).locH = 220 + this.pNum * 90 - d * diff * 45 - diff * 45;
    else sprite(this.sp).locH = 220 + (this.pNum - 100) * 90 - d * diff * 45 - diff * 45;
    this.n = 0;
  }
}
