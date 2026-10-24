// lobby060_ behavior 26 "beta" (sprite 30): the spectator button, live only when
// main.ini's laktare is 1 (it is 0).

import { Behavior, G, cursor, dot, pass, rollover, sendSprite, sprite, the } from '../../director';
import { EMPTY, sym, type LSymbol, type LValue } from '../../lingo';
import { eq } from './util';

const laktare = () => eq(dot(G.gVersionList, 'laktare', 'version'), 1);

export class Beta extends Behavior {
  sp = 0;
  pname = '';
  state: LSymbol | undefined;

  beginSprite() {
    this.sp = the.currentSpriteNum;
    this.state = sym('idle');
    if (rollover(this.sp)) this.SetPointingCursor(1);
    this.sp = this.spriteNum;
    this.pname = sprite(this.sp).member.name;
  }

  mouseDown() {
    if (laktare()) {
      sendSprite(0, 'gotomovie', 'marker', 'viewChallenge');
      this.setMember('D');
      return pass();
    }
    return undefined;
  }

  mouseEnter() {
    if (laktare()) {
      this.setMember('D');
      if (!the.stillDown) this.SetPointingCursor(1);
      return pass();
    }
    return undefined;
  }

  SetPointingCursor(q: LValue) {
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

  mouseLeave() {
    this.setMember(EMPTY);
    this.SetPointingCursor(0);
    return pass();
  }

  inactivate() {
    this.state = sym('inactive');
  }

  mouseUp() {
    if (laktare()) {
      this.setMember('D');
      return pass();
    }
    return undefined;
  }

  mouseUpOutSide() {
    if (laktare()) this.setMember(EMPTY);
  }

  setMember(n: string) {
    sprite(this.sp).member = this.pname + n;
  }
}
