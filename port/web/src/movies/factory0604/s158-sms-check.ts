// factory0604 behavior 158 (sprite 319, the Super Weapons page): passes the click on
// to the button below (sprite - 1), checks the server for weapons bought by SMS now
// and in two minutes, and hides the purchase box.

import { Behavior, cursor, sendAllSprites, sendSprite, the } from '../../director';

export class SmsCheck extends Behavior {
  mouseUp() {
    sendAllSprites('SetAutomaticCheckTime');
    sendSprite(0, 'updateSMS');
    sendAllSprites('SetVisib', 0);
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
