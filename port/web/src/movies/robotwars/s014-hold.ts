// robotwars behaviors 14, 29 and 93: hold the frame.

import { Behavior, go, the } from '../../director';

export class HoldFrame extends Behavior {
  exitFrame() {
    go(the.frame);
  }
}
