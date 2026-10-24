// lobby060_ behavior 21 "updateGamesList": asks the frame script to refresh the games list (an older lobby; not in the score).

import { Behavior, puppetSound, sendSprite, sprite } from '../../director';
import { EMPTY } from '../../lingo';

export class UpdateGamesList extends Behavior {
  sp = 0;
  pname = '';

  beginSprite() {
    this.sp = this.spriteNum;
    this.pname = sprite(this.sp).member.name;
  }

  mouseUp() {
    this.setMember(EMPTY);
    sendSprite(0, 'updateGamesList');
  }

  mouseLeave() {
    this.setMember(EMPTY);
  }

  mouseDown() {
    // puppetSound(member) with one argument plays in sound channel 1.
    puppetSound(1, 'knappljud');
    this.setMember('D');
  }

  mouseUpOutSide() {
    this.setMember(EMPTY);
  }

  setMember(n: string) {
    sprite(this.sp).member = this.pname + n;
  }
}
