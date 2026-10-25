// lobby060_ behavior 65 "doorbehavior" (the bottom buttons, sprites 100-107, on the
// door frames): robotwars' door behavior with `sprite.visibility` instead of
// `visible`. Sprites have no visibility property and this behavior declares none, so
// each of those lines is a script error in Director: beginSprite ends there (it is
// the last line), and while opening or closing prepareFrame stops before the slide,
// so these sprites never move. Kept as such.

import { Behavior, go, sprite, the } from '../../director';
import { propList, sym, type LSymbol, type LValue } from '../../lingo';
import { eq } from './util';


export class Doorbehavior extends Behavior {
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
    // sprite(sp).visibility = 0 on frames 4, 8, 9 and 19: the script error that ends
    // this handler is its last line anyway.
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
      return; // sprite(sp).visibility = 1: the script error ends the handler here.
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
      return; // sprite(sp).visibility = 1: the script error ends the handler here.
      this.counter = this.counter + 1;
      // ScrollTo(me, 0): ScrollTo slides to the dest property whatever it's given (below).
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

  /** Slides toward the dest property, not the argument (the bytecode's getprop: robotwars s263). */
  ScrollTo(_dest: number): LSymbol | undefined {
    const dest = this.dest;
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
    return propList(sym('Dir'), propList(sym('default'), 1, sym('format'), sym('boolean'), sym('comment'), 'sida:vänster'));
  }
}
