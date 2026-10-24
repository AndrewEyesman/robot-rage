// factory0604 behavior 179 (unused in the score): swallows clicks and draws the sprite
// above the others (channel + 200).

import { Behavior, sprite } from '../../director';

export class AboveAll extends Behavior {
  mouseUp() {}

  beginSprite() {
    const sp = this.spriteNum;
    sprite(sp).locZ = sp + 200;
  }
}
