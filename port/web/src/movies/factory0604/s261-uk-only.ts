// factory0604 behavior 261 (sprite 334, frames 180-193): the five sprites from this
// one show only to players in the UK (gLocation).

import { Behavior, G, sprite, the } from '../../director';
import { eq } from '../robotwars/util';

export class UkOnly extends Behavior {
  exitFrame() {
    if (eq(G.gLocation, 'UK')) {
      this.Changestate(1);
      this.Changestate(0);
    } else {
      this.Changestate(0);
    }
  }

  Changestate(bo: number) {
    const sp = the.currentSpriteNum;
    const cont = 4;
    for (let tos = sp; tos <= sp + cont; tos++) sprite(tos).visible = !!bo;
  }
}
