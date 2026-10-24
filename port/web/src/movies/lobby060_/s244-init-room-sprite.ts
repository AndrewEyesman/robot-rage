// lobby060_ behavior 244 "init room sprite" (an older room view; not in the score):
// makes the room object a behavior of this sprite. The room object of this version
// has neither setupSprite nor hideScrollBar, so both handlers end in a script error.

import { Behavior, G, sprite, the } from '../../director';
import type { Sprite } from '../../director';

export class InitRoomSprite extends Behavior {
  pSprite!: Sprite;

  beginSprite() {
    this.pSprite = sprite(the.currentSpriteNum);
    this.pSprite.puppet = true;
    G.gRoom.setupSprite(the.currentSpriteNum);
    this.pSprite.scriptInstanceList.push(G.gRoom);
  }

  endSprite() {
    G.gRoom.hideScrollBar();
    G.gRoom.LeaveRoom();
    this.pSprite.puppet = false;
  }
}
