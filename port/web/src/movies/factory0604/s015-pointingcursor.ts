// factory0604 behaviors 15, 268 and 269 "PointingCursor" (identical; 15 is the one in
// the score): the pointing hand while the mouse is over the sprite.

import { Behavior, cursor, pass, rollover, the } from '../../director';
import { sym, type LSymbol } from '../../lingo';

export class PointingCursor extends Behavior {
  sp = 0;
  state: LSymbol | undefined;

  beginSprite() {
    this.sp = the.currentSpriteNum;
    this.state = sym('idle');
    if (rollover(this.sp)) this.SetPointingCursor(1);
  }

  mouseEnter() {
    if (!the.stillDown) this.SetPointingCursor(1);
    return pass();
  }

  // Called without `me` in the original: a handler of the same script.
  SetPointingCursor(q: number) {
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
    this.SetPointingCursor(0);
    return pass();
  }

  endSprite() {
    this.SetPointingCursor(0);
  }

  inactivate() {
    this.state = sym('inactive');
  }
}
