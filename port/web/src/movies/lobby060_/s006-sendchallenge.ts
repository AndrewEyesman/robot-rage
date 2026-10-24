// lobby060_ behavior 6 "SendChallenge" (sprite 22, the CHALLENGE button): only live
// while a robot's card is shown (#show); its label is sprite 23.

import { Behavior, sendSprite, sprite } from '../../director';
import { EMPTY, rgb, sym, type LSymbol, type LValue } from '../../lingo';

export class SendChallenge extends Behavior {
  sp = 0;
  pname = '';
  pState: LSymbol | undefined;

  mouseUp() {
    sendSprite(1, 'usedoktor');
    if (this.pState === sym('show')) {
      this.setMember(EMPTY);
      sendSprite(0, 'SendChallenge');
    }
    sendSprite(1, 'usedoktor');
  }

  beginSprite() {
    this.sp = this.spriteNum;
    this.pname = sprite(this.sp).member.name;
  }

  mouseLeave() {
    if (this.pState === sym('show')) this.setMember(EMPTY);
  }

  mouseDown() {
    if (this.pState === sym('show')) this.setMember('D');
  }

  mouseUpOutSide() {
    if (this.pState === sym('show')) this.setMember(EMPTY);
  }

  setMember(n: string) {
    sprite(this.sp).member = this.pname + n;
    if (n === 'D') sprite(this.sp + 1).color = rgb(128, 128, 0);
    else sprite(this.sp + 1).color = rgb(196, 196, 0);
  }

  ChallengeButton(state: LValue) {
    this.pState = state as LSymbol;
    if (this.pState === sym('hide')) this.setMember('D');
    else if (this.pState === sym('show')) this.setMember(EMPTY);
  }
}
