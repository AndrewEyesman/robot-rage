// login013_ behavior "New Behavior": to the create-account tab.

import { Behavior, go, sprite, the } from '../../director';

export class ToCreate extends Behavior {
  mouseUp() {
    go('create');
  }
  beginSprite() {
    sprite(the.currentSpriteNum).cursor = 280;
  }
}
