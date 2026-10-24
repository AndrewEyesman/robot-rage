// factory0604 behavior 93 (unused in the score): closes the garage doors once, with
// their sound.

import { Behavior, sendAllSprites } from '../../director';
import { sym, type LSymbol } from '../../lingo';
import { playsound } from '../robotwars/s030-soundscript';

export class CloseDoorsOnce extends Behavior {
  state: LSymbol | undefined;

  exitFrame() {
    if (this.state === undefined) {
      sendAllSprites('doorAction', sym('close'));
      playsound('doors', 255);
      this.state = sym('idle');
    }
  }
}
