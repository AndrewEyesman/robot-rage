// factory0604 behavior 11 "locz": draws the sprite above the unscripted ones (channel + 100).

import { Behavior, sprite } from '../../director';

export class Locz extends Behavior {
  beginSprite() {
    const sp = this.spriteNum;
    sprite(sp).locZ = sp + 100;
  }
}
