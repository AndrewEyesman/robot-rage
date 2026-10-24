// robotwars behavior 20 "zoombutton behavior": a horizontal slider (631 +- 100) that
// sends #setZoom to sprite 6 (the 3D preview) and remembers its place in gZoom.

import { Behavior, G, sendSprite, sprite, the } from '../../director';
import { sym, type LSymbol } from '../../lingo';

export class ZoomButton extends Behavior {
  sp = 0;
  state: LSymbol | undefined;
  srcH = 0;
  V = 0;
  vmax = 0;
  offset = 0;

  beginSprite() {
    this.sp = the.currentSpriteNum;
    this.srcH = 631;
    this.V = 0;
    sprite(this.sp).locH = this.srcH + Math.trunc(this.V / 2);
    this.vmax = 200;
    this.state = sym('idle');
  }

  mouseDown() {
    this.offset = the.mouseH - sprite(this.sp).locH;
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
      const x = the.mouseH - this.offset;
      this.V = x - this.srcH;
      this.V = this.V * 2;
      if (this.V < -this.vmax) this.V = -this.vmax;
      if (this.V > this.vmax - 1) this.V = this.vmax - 1;
      sprite(this.sp).locH = this.srcH + Math.trunc(this.V / 2);
      if (this.V !== 0) sendSprite(6, 'setZoom', this.V);
      G.gZoom = sprite(this.sp).locH;
    }
  }

  setzoomer() {
    const x = sprite(this.sp).locH;
    this.V = x - this.srcH;
    this.V = this.V * 2;
    if (this.V !== 0) sendSprite(6, 'setZoom', this.V);
  }
}
