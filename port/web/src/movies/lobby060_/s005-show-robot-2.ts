// lobby060_ behavior 5: shows robot 2 (an older card view; not in the score).

import { Behavior, sendSprite, sprite } from '../../director';
import { EMPTY } from '../../lingo';

export class ShowRobot2Button extends Behavior {
  sp = 0;
  pname = '';

  beginSprite() {
    this.sp = this.spriteNum;
    this.pname = sprite(this.sp).member.name;
  }

  mouseLeave() {
    this.setMember(EMPTY);
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

  mouseUp() {
    sendSprite(0, 'showrobot', 2);
  }
}
