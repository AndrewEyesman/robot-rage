// factory0604 behavior 29 (unused in the score): the match result on the door after a
// fight (gMatchResult, gMatchscore); moves on when the doors are done (#doordone).
// The Swedish texts are kept as the Windows player showed their Mac bytes (å ä ö as
// Œ Š š).

import { Behavior, G, go, sendAllSprites, the } from '../../director';
import { EMPTY, RETURN, abs, lingoString, sym, type LSymbol } from '../../lingo';

export class MatchResult extends Behavior {
  state: LSymbol | undefined;
  pTime = 0;

  beginSprite() {
    this.state = sym('init');
  }

  prepareFrame() {
    this.pTime = the.milliSeconds + 4000;
    if (this.state === sym('init')) {
      const score = lingoString(abs(G.gMatchscore));
      switch (G.gMatchResult) {
        case sym('lost'):
          sendAllSprites('showDoorMessage', 'Du fšrlorade matchen!' + RETURN + RETURN + 'Dessutom drogs det ' + score + ' poŠng' + RETURN + RETURN + 'Din robot repareras just nu, men Šr strax klar!');
          break;
        case sym('won'):
          sendAllSprites('showDoorMessage', 'Du vann!!!' + RETURN + RETURN + 'Dessutom fick du ' + score + ' fina poŠng' + RETURN + RETURN + 'Du fick 10 nya stŒlar' + RETURN + RETURN + 'Din robot repareras just nu, men Šr strax klar!');
          break;
        case sym('walkover'):
          sendAllSprites('showDoorMessage', 'Du vann pŒ walk-over!');
          break;
        default:
          this.pTime = the.milliSeconds;
          sendAllSprites('showDoorMessage', EMPTY);
      }
      this.state = sym('idle');
    }
  }

  exitFrame() {
    if (this.state === sym('go')) {
      go(the.frame + 1);
      return;
    }
    go(the.frame);
  }

  doordone() {
    this.state = sym('go');
  }

  setState(ST: LSymbol) {
    this.state = ST;
  }
}
