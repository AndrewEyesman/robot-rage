// factory0604 behavior 96 (unused in the score): opens the garage doors once.

import { Behavior, sendAllSprites } from '../../director';
import { sym, type LSymbol } from '../../lingo';

export class OpenDoorsOnce extends Behavior {
  state: LSymbol | undefined;

  exitFrame() {
    if (this.state === undefined) {
      sendAllSprites('doorAction', sym('open'));
      this.state = sym('idle');
    }
  }
}
