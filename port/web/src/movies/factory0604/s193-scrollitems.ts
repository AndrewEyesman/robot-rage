// factory0604 behavior 193 "scrollitems" (sprite 20): the inventory's scroll thumb,
// srcH 219 +- 128; remembers its place in gScrollx between rooms.

import { Behavior, G, sendAllSprites, sprite, the } from '../../director';
import { num, sym, type LSymbol, type LValue } from '../../lingo';

export class Scrollitems extends Behavior {
  sp = 0;
  srcH = 0;
  V = 0;
  vmax = 0;
  state: LSymbol | undefined;
  offset = 0;

  beginSprite() {
    this.sp = the.currentSpriteNum;
    this.srcH = 219;
    if (G.gScrollx !== undefined) {
      sprite(this.sp).locH = num(G.gScrollx);
      this.V = 2.0 * (num(G.gScrollx) - 219);
    } else {
      this.V = 0;
      sprite(this.sp).locH = this.srcH + Math.trunc(this.V / 2);
    }
    this.vmax = 256;
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
      this.V = x - this.srcH * 1.0;
      this.V = this.V * 2.0;
      if (this.V < -this.vmax) this.V = -this.vmax;
      if (this.V > this.vmax - 1) this.V = this.vmax;
      sprite(this.sp).locH = this.srcH + this.V / 2;
      const s = this.V / this.vmax;
      sendAllSprites('setHorizontalScroll', s);
      G.gScrollx = sprite(this.sp).locH;
    }
  }

  setscrollbar(Dir: LValue) {
    const step = num(Dir) * 1.0;
    this.V = this.V + step;
    if (this.V < -this.vmax) this.V = -this.vmax;
    if (this.V > this.vmax - 1) this.V = this.vmax;
    sprite(this.sp).locH = this.srcH + this.V / 2;
    const s = this.V / this.vmax;
    sendAllSprites('setHorizontalScroll', s);
  }

  getscrollbar() {
    return this.V / this.vmax;
  }
}
