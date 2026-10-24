// arena104 behavior 13, the frame script of frame 1, where a match enters the arena:
// the round count starts over and InitMultiUser takes over the lobby's connection.

import { G, sendSprite, the } from '../../director';
import { sym } from '../../lingo';
import { InitMultiUser } from './s008-multiuser-scripts';

export class Script13 {
  exitFrame() {
    // global gTimeDiff, gPlayerNumber, gpingtime, gWonGames, gLostGames, gMatchscore
    G.gMatchscore = 0;
    sendSprite(1, sym('usedoktor'));
    G.gpingtime = the.milliSeconds;
    InitMultiUser();
    G.gWonGames = 0;
    G.gLostGames = 0;
    G.gTimeDiff = undefined;
  }
}
