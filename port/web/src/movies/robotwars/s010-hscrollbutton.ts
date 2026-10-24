// robotwars behavior 10 "hscrollbutton behavior": the arrows in sprites 58 / 59 send
// #setscrollbar -1 / 1 every frame while held.

import { Behavior, pass, sendAllSprites, the } from '../../director';
import { sym, type LSymbol } from '../../lingo';

export class HScrollButton extends Behavior {
  sp = 0;
  dx: number | undefined;
  state: LSymbol | undefined;

  beginSprite() {
    this.state = sym('idle');
    this.sp = the.currentSpriteNum;
  }

  mouseDown() {
    this.state = sym('down');
    if (this.sp === 58) this.dx = -1;
    if (this.sp === 59) this.dx = 1;
    return pass();
  }

  mouseUp() {
    this.state = sym('idle');
  }

  mouseUpOutSide() {
    this.state = sym('idle');
  }

  mouseLeave() {
    this.state = sym('idle');
  }

  prepareFrame() {
    if (this.state === sym('down')) sendAllSprites('setscrollbar', this.dx);
  }
}
