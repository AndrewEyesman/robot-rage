// factory0604 behavior 262 "ShowPurhase SuperPack" (unused in the score): shows the
// purchase box and passes the click on to the button below (sprite - 1).

import { Behavior, cursor, sendAllSprites, sendSprite, the } from '../../director';

export class ShowPurchaseSuperPack extends Behavior {
  mouseUp() {
    sendAllSprites('ShowpurchaseBox');
    sendSprite(the.currentSpriteNum - 1, 'mouseUp');
  }

  mouseDown() {
    sendSprite(the.currentSpriteNum - 1, 'mouseDown');
  }

  mouseEnter() {
    cursor(280);
    sendSprite(the.currentSpriteNum - 1, 'mouseEnter');
  }

  mouseLeave() {
    cursor(-1);
    sendSprite(the.currentSpriteNum - 1, 'mouseLeave');
  }
}
