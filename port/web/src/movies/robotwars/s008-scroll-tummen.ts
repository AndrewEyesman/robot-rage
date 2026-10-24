// robotwars behavior 8 "scroll tummen": a vertical scroll thumb (131..376) that sends
// #scrollVertical with how far it moved.

import { Behavior, cursor, sendAllSprites, sprite, the } from '../../director';
import { sym, type LSymbol } from '../../lingo';

export class ScrollTummen extends Behavior {
  sp = 0;
  state: LSymbol | undefined;
  srcV = 0;
  V = 0;
  vmax = 0;
  lastv = 0;
  relV = 0;

  beginSprite() {
    this.sp = the.currentSpriteNum;
    this.srcV = 131;
    this.vmax = 245;
    this.V = 0;
    this.lastv = this.V;
    sprite(this.sp).locV = this.srcV + this.V;
    sprite(this.sp).locZ = 500;
    this.state = sym('idle');
  }

  mouseDown() {
    cursor(290);
    this.relV = the.mouseV - sprite(this.sp).locV;
    this.state = sym('drag');
  }

  mouseUpOutSide() {
    cursor(-1);
    this.state = sym('idle');
  }

  mouseEnter() {
    if (!the.stillDown) cursor(260);
  }

  mouseLeave() {
    if (!the.stillDown) cursor(-1);
  }

  mouseUp() {
    cursor(260);
    this.state = sym('idle');
  }

  prepareFrame() {
    if (this.state === sym('drag')) {
      const y = the.mouseV;
      this.V = y - this.srcV - this.relV;
      if (this.V < 0) this.V = 0;
      if (this.V > this.vmax) this.V = this.vmax;
      sprite(this.sp).locV = this.srcV + this.V;
      sendAllSprites('scrollVertical', -1 * (this.V - this.lastv));
      this.lastv = this.V;
    }
  }
}
