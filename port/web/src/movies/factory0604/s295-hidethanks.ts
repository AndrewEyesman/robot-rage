// factory0604 behavior 295 "HideThanks": the close button of the thank-you box (the
// sprite before it runs behavior 187); the box shows again when the button's span ends.

import { Behavior, sendSprite, sprite, the } from '../../director';
import { EMPTY } from '../../lingo';

export class HideThanks extends Behavior {
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
    sendSprite(the.currentSpriteNum - 1, 'SetVisib', 0);
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

  endSprite() {
    sendSprite(the.currentSpriteNum - 1, 'SetVisib', 1);
  }
}
