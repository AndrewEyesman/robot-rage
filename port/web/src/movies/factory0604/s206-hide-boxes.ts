// factory0604 behavior 206 (sprite 321, the Super Weapons page): hides the purchase
// box and passes the click on to the button below (sprite - 1).

import { Behavior, cursor, sendAllSprites, sendSprite, the } from '../../director';

export class HideBoxes extends Behavior {
  mouseUp() {
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
