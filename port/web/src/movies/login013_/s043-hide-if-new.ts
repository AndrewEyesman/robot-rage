// login013_ behavior "HideIfNew": hidden while the member has no robots.

import { Behavior, sprite, the } from '../../director';

export class HideIfNew extends Behavior {
  endSprite() {
    sprite(the.currentSpriteNum).visible = true;
  }
  HideIfNew(bbo: number) {
    sprite(the.currentSpriteNum).visible = !!bbo;
  }
}
