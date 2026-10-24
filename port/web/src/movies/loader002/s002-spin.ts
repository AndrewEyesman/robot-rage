// loader002 behavior 2: the loading wheel turns 2 degrees a frame.

import { Behavior, sprite, the } from '../../director';

export class Spin extends Behavior {
  exitFrame() {
    sprite(the.currentSpriteNum).rotation = sprite(the.currentSpriteNum).rotation + 2;
  }
}
