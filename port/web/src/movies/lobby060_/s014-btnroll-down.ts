// lobby060_ behavior 14 "btnroll&down": a button that shows its "D" member while
// pressed (with a click) and tints its label (the next sprite).

import { Behavior, pass, sprite } from '../../director';
import { EMPTY, rgb } from '../../lingo';
import { playsound } from '../robotwars/s030-soundscript';

export class BtnrollDown extends Behavior {
  sp = 0;
  pname = '';

  beginSprite() {
    this.sp = this.spriteNum;
    this.pname = sprite(this.sp).member.name;
  }

  mouseEnter() {
    this.setMember(EMPTY);
  }

  mouseLeave() {
    this.setMember(EMPTY);
  }

  mouseUp() {
    this.setMember(EMPTY);
    return pass();
  }

  mouseDown() {
    playsound('knappljud', 255);
    this.setMember('D');
    sprite(this.sp + 1).color = rgb(128, 128, 0);
    return pass();
  }

  mouseUpOutSide() {
    this.setMember(EMPTY);
  }

  setMember(n: string) {
    sprite(this.sp).member = this.pname + n;
    sprite(this.sp + 1).color = rgb(196, 196, 0);
  }
}
