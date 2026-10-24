// login013_ behavior "buttonDown": swaps a button's member for its pressed ("D")
// version and tints the label beside it (sprite + 1).

import { Behavior, cursor, pass, sprite, the } from '../../director';
import { EMPTY, rgb, sym, type LSymbol } from '../../lingo';

export class ButtonDown extends Behavior {
  sp = 0;
  pname = '';
  state: LSymbol | undefined;

  beginSprite() {
    this.sp = this.spriteNum;
    this.pname = sprite(this.sp).member.name;
    this.state = sym('idle');
    if (the.rollover === this.sp) this.SetPointingCursor(1);
  }

  mouseEnter() {
    this.setMember(EMPTY);
    if (!the.stillDown) this.SetPointingCursor(1);
    pass();
  }

  mouseLeave() {
    this.setMember(EMPTY);
    this.SetPointingCursor(0);
    pass();
  }

  mouseUp() {
    this.setMember(EMPTY);
    pass();
  }

  mouseDown() {
    this.setMember('D');
    sprite(this.sp + 1).color = rgb(128, 128, 0);
    pass();
  }

  mouseUpOutSide() {
    this.setMember(EMPTY);
  }

  setMember(n: string) {
    sprite(this.sp).member = this.pname + n;
    sprite(this.sp + 1).color = rgb(196, 196, 0);
  }

  SetPointingCursor(q: number) {
    if (q) {
      if (this.state === sym('idle')) {
        this.state = sym('pointing');
        cursor(280);
      }
    } else if (this.state === sym('pointing')) {
      this.state = sym('idle');
      cursor(0);
    }
  }

  inactivate() {
    this.state = sym('inactive');
  }
}
