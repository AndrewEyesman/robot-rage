// arena104 behavior 178 "opendoor": opens the doors once (the score uses the shared
// cast's opendoor instead).

import { sendAllSprites } from '../../director';
import { sym, type LSymbol } from '../../lingo';

export class OpenDoor178 {
  state: LSymbol | undefined = undefined;

  exitFrame() {
    if (this.state === undefined) {
      sendAllSprites(sym('doorAction'), sym('open'));
      this.state = sym('idle');
    }
  }
}
