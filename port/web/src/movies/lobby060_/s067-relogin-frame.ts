// lobby060_ behavior 67: the firewall notice frame ("FWError"): holds until #Relogin.

import { Behavior, go, sendSprite, the } from '../../director';
import { sym, type LSymbol } from '../../lingo';

export class ReloginFrame extends Behavior {
  pState: LSymbol | undefined;

  exitFrame() {
    if (this.pState !== sym('nada')) go(the.frame);
  }

  Relogin() {
    go('login');
    this.pState = sym('nada');
  }

  beginSprite() {
    sendSprite(1, 'usedoktor');
  }
}
