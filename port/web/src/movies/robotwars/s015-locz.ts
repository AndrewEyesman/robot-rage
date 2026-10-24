// robotwars behaviors 15 "locz" and 21 "locz2": drawing order above (channel + 200)
// or below (1) everything else.

import { Behavior, sprite } from '../../director';

export class Locz extends Behavior {
  beginSprite() {
    const sp = this.spriteNum;
    sprite(sp).locZ = sp + 200;
  }
}

export class Locz2 extends Behavior {
  beginSprite() {
    const sp = this.spriteNum;
    sprite(sp).locZ = 1;
  }
}
