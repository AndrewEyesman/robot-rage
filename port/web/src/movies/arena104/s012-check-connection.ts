// arena104 behavior 12 "check connection": an empty beginSprite (not in the score).

import { Behavior } from '../../director';
import type { LValue } from '../../lingo';

// global gPlayerNumber, muInstance, gPlayer, gOpponent, gpingtime, gMinPingTime, gDelay, gTimeDiff, gUseUDP

export class CheckConnection extends Behavior {
  state: LValue = undefined;
  wait: LValue = undefined;
  pingNum: LValue = undefined;

  beginSprite() {}
}
