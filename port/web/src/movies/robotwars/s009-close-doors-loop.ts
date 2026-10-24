// robotwars behavior 9: closes the garage doors once, and holds the frame.

import { Behavior, go, sendAllSprites, the } from '../../director';
import { sym, type LSymbol } from '../../lingo';

export class CloseDoorsLoop extends Behavior {
  state: LSymbol | undefined;

  exitFrame() {
    if (this.state === undefined) {
      sendAllSprites('doorAction', sym('close'));
      this.state = sym('idle');
    }
    go(the.frame);
  }
}
