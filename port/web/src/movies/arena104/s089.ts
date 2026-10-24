// arena104 behavior 89, the frame script after "open" (revenge or draw accepted): back
// to "start", which sets the match up again for the next round.

import { go, sendSprite } from '../../director';
import { sym } from '../../lingo';

export class Script89 {
  beginSprite() {
    sendSprite(1, sym('usedoktor'));
  }

  exitFrame() {
    go('start');
  }
}
