// robotwars behavior 239 "closedoor": closes the garage doors once, with their sound.

import { Behavior, sendAllSprites, sendSprite } from '../../director';
import { sym, type LSymbol } from '../../lingo';
import { playsound } from './s030-soundscript';

export class CloseDoor extends Behavior {
  state: LSymbol | undefined;

  exitFrame() {
    sendSprite(1, 'usedoktor');
    if (this.state === undefined) {
      sendAllSprites('doorAction', sym('close'));
      playsound('doors', 255);
      this.state = sym('idle');
    }
  }
}
