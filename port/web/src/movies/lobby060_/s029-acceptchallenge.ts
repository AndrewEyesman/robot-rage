// lobby060_ behavior 29 "AcceptChallenge": the YES button of an incoming challenge.

import { Behavior, sendSprite, sprite } from '../../director';
import { EMPTY } from '../../lingo';

export class AcceptChallengeButton extends Behavior {
  sp = 0;
  pname = '';

  beginSprite() {
    this.sp = this.spriteNum;
    this.pname = sprite(this.sp).member.name;
  }

  mouseUp() {
    this.setMember(EMPTY);
    sendSprite(0, 'AcceptChallenge');
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
}
