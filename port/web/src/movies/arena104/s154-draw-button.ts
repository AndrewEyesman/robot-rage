// arena104 behavior 154 "draw button" (sprite 214 during a round): offer a draw, or
// accept the opponent's offer; once per round.

import { G, sendSprite } from '../../director';
import { sym, type LValue } from '../../lingo';
import { eq } from './util';

// global gOpponentReady, gdraw, gOpponent, muInstance, gUseUDP

export class DrawButton {
  pPushed: LValue = undefined;

  beginSprite() {
    this.pPushed = 0;
  }

  mouseUp() {
    if (this.pPushed === 0) {
      G.gOpponentReady = 0;
      if (eq(G.gdraw, G.gOpponent)) {
        sendSprite(0, sym('sendDRAW'), 'OK');
      } else {
        sendSprite(0, sym('sendDRAW'), 'Call it a draw?');
      }
      this.pPushed = 1;
    }
  }
}
