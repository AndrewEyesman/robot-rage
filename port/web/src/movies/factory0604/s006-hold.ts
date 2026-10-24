// factory0604 behavior 6 "hold" (frame script of the door frames 23, 33, 48, 58):
// restores gUserData if it was edited behind the game's back, and holds the frame.

import { Behavior, go, sendSprite, the } from '../../director';

export class Hold extends Behavior {
  beginSprite() {
    sendSprite(1, 'usedoktor');
  }

  exitFrame() {
    go(the.frame);
  }
}
