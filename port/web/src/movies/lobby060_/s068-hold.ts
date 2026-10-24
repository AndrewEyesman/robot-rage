// lobby060_ behavior 68 "hold": holds the frame (frames 53, 77).

import { Behavior, go, sendSprite, the } from '../../director';

export class Hold68 extends Behavior {
  beginSprite() {
    sendSprite(1, 'usedoktor');
  }

  exitFrame() {
    go(the.frame);
  }
}
