// robotwars behavior 53 "scrollcursor": the hand cursors over a draggable thing.

import { Behavior, cursor, pass, the } from '../../director';
import type { LValue } from '../../lingo';

export class ScrollCursor extends Behavior {
  sp = 0;
  pname: LValue;

  beginSprite() {
    this.sp = this.spriteNum;
  }

  mouseEnter() {
    cursor(260);
  }

  mouseLeave() {
    if (!the.stillDown) cursor(-1);
  }

  mouseUp() {
    cursor(260);
    return pass();
  }

  mouseDown() {
    cursor(290);
    return pass();
  }

  mouseUpOutSide() {
    cursor(-1);
  }
}
