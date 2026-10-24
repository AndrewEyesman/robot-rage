// robotwars behavior 43 "jumpmovie framescript": preloads a movie (#name, by its
// version.txt name) and jumps to it, at #labelName if given.

import { Behavior, G, cursor, getStreamStatus, go, member, netDone, preloadNetThing, sprite, the } from '../../director';
import { EMPTY, LPropList, concatSpace, integer, lingoString, propList, sym, symbol, type LSymbol, type LValue } from '../../lingo';
import { JumpMovie } from './s007-jump-movie';
import { setMessage } from './s019-net-lingo';
import { eq } from './util';

export class JumpMovieFramescript extends Behavior {
  name: LValue;
  state: LSymbol | undefined;
  sp = 0;
  movieID: number | undefined;
  pstartTime = 0;
  pActive: LValue;
  labelName: LValue;

  beginSprite() {
    this.sp = the.currentSpriteNum;
    sprite(this.sp - 1).blend = 60;
    this.pActive = 1;
    // the runMode is "Plugin", not "author".
    this.state = sym('initload');
    // the debugPlaybackEnabled only matters to Director's debugger.
  }

  exitFrame() {
    go(the.frame);
    const st = this.state;
    if (st === sym('initload')) {
      const q = (G.gVersionList as LPropList).getProp(symbol(lingoString(this.name)));
      this.movieID = preloadNetThing(the.moviePath + lingoString((q as LPropList).getaProp(sym('fname'))));
      this.pstartTime = the.milliSeconds;
      this.state = sym('download');
    } else if (st === sym('download') || st === sym('progressBar')) {
      if (st === sym('download') && the.milliSeconds > this.pstartTime + 2000) this.state = sym('progressBar');
      const r = this.CheckStatus(0, 100, 0);
      if (r === sym('done')) this.state = sym('done');
      else if (r === sym('error')) setMessage(concatSpace('Could not load', this.name));
    } else if (st === sym('done')) {
      cursor(4);
      if (eq(this.labelName, EMPTY)) JumpMovie(lingoString(this.name));
      else JumpMovie(lingoString(this.name), this.labelName);
      this.state = sym('jumping');
    }
  }

  getPropertyDescriptionList() {
    return propList(
      sym('name'), propList(sym('default'), EMPTY, sym('format'), sym('string'), sym('comment'), 'Start movie: '),
      sym('labelName'), propList(sym('default'), EMPTY, sym('format'), sym('string'), sym('comment'), 'Marker: '),
    );
  }

  /** Called without `me` in the original (a local call), so p1/P2/pbar are 0, 100, 0. */
  CheckStatus(p1: number, P2: number, pbar: number): LSymbol | undefined {
    if (netDone(this.movieID)) {
      if (pbar) member('loading info').text = EMPTY;
      return sym('done');
    }
    const pStatList = getStreamStatus(this.movieID);
    if (pStatList.getaProp(sym('state')) !== 'Complete') {
      const so = Number(pStatList.getaProp(sym('bytesSoFar')));
      if (so > 0) {
        const percentDone = p1 + ((P2 - p1) * so * 1.0) / Number(pStatList.getaProp(sym('bytesTotal')));
        if (pbar) member('loading info').text = concatSpace(concatSpace('Laddar:', integer(percentDone)), '%');
      }
      const err = pStatList.getaProp(sym('error'));
      if (!eq(err, EMPTY) && !eq(err, 'OK')) {
        setMessage('Could not download file.\r' + lingoString(err));
        return sym('error');
      }
      return sym('loading');
    }
    return undefined;
  }
}
