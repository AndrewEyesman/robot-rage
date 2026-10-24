// loader002 behavior 6 "load ini" (frame 1's script): reads main.ini from the
// server into gShockplay, then moves on to loading the files.

import { Behavior, G, getNetText, go, member, netDone, netError, netTextResult, put, the } from '../../director';
import { EMPTY, sym, type LSymbol } from '../../lingo';
import { parseIniFile } from './s004-ini';

export class LoadIni extends Behavior {
  pState: LSymbol | undefined;
  netId: number | undefined;
  pstartTime = 0;

  beginSprite() {
    this.pState = sym('init');
    member('error').text = EMPTY;
    // clearCache(): nothing cached here.
    G.gUrl = the.moviePath;
  }

  prepareFrame() {
    switch (this.pState) {
      case sym('init'):
        this.netId = getNetText(`${G.gUrl}main.ini?tick=${the.milliSeconds}`);
        put(`${G.gUrl}main.ini?tick=${the.milliSeconds}`);
        this.pstartTime = the.milliSeconds;
        this.pState = sym('waitNet');
        break;
      case sym('waitNet'):
        if (netDone(this.netId)) {
          const err = netError(this.netId);
          // netTextresult() with no id: the most recent operation, which is this one.
          const txt = netTextResult();
          if (err === 'OK') {
            G.gShockplay = parseIniFile(txt);
            // the debugPlaybackEnabled only matters to Director's own debugger.
            this.pState = sym('done');
          } else {
            this.pState = sym('error');
          }
        }
        if (the.milliSeconds > this.pstartTime + 30000) this.pState = sym('error');
        break;
    }
  }

  exitFrame() {
    switch (this.pState) {
      case sym('error'):
        member('error').text = 'Ingen kontakt med servern!';
        go(the.frame);
        break;
      case sym('done'):
        go(the.frame + 1);
        break;
      default:
        go(the.frame);
    }
  }
}
