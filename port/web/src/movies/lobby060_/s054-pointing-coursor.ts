// lobby060_ behavior 54 "Pointing Coursor": the pointing-hand cursor over a sprite.

import { Behavior, cursor, pass, rollover, the } from '../../director';
import { sym, type LSymbol, type LValue } from '../../lingo';

export class PointingCoursor extends Behavior {
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
    this.SetPointingCursor(0);
    return pass();
  }

  inactivate() {
    this.state = sym('inactive');
  }
}
