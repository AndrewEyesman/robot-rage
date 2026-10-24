// robotwars behavior 263 "doorbehavior": a garage door half (#Dir: 1 slides left, 0
// right) that slides 500 px open or closed on #doorAction, accelerating and braking.

import { Behavior, go, sprite, the } from '../../director';
import { propList, sym, type LSymbol, type LValue } from '../../lingo';
import { eq } from './util';

export class DoorBehavior extends Behavior {
  pState: LSymbol | undefined;
  dest = 0;
  x = 0;
  dx = 0;
  dx2 = 0;
  openpos = 0;
  closepos = 0;
  sp = 0;
  Dir: LValue;
  counter = 0;

  beginSprite() {
    this.sp = this.spriteNum;
    let rikt = 0;
    if (eq(this.Dir, 1)) rikt = 500;
    else if (eq(this.Dir, 0)) rikt = -500;
    this.openpos = sprite(this.sp).locH - rikt;
    this.closepos = sprite(this.sp).locH;
    this.dx = 0;
    this.dx2 = 1;
    this.counter = 0;
    if (the.frame === 4 || the.frame === 9 || the.frame === 8 || the.frame === 19) sprite(this.sp).visible = false;
  }

  prepareFrame() {
    const st = this.pState;
    if (st === sym('open')) {
      this.x = this.closepos;
      sprite(this.sp).locH = this.closepos;
      this.dest = this.openpos;
      this.dx = Math.trunc(Math.abs(this.dest - this.x) / 30);
      if (this.dx > 50) this.dx = 50;
      this.dx2 = 1;
      if (this.dest < this.x) this.dx2 = -1;
      this.pState = sym('moveopen');
    } else if (st === sym('moveopen')) {
      sprite(this.sp).visible = true;
      this.counter = this.counter + 1;
      if (this.ScrollTo(this.dest) === sym('done')) this.pState = sym('done');
    } else if (st === sym('close')) {
      this.x = this.openpos;
      sprite(this.sp).locH = this.openpos;
      this.dest = this.closepos;
      this.dx = Math.trunc(Math.abs(this.dest - this.x) / 30);
      if (this.dx > 50) this.dx = 50;
      this.dx2 = 1;
      if (this.dest < this.x) this.dx2 = -1;
      this.pState = sym('moveclose');
    } else if (st === sym('moveclose')) {
      sprite(this.sp).visible = true;
      this.counter = this.counter + 1;
      // The original passes 0, not dest, when closing (quirk kept).
      if (this.ScrollTo(0) === sym('done')) this.pState = sym('done');
    }
  }

  exitFrame() {
    if (this.pState === sym('done')) go(the.frame + 1);
    else go(the.frame);
  }

  doorAction(action: LSymbol) {
    this.pState = action;
  }

  ScrollTo(dest: number): LSymbol | undefined {
    if (dest !== this.x) {
      if (Math.trunc(((this.dx + 1) * (this.dx + 2)) / 2) <= Math.abs(this.x - dest)) this.dx = this.dx + 1;
      else this.dx = this.dx - 1;
      this.x = this.x + this.dx * this.dx2;
      if (this.dx > 50) this.dx = 50;
      sprite(this.sp).locH = this.x;
      return undefined;
    }
    return sym('done');
  }

  getPropertyDescriptionList() {
    return propList(sym('Dir'), propList(sym('default'), 1, sym('format'), sym('boolean'), sym('comment'), 'sida:vŠnster'));
  }
}
