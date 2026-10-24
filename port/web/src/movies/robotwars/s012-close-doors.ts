// robotwars behavior 12: closes the garage doors once (on prepareFrame).

import { Behavior, sendAllSprites } from '../../director';
import { sym, type LSymbol } from '../../lingo';

export class CloseDoors extends Behavior {
  state: LSymbol | undefined;

  prepareFrame() {
    if (this.state === undefined) {
      sendAllSprites('doorAction', sym('close'));
      this.state = sym('idle');
    }
  }
}
