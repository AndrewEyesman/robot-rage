// arena104 behavior 5 "closedoor": closes the doors once (the score uses the shared
// cast's closedoor instead).

import { sendAllSprites } from '../../director';
import { sym, type LSymbol } from '../../lingo';

export class CloseDoor {
  state: LSymbol | undefined = undefined;

  exitFrame() {
    if (this.state === undefined) {
      sendAllSprites(sym('doorAction'), sym('close'));
      this.state = sym('idle');
    }
  }
}
