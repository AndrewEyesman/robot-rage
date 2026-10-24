// factory0604 behaviors 166, 266 and 271 "zoombutton behavior" (identical, unused in the
// score; the score uses robotwars' own): a slider (srcH +- 47) that zooms sprite 6.

import { Behavior, sendSprite, sprite, the } from '../../director';
import { sym, type LSymbol } from '../../lingo';

export class Zoombutton extends Behavior {
  sp = 0;
  state: LSymbol | undefined;
  srcH = 0;
  V = 0;
  vmax = 0;

  beginSprite() {
    this.sp = the.currentSpriteNum;
    this.srcH = sprite(this.sp).locH;
    this.vmax = 94;
    this.V = 0;
    sprite(this.sp).locH = this.srcH + Math.trunc(this.V / 2);
    this.state = sym('idle');
  }

  mouseDown() {
    this.state = sym('drag');
  }

  mouseUpOutSide() {
    this.state = sym('idle');
  }

  mouseUp() {
    this.state = sym('idle');
  }

  prepareFrame() {
    if (this.state === sym('drag')) {
      const x = the.mouseH;
      this.V = x - this.srcH;
      this.V = this.V * 2;
      if (this.V < -this.vmax) this.V = -this.vmax;
      if (this.V > this.vmax) this.V = this.vmax;
      sprite(this.sp).locH = this.srcH + Math.trunc(this.V / 2);
      sendSprite(6, 'setZoom', this.V);
    }
  }
}
