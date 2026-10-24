// arena104 behavior 167 "update m", the frame script of frame 27 after a match: a
// ranked match the player didn't lose pays 10 money per round won (info1 is the
// money's check value: 1112 - money).

import { G, dot, go, sendAllSprites, the } from '../../director';
import { LPropList, sym } from '../../lingo';
import { rankatspel } from './s006-arena-3d';
import { n } from './util';

export class UpdateM {
  exitFrame() {
    // global gMatchResult, gGamePlace, gWonGames, gUserData, gLostGames
    if (rankatspel()) {
      if (n(G.gWonGames) >= n(G.gLostGames)) {
        sendAllSprites(sym('usedoktor'));
        const pl = dot(G.gUserData, 'propertyList') as LPropList;
        if (n(pl.getaProp(sym('info1'))) !== 1112 - n(pl.getaProp(sym('money')))) {
          pl.setaProp(sym('money'), 0);
          pl.setaProp(sym('info1'), 1112 - n(pl.getaProp(sym('money'))));
        }
        pl.setaProp(sym('money'), n(pl.getaProp(sym('money'))) + 10 * n(G.gWonGames));
        pl.setaProp(sym('info1'), 1112 - n(pl.getaProp(sym('money'))));
        sendAllSprites(sym('makedoktor'));
      }
    }
    go(the.frame + 1);
  }
}
