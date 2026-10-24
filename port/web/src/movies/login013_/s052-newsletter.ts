// login013_ behavior 52: the newsletter tick box (the tick is the sprite below).

import { Behavior, sprite, the } from '../../director';

export class Newsletter extends Behavior {
  mouseUp() {
    this.setNewsletter(!sprite(the.currentSpriteNum - 1).visible);
  }
  setNewsletter(bol: boolean | number) {
    sprite(the.currentSpriteNum - 1).visible = !!bol;
  }
  endSprite() {
    sprite(the.currentSpriteNum - 1).visible = true;
  }
  beginSprite() {
    sprite(the.currentSpriteNum).cursor = 280;
    this.setNewsletter(0);
  }
}
