// arena104 behavior 241 "abuse", the frame script of frame 26: holds on the
// report-abuse question while the player's abuse flag is up.

import { G, go, sendSprite, the } from '../../director';
import { sym } from '../../lingo';
import { eq } from './util';

// global gAbuse

export class AbuseFrame {
  beginSprite() {
    sendSprite(1, sym('usedoktor'));
  }

  exitFrame() {
    if (eq(G.gAbuse, 1)) {
      go(the.frame);
    }
  }
}
