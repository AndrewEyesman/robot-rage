// lobby060_ behavior 40 "ShowGames" (an older games list; not in the score): lists the
// running games (server - client) and lets one be picked for watching.

import { Behavior, G, cursor, dot, pass, rollover, sendSprite, sprite, the } from '../../director';
import { EMPTY, LList, RETURN, item, line, lineCount, lingoString, setItemDelimiter, sym, type LSymbol, type LValue } from '../../lingo';
import { eq, pointToLine } from './util';

export class ShowGames extends Behavior {
  sp = 0;
  pState: LSymbol | undefined;
  lastselected: LValue;
  pDown: LValue;

  mouseUp() {
    if (eq(this.pDown, 1)) {
      let lineNum = pointToLine(this.spriteNum, the.mouseLoc);
      const text = sprite(this.spriteNum).member.text;
      if (lineNum >= 0 && lineCount(sprite(this.sp).member.text) > 1) {
        if (lineNum === lineCount(text)) lineNum = lineNum - 1;
        this.lastselected = line(text, lineNum);
        sendSprite(this.spriteNum + 1, 'select', lineNum);
        sendSprite(0, 'getGame', lineNum);
      }
    }
    this.pDown = 0;
  }

  mouseDown() {
    this.pDown = 1;
  }

  beginSprite() {
    this.sp = the.currentSpriteNum;
    sprite(this.spriteNum).member.text = EMPTY;
    this.pState = sym('idle');
    if (rollover(this.sp)) this.SetPointingCursor(1);
    sprite(this.spriteNum).member.fixedLineSpace = 11;
  }

  mouseWithin() {
    if (pointToLine(this.spriteNum, the.mouseLoc) < lineCount(sprite(this.spriteNum).member.text)) this.SetPointingCursor(1);
    else this.SetPointingCursor(0);
  }

  SetPointingCursor(q: LValue) {
    if (q) {
      if (this.pState === sym('idle')) {
        this.pState = sym('pointing');
        cursor(280);
      }
    } else if (this.pState === sym('pointing')) {
      this.pState = sym('idle');
      cursor(0);
    }
  }

  mouseLeave() {
    this.SetPointingCursor(0);
    return pass();
  }

  inactivate() {
    this.pState = sym('inactive');
  }

  showgamesList(GamesList: LList) {
    const m = sprite(this.sp).member;
    m.text = EMPTY;
    let i = GamesList.count;
    setItemDelimiter(':');
    const gl = G.gGamesList as LList;
    while (i >= 1) {
      const g = gl.getAt(i);
      if (dot(g, 'gd') !== undefined) {
        const serverip = lingoString(dot(g, 'gd', 'serverip'));
        const entry = lingoString(dot(GamesList.getAt(i), 'gd', 'servername')) + ' - ' + lingoString(dot(GamesList.getAt(i), 'gd', 'clientname')) + RETURN;
        if (eq(item(serverip, 5), 0)) m.text = entry + m.text;
        else if (eq(item(serverip, 5), 1) && eq(item(serverip, 6), dot(G.gGameGlobals, 'FWuserip'))) m.text = entry + m.text;
        else GamesList.deleteAt(i);
      }
      i = i - 1;
    }
    m.scrollTop = 0;
    this.fixMarker();
  }

  getUserLine(user: LValue) {
    let i = 0;
    let ret: number | undefined;
    const text = sprite(this.spriteNum).member.text;
    while (i < lineCount(text)) {
      // line[0] on the first pass, as in the original.
      if (eq(user, i >= 1 ? line(text, i) : EMPTY)) {
        ret = i;
        sendSprite(this.spriteNum + 1, 'select', i);
        break;
      }
      i = i + 1;
    }
    return ret;
  }

  fixMarker() {
    const i = this.getUserLine(this.lastselected);
    if (i !== undefined) sendSprite(this.spriteNum + 1, 'select', i);
    else sendSprite(this.spriteNum + 1, 'select', 500);
  }
}
