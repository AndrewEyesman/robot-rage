// arena104 behavior 18 "init backyard", the frame script of frame 18 on the way into
// Training: a Multiuser instance with no connection (so the robot's messages go
// nowhere), a fresh arena world with its camera out of the way, player 1, the names and
// empty weapon texts.

import { G, dot, member, newMultiuser, put, sendSprite, sprite } from '../../director';
import { member3d, vector } from '../../director/s3d';
import { LList, sym, voidp } from '../../lingo';

// global gUserData, gopponentdata, gPardDescription, gGamePlace, muInstance, gPlayerNumber, gOpponent, world

const EMPTY_TEXTS = [
  'weapon1 text', 'weapon2 text', 'weapon3 text', 'weapon1 num', 'weapon2 num', 'weapon3 num',
  'oweapon1 text', 'oweapon2 text', 'oweapon3 text', 'oweapon1 num', 'oweapon2 num', 'oweapon3 num',
];

export class InitBackyard {
  prepareFrame() {
    sendSprite(1, sym('usedoktor'));
    if (voidp(G.muInstance)) {
      put('muInstance = new');
      G.muInstance = newMultiuser();
      G.gOpponent = new LList(['nouser']);
    }
    G.world = member3d('arena');
    member3d('arena').resetWorld();
    member3d('arena').camera(1).worldPosition = vector(-10000, -10000, 0);
    G.gPlayerNumber = 1;
    G.gGamePlace = sym('backyard');
    member('player name').text = dot(G.gUserData, 'robotname');
    member('opponent name').text = dot(G.gopponentdata, 'robotname');
    const rd = dot(G.gUserData, 'propertyList', 'robotDescription');
    void rd;
    for (const name of EMPTY_TEXTS) member(name).text = '';
    sprite(42).visible = false;
  }
}
