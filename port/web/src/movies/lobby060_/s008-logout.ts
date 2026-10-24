// lobby060_ behavior 8 "logout": holds the frame.

import { Behavior, go, the } from '../../director';

export class Logout extends Behavior {
  exitFrame() {
    go(the.frame);
  }
}
