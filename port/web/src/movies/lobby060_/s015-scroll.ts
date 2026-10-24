// lobby060_ behavior 15 "scroll" (sprite 5): the scroll thumb for the long list in
// sprite 9; dragging or the arrow buttons (#ScrollER) move the list.

import { Behavior, sprite, the } from '../../director';
import { sym, type LSymbol, type LValue } from '../../lingo';
import type { Sprite } from '../../director';

export class Scroll extends Behavior {
  pLines = 0;
  pState: LSymbol | undefined;
  pList!: Sprite;
  sp = 0;
  pMax = 0;
  pMin = 0;
  pmove = 0;

  beginSprite() {
    this.sp = this.spriteNum;
    this.pLines = 0;
    this.pState = sym('locked');
    this.pList = sprite(9);
    this.pMax = 377.0;
    this.pMin = 133.0;
  }

  mouseDown() {
    this.Checkscroll();
  }

  mouseUp() {
    this.pState = sym('nada');
  }

  mouseUpOutSide() {
    this.pState = sym('nada');
  }

  prepareFrame() {
    if (this.pState === sym('scroll')) {
      let loc = the.mouseV;
      if (loc < this.pMin) loc = this.pMin;
      if (loc > this.pMax) loc = this.pMax;
      sprite(this.sp).locV = loc;
      const procent = (loc - this.pMin) / (this.pMax - this.pMin);
      this.pList.locV = 70 - procent * (this.pList.height - 370);
    } else if (this.pState === sym('locked')) {
      this.pList.locV = 70;
      sprite(this.sp).locV = this.pMin;
      this.pState = sym('nada');
    } else if (this.pState === sym('move')) {
      let loc = sprite(this.sp).locV;
      loc = loc + this.pmove;
      if (loc < this.pMin) loc = this.pMin;
      if (loc > this.pMax) loc = this.pMax;
      sprite(this.sp).locV = loc;
      const procent = (loc - this.pMin) / (this.pMax - this.pMin);
      this.pList.locV = 70 - procent * (this.pList.height - 370);
      this.pState = sym('nada');
    }
  }

  ScrollER(Dir: LValue) {
    this.pmove = Number(Dir);
    if (this.pList.height !== this.pLines) this.pLines = this.pList.height;
    if (this.pList.height > 380) this.pState = sym('move');
  }

  changescroll() {
    this.pmove = 0;
    if (this.pList.height !== this.pLines) this.pLines = this.pList.height;
    if (this.pList.height > 380) this.pState = sym('move');
  }

  Checkscroll() {
    if (this.pList.height !== this.pLines) this.pLines = this.pList.height;
    if (this.pList.height > 380) this.pState = sym('scroll');
    else this.pState = sym('locked');
  }

  ResetSetScroll() {
    this.pState = sym('locked');
  }
}
