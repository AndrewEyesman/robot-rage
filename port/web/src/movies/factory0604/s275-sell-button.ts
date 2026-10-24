// factory0604 script 275 "sell button behavior": a parent script on the Sell room's
// inventory icons: a click shows the part in the preview and its sell box (#UpdateSell).

import { G, cursor, sendAllSprites } from '../../director';
import { symbol, type LValue } from '../../lingo';

export class SellButtonBehavior {
  sp: number;
  pname: LValue;
  dName: LValue;
  n: LValue;

  constructor(sp0: number, name0: LValue, n0: LValue) {
    this.sp = sp0;
    this.n = n0;
    this.dName = name0;
  }

  mouseEnter() {
    cursor(280);
  }

  mouseLeave() {
    cursor(-1);
  }

  mouseDown() {
    sendAllSprites('InitRobot');
  }

  mouseUp() {
    // q = getProp(gPartDescription, symbol(dName)): unused (a script error for an unknown part).
    G.gPartDescription.getProp(symbol(this.dName));
    sendAllSprites('Show3DPart', symbol(this.dName));
    sendAllSprites('UpdateSell', this.dName, this.n);
    sendAllSprites('UpdateAll');
  }
}
