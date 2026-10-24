// arena104 behavior 180 "revansch button" (PLAY AGAIN, sprite 208 after a round): ask
// for a rematch, or accept the opponent's request.

import { G, sendSprite } from '../../director';
import { sym } from '../../lingo';
import { eq } from './util';

// global gOpponentReady, gRev, gOpponent, muInstance, gUseUDP

export class RevanschButton {
  mouseUp() {
    G.gOpponentReady = 0;
    if (eq(G.gRev, G.gOpponent)) {
      sendSprite(0, sym('sendRev'), 'OK');
    } else {
      sendSprite(0, sym('sendRev'), 'Play Again?');
    }
  }
}
