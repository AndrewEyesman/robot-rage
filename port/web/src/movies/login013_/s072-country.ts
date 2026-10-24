// login013_ behavior 72: the player's country from the ip2country lookup; clicking
// toggles UK/SE.

import { Behavior, G, getNetText, go, netDone, netTextResult, put, sprite, the } from '../../director';
import { item, itemDelimiter, setItemDelimiter, sym, type LSymbol, type LValue } from '../../lingo';

export class Country extends Behavior {
  pState: LSymbol | undefined;
  tNetID: number | undefined;

  beginSprite() {
    this.pState = sym('init');
  }

  exitFrame() {
    if (this.pState === sym('init')) {
      this.tNetID = getNetText('http://miniclip2.shockplay.com/php/ip2country.php');
      sprite(the.currentSpriteNum).member.text = '?';
      this.pState = sym('wait');
    } else if (this.pState === sym('wait')) {
      if (netDone(this.tNetID)) {
        const rres = netTextResult(this.tNetID);
        const odel = itemDelimiter();
        setItemDelimiter('=');
        G.gLocation = item(rres, 2);
        sprite(the.currentSpriteNum).member.text = G.gLocation;
        put(G.gLocation);
        setItemDelimiter(odel);
        this.pState = sym('done');
      }
    }
    go(the.frame);
  }

  done(L: LValue) {
    put(L);
  }

  mouseUp() {
    G.gLocation = G.gLocation === 'UK' ? 'SE' : 'UK';
    sprite(the.currentSpriteNum).member.text = G.gLocation;
  }
}
