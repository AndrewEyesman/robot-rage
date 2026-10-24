// lobby060_ behavior 16: opens the doors once (sprites 29 and 31 of the lobby).

import { Behavior, sendAllSprites } from '../../director';
import { sym, type LSymbol } from '../../lingo';

export class OpenDoors16 extends Behavior {
  state: LSymbol | undefined;

  exitFrame() {
    if (this.state === undefined) {
      sendAllSprites('doorAction', sym('open'));
      this.state = sym('idle');
    }
  }
}
