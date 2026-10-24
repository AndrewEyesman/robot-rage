// lobby060_ behavior 42: opens the doors once and holds the frame.

import { Behavior, go, sendAllSprites, the } from '../../director';
import { sym, type LSymbol } from '../../lingo';

export class OpenDoorsHold42 extends Behavior {
  state: LSymbol | undefined;

  exitFrame() {
    if (this.state === undefined) {
      sendAllSprites('doorAction', sym('open'));
      this.state = sym('idle');
    }
    go(the.frame);
  }
}
