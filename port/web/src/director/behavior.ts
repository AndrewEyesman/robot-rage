// Base class for translated behaviors: the player sets `spriteNum` before
// beginSprite, as Director sets `me.spriteNum`.

import { player } from './api';
import type { Sprite } from './sprite';

export class Behavior {
  spriteNum = 0;

  /** sprite(me.spriteNum) */
  get sprite(): Sprite {
    return player.sprite(this.spriteNum);
  }
}
