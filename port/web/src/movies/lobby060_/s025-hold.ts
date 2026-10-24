// lobby060_ behavior 25: holds the frame.

import { Behavior, go, the } from '../../director';

export class Hold25 extends Behavior {
  exitFrame() {
    go(the.frame);
  }
}
