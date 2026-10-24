// login013_ behavior 21 (a robot row): selects robot n (the digit in its member's
// name, "robotname3") and moves the highlight bar (sprite 21) onto it.

import { Behavior, G, sprite } from '../../director';
import { EMPTY, char, integer, point, sym } from '../../lingo';

export class RobotRow extends Behavior {
  sp = 0;

  beginSprite() {
    this.sp = this.spriteNum;
  }

  mouseDown() {
    const thisField = sprite(this.sp).member;
    if (thisField.text !== EMPTY) {
      const ML = integer(char(thisField.name, 10));
      G.gLobby.setaProp(sym('selectedid'), ML);
      sprite(21).loc = point(sprite(this.sp).locH - 5, sprite(this.sp).locV - 2);
    }
  }
}
