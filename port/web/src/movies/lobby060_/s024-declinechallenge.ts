// lobby060_ behavior 24 "DeclineChallenge": the NO button of an incoming challenge.

import { Behavior, sprite } from '../../director';
import { EMPTY } from '../../lingo';
import { DeclineChallenge } from './s004-lobby-moviescript';

export class DeclineChallengeButton extends Behavior {
  sp = 0;
  pname = '';

  beginSprite() {
    this.sp = this.spriteNum;
    this.pname = sprite(this.sp).member.name;
  }

  mouseUp() {
    this.setMember(EMPTY);
    DeclineChallenge(this);
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
