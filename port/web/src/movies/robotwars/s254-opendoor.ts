// robotwars behavior 254 "opendoor": opens the garage doors once, silencing the
// sound channels first; remembers who sent a busy reply (bWho).

import { Behavior, G, sendAllSprites, sendSprite, sound } from '../../director';
import { sym, type LSymbol, type LValue } from '../../lingo';
import { playsound } from './s030-soundscript';

export class OpenDoor extends Behavior {
  state: LSymbol | undefined;

  beginSprite() {
    sendSprite(1, 'usedoktor');
  }

  exitFrame() {
    if (this.state === undefined) {
      sendAllSprites('doorAction', sym('open'));
      for (let ch = 1; ch <= 8; ch++) sound(ch).stop();
      playsound('doors', 255);
      this.state = sym('idle');
    }
  }

  Challenge_Busy(who: LValue) {
    G.bWho = who;
  }
}
