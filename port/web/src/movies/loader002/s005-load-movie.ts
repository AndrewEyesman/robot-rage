// loader002 behavior 5 "load movie" (frame 2's script): fetches each file of
// [filelist] in turn, showing the progress, then jumps to the login movie.

import { Behavior, G, dot, getStreamStatus, member, preloadNetThing, put, sendAllSprites, the, go } from '../../director';
import { EMPTY, LPropList, concatSpace, float, integer, lingoEquals, lingoString, num } from '../../lingo';
import { JumpMovie } from './s004-ini';

export class LoadMovie extends Behavior {
  tID = 0;
  netId: number | undefined;
  ur: unknown;
  ndone: unknown;

  beginSprite() {
    member('error').text = EMPTY;
    this.getNext();
  }

  getNext() {
    this.tID = this.tID + 1;
    const grl = `${the.moviePath}${dot(G.gShockplay, 'info', 'folder')}/`;
    put(`dcrpath:${grl}`);
    const fileList = dot(G.gShockplay, 'fileList') as LPropList;
    if (this.tID > fileList.count) {
      this.ndone = 1;
    } else {
      put(`dcrpath:${grl}${fileList.getAt(this.tID)}`);
      this.netId = preloadNetThing(grl + String(fileList.getAt(this.tID)));
    }
  }

  prepareFrame() {
    const tmp = getStreamStatus(this.netId);
    if (lingoEquals(tmp.prop('state'), 'error')) {
      member('error').text = concatSpace('Ett fel inträffade:', tmp.prop('error'));
      return;
    }
    const a = num(tmp.prop('bytesSoFar'));
    const b = num(tmp.prop('bytesTotal'));
    const fileList = dot(G.gShockplay, 'fileList') as LPropList;
    if (a > 0 && b > 0) {
      const m = num(float(this.tID - 1)) / fileList.count;
      let lotex = EMPTY;
      switch (lingoString(fileList.getPropAt(this.tID)).toLowerCase()) {
        case 'arena':
          lotex = 'Arena';
          break;
        case 'factory':
          lotex = 'Factory';
          break;
        case 'store':
          lotex = 'Workshop';
          break;
        case 'lobby':
          lotex = 'Lobby';
          break;
        case 'login':
          lotex = 'Login';
          break;
        case 'robotwars':
          lotex = 'RobotRage graphics & sounds';
          break;
        case 'texter':
          lotex = 'Language module';
          break;
      }
      member('loadInfo').text = ['Loading', lotex, lingoString(integer((a / b) * 100))].join(' ') + ' %';
      sendAllSprites('updateLoader', m + a / b / fileList.count);
    }
    if (lingoEquals(tmp.prop('state'), 'complete')) this.getNext();
  }

  exitFrame() {
    if (this.ndone) JumpMovie('login');
    go(the.frame);
  }
}
