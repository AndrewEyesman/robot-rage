// factory0604 behavior 273 "btnroll&down": a button that shows its "<name>D" member
// while the mouse is over it or pressing it.

import { Behavior, sprite } from '../../director';
import { EMPTY } from '../../lingo';

export class BtnrollDown extends Behavior {
  sp = 0;
  pname = '';

  beginSprite() {
    this.sp = this.spriteNum;
    this.pname = sprite(this.sp).member.name;
  }

  mouseEnter() {
    this.setMember('D');
  }

  mouseLeave() {
    this.setMember(EMPTY);
  }

  mouseUp() {
    this.setMember('D');
  }

  mouseDown() {
    this.setMember('D');
  }

  mouseUpOutSide() {
    this.setMember(EMPTY);
  }

  setMember(n: string) {
    sprite(this.sp).member = this.pname + n;
  }
}
