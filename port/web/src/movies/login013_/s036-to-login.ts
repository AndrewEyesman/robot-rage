// login013_ behavior 36: back to the login tab.

import { Behavior, go, sprite, the } from '../../director';

export class ToLogin extends Behavior {
  mouseUp() {
    go('login');
  }
  beginSprite() {
    sprite(the.currentSpriteNum).cursor = 280;
  }
}
