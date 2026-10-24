// factory0604 script 276 "sellStuff behavior": a parent script on the Sell room's
// "sell" button (a puppet sprite): sells the part (#SellPart to the frame script).

import { cursor, sendSprite, sprite, the } from '../../director';
import type { LValue } from '../../lingo';

export class SellStuffBehavior {
  sp: number;
  pname: LValue;
  dName: string;
  n: LValue;
  x: number;

  constructor(sp0: number, name0: LValue, n0: LValue) {
    this.sp = sp0;
    this.pname = name0;
    this.n = n0;
    this.dName = 'sell btn';
    this.x = sprite(this.sp).locH;
  }

  mouseEnter() {
    if (!the.stillDown) cursor(280);
  }

  mouseLeave() {
    if (!the.stillDown) cursor(-1);
  }

  mouseDown() {
    sprite(this.sp).member = this.dName + 'D';
  }

  mouseUp() {
    sprite(this.sp).member = this.dName;
    sendSprite(6, 'InitRobot');
    sendSprite(0, 'SellPart', this.pname, this.n);
  }

  endSprite() {}
}
