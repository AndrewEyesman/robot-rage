// login013_ behavior "PoplostPassword": the "Forgot your password?" link, a page
// script of the original site.

import { Behavior, gotoNetPage, sprite, the } from '../../director';

export class PoplostPassword extends Behavior {
  mouseUp() {
    gotoNetPage('javascript:openPassPop()');
  }
  beginSprite() {
    sprite(the.currentSpriteNum).cursor = 280;
  }
  endSprite() {
    sprite(the.currentSpriteNum).cursor = 0;
  }
}
