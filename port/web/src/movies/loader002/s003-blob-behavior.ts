// loader002 behavior 3 "Blob Behavior": one of the twelve progress lights (sprites
// 10-21) fades in as loading passes its share.

import { Behavior, sprite, the, type Sprite } from '../../director';

export class BlobBehavior extends Behavior {
  sp: Sprite | undefined;
  L: unknown;
  n = 0;

  beginSprite() {
    this.sp = sprite(the.currentSpriteNum);
    this.sp.blend = 0;
    this.n = the.currentSpriteNum - 9;
  }

  updateLoader(sF: number) {
    const p = sF * 13.0;
    if (p >= this.n + 1) {
      this.sp!.blend = 100;
      return;
    }
    // The original scales sF, not p, here.
    if (p > this.n) this.sp!.blend = (sF - this.n) * 100;
  }
}
