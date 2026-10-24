// lobby060_ behavior 22: holds the frame.

import { Behavior, go, the } from '../../director';

export class Hold22 extends Behavior {
  exitFrame() {
    go(the.frame);
  }
}
