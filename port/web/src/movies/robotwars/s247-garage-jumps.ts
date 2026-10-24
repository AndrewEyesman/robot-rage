// robotwars behaviors 247-251 and 256: the garage's exits (workshop, backyard, garage
// list, lobby, quit) and a hold frame, each checking the doktor copy first.

import { Behavior, go, put, sendSprite, the } from '../../director';
import { JumpMovie } from './s007-jump-movie';

/** 247 "jump to workshop" */
export class JumpToWorkshop extends Behavior {
  pTime = 0;
  beginSprite() {
    this.pTime = the.milliSeconds;
    sendSprite(1, 'usedoktor');
  }
  exitFrame() {
    JumpMovie('factory', 'start');
  }
}

/** 248 "jump to backyard" */
export class JumpToBackyard extends Behavior {
  beginSprite() {
    sendSprite(1, 'usedoktor');
  }
  exitFrame() {
    JumpMovie('arena', 'backyard');
  }
}

/** 249 "jump to garage" */
export class JumpToGarage extends Behavior {
  beginSprite() {
    sendSprite(1, 'usedoktor');
  }
  exitFrame() {
    JumpMovie('login', 'listrobots');
  }
}

/** 250 "jump to lobby" */
export class JumpToLobby extends Behavior {
  beginSprite() {
    sendSprite(1, 'usedoktor');
  }
  exitFrame() {
    JumpMovie('lobby');
  }
}

/** 251 "hold" */
export class Hold extends Behavior {
  beginSprite() {
    sendSprite(1, 'usedoktor');
  }
  exitFrame() {
    go(the.frame);
  }
}

/** 256 "jump to quit" */
export class JumpToQuit extends Behavior {
  exitFrame() {
    JumpMovie('login', 'logout');
    put('jump to logout');
  }
}
