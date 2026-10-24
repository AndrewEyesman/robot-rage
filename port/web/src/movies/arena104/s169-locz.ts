// arena104 behavior 169 "locz-" (the battery bars, sprites 70 and 80): drawn below the
// frame bitmap, showing through its window.

import { Behavior, sprite } from '../../director';

export class LoczMinus extends Behavior {
  beginSprite() {
    const sp = this.spriteNum;
    sprite(sp).locZ = 1;
  }
}
