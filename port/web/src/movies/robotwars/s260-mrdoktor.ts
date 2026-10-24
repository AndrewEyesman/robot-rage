// robotwars behavior 260 "mrdoktor behavior" (on sprite 1 of the garage and lobby
// frames): gDoktor is an encrypted copy of gUserData made after every legitimate
// change (#makedoktor); #usedoktor restores it if gUserData was edited behind its back
// and counts a #hacker strike.

import { Behavior, G, dot, put, sendSprite } from '../../director';
import { LPropList, sym, voidp } from '../../lingo';
import { rocket_decrypt, rocket_encrypt } from './s072-rocket-encrypt';

export class MrDoktor extends Behavior {
  makedoktor() {
    G.gDoktor = rocket_encrypt(G.gUserData);
  }

  usedoktor() {
    if (G.gDoktor !== rocket_encrypt(G.gUserData)) {
      G.gUserData = rocket_decrypt(G.gDoktor);
      put('fuskis');
      const pl = dot(G.gUserData, 'propertyList') as LPropList;
      if (voidp(pl.getaProp(sym('hacker')))) pl.setaProp(sym('hacker'), 1);
      else pl.setaProp(sym('hacker'), Number(pl.getaProp(sym('hacker'))) + 1);
      G.gDoktor = rocket_encrypt(G.gUserData);
      sendSprite(0, 'uppdateall');
    }
  }
}
