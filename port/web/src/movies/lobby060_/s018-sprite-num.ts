// lobby060_ behavior 18 (sprite 23, the CHALLENGE label): remembers its channel.

import { Behavior } from '../../director';

export class SpriteNum18 extends Behavior {
  sp = 0;

  beginSprite() {
    this.sp = this.spriteNum;
  }
}
