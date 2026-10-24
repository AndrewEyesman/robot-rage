// robotwars behavior 26: the garage's first frame: forgets another robot's data, shows
// version.txt's newsflash on the door, then moves on.

import { Behavior, G, dot, go, sendAllSprites, the } from '../../director';
import { EMPTY, char, lingoString, numToChar, putInto, sym, type LSymbol } from '../../lingo';
import { PCtoMac } from './s003-mac-pc';
import { eq } from './util';

export class GarageStart extends Behavior {
  state: LSymbol | undefined;
  pTime = 0;

  beginSprite() {
    // the preferred3dRenderer = gRender: the port has one renderer.
    G.gGamePlace = sym('factory');
    this.state = sym('init');
  }

  exitFrame() {
    go(the.frame);
    const st = this.state;
    if (st === sym('init')) {
      if (!eq(G.gUserData, undefined) && !eq(G.gUserData, EMPTY)) {
        if (!eq(dot(G.gUserData, 'robotname'), dot(G.gGameGlobals, 'robotname'))) G.gUserData = undefined;
      }
      if (dot(G.gVersionList, 'newsflash') !== undefined) {
        let s = lingoString(dot(G.gVersionList, 'newsflash', 'version'));
        if (the.machineType !== 256) s = PCtoMac(s);
        s = this.replacechar(s, '#', numToChar(13));
        sendAllSprites('showDoorMessage', s);
        this.pTime = the.milliSeconds;
        this.state = sym('newsflash');
      }
    } else if (st === sym('newsflash')) {
      if (the.milliSeconds > this.pTime + 1000) this.state = sym('done');
    } else if (st === sym('done')) {
      go(the.frame + 1);
    } else if (st === sym('build')) {
      go('close');
    }
  }

  replacechar(s: string, ch1: string, ch2: string) {
    for (let i = 1; i <= s.length; i++) if (eq(char(s, i), ch1)) s = putInto(s, ch2, ['char', i]);
    return s;
  }
}
