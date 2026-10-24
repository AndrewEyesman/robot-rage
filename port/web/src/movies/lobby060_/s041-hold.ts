// lobby060_ behavior 41 "hold": holds the frame (frames 23, 33, 43).

import { Behavior, go, sendSprite, the } from '../../director';

export class Hold41 extends Behavior {
  beginSprite() {
    sendSprite(1, 'usedoktor');
  }

  exitFrame() {
    go(the.frame);
  }
}
