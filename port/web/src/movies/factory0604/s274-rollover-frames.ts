// factory0604 behavior 274 "Rollover Frames" (unused in the score): plays the frame
// after this one that matches the sprite (#first..#last) under the mouse.

import { Behavior, go, rollover, the } from '../../director';

export class RolloverFrames extends Behavior {
  first = 10;
  last = 15;
  firstFrame = 0;

  beginSprite() {
    this.firstFrame = the.frame;
  }

  exitFrame() {
    let i = this.first;
    for (; i <= this.last; i++) if (rollover(i)) break;
    if (i <= this.last) go(this.firstFrame + 1 + i - this.first);
    else go(this.firstFrame);
  }
}
