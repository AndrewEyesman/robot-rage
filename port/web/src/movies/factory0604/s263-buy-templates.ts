// factory0604 behavior 263 "Buy Templates" (sprite 313 on the Super Weapons page): the
// purchase box (this sprite and the 19 after it), hidden until #ShowpurchaseBox.

import { Behavior, pass, sprite, the } from '../../director';
import type { LValue } from '../../lingo';

export class BuyTemplates extends Behavior {
  sp = 0;

  beginSprite() {
    this.sp = the.currentSpriteNum;
    this.SetVisib(0);
  }

  endSprite() {
    if (the.runMode !== 'Author') this.SetVisib(1);
  }

  mouseUp() {
    return pass();
  }

  SetBuyWin(_ttex: LValue) {}

  ShowpurchaseBox() {
    this.SetVisib(1);
  }

  HidepurchaseBox() {
    this.SetVisib(0);
  }

  SetVisib(bb: LValue) {
    for (let i = 1; i <= 20; i++) sprite(this.sp - 1 + i).visible = !!bb;
  }
}
