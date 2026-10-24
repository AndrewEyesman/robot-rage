// arena104 behavior 16 "init robot info", the frame script of frame 7 (every round of a
// match): a fresh arena world, the robots' names, empty weapon and chat texts. An
// opponent the server marked #nogood sends the player back.

import { G, dot, go, member, puppetSprite, sendAllSprites, sendSprite, the } from '../../director';
import { member3d } from '../../director/s3d';
import { sym } from '../../lingo';
import { eq } from './util';

// global gUserData, gopponentdata, gPartDescription, gGamePlace, gMatchResult, gMatchscore, gOpponent, world

const EMPTY_TEXTS = [
  'weapon1 text', 'weapon2 text', 'weapon3 text', 'weapon1 num', 'weapon2 num', 'weapon3 num',
  'oweapon1 text', 'oweapon2 text', 'oweapon3 text', 'oweapon1 num', 'oweapon2 num', 'oweapon3 num',
];

export class InitRobotInfo {
  prepareFrame() {
    sendSprite(1, sym('usedoktor'));
    G.gGamePlace = sym('arena');
    G.world = member3d('arena');
    G.world.resetWorld();
    member('player name').text = dot(G.gUserData, 'robotname');
    member('opponent name').text = G.gOpponent;
    for (const name of EMPTY_TEXTS) member(name).text = '';
    member('chat history').text = '';
    member('chat overlay').text = '';
  }

  exitFrame() {
    if (eq(dot(G.gopponentdata, 'propertyList', 'nogood'), 1)) {
      if (!eq(the.runMode, 'Author')) {
        G.gMatchResult = sym('nada');
        G.gMatchscore = 0;
        go('goback');
      }
    }
    sendAllSprites(sym('doneSprite'));
    for (let i = 100; i <= 140; i++) {
      puppetSprite(i, 0);
    }
  }
}
