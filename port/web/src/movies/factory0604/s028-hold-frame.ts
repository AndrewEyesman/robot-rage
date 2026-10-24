// factory0604 behaviors 28, 91, 110, 173 and 288 (five identical scripts): hold the frame.

import { Behavior, go, the } from '../../director';

export class HoldFrame extends Behavior {
  exitFrame() {
    go(the.frame);
  }
}
