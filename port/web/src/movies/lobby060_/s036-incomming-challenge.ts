// lobby060_ behavior 36 "IncommingChallenge" (sprite 38): shows the first challenge
// in ChallengeList with a 15-second countdown (declining it when time is up), and the
// challenge alarm and graphics while there is one.

import { Behavior, G, cursor, dot, member, pass, rollover, sendAllSprites, sendSprite, sprite, the } from '../../director';
import { EMPTY, LList, itemDelimiter, setItemDelimiter, sym, voidp, lingoString, type LSymbol, type LValue } from '../../lingo';
import { FormatUserName } from '../robotwars/s004-new-init';
import { DeclineChallenge, ReplaceWord } from './s004-lobby-moviescript';
import { eq, setWordsBold } from './util';

export class IncommingChallenge extends Behavior {
  sp = 0;
  state: LSymbol | undefined;

  beginSprite() {
    this.sp = this.spriteNum;
    this.state = sym('idle');
    if (rollover(this.sp)) this.SetPointingCursor(1);
  }

  prepareFrame() {
    this.updateChallengeList();
  }

  mouseUp() {
    const cl = G.ChallengeList as LList;
    if (cl.count > 0) sendSprite(0, 'getRobot', dot(cl.getAt(1), 'robotid'), 1);
  }

  showChallenge(intext: LValue) {
    const m = sprite(this.sp).member;
    m.text = lingoString(intext);
    const it = itemDelimiter();
    setItemDelimiter(' ');
    setWordsBold(m, 1, 3, false);
    setWordsBold(m, 4, 4, true);
    setWordsBold(m, 5, 55, false);
    sendAllSprites('showChallengeGFX');
    setItemDelimiter(it);
  }

  updateChallengeList() {
    const cl = G.ChallengeList as LList;
    if (cl.count > 0) {
      const first = cl.getAt(1);
      const olddelim = itemDelimiter();
      setItemDelimiter(':');
      if (Math.trunc((the.milliSeconds - Number(dot(first, 'start'))) / 1000) >= 15) {
        DeclineChallenge();
        return;
      }
      let s = member('Challenge_text').text;
      const namestring = FormatUserName(lingoString(dot(first, 'ircrobotname')));
      let sx: string;
      const rank = dot(first, 'rank');
      if (voidp(rank)) sx = EMPTY;
      else if (eq(rank, dot(G.gUserData, 'rank'))) sx = 'You are in the same ranking class. You will fight for points and credits.';
      else sx = 'You are NOT in the same ranking class. You will only fight for glory.';
      const opname = namestring;
      s = ReplaceWord(s, '<username>', opname);
      s = ReplaceWord(s, '<time>', 15 - Math.trunc((the.milliSeconds - Number(dot(first, 'start'))) / 1000));
      s = ReplaceWord(s, '<rank>', sx);
      sendAllSprites('showChallenge', s);
      sendAllSprites('SetChallengeAlarm', 1);
      setItemDelimiter(olddelim);
    } else if (sprite(this.sp).member.text !== EMPTY) {
      sendAllSprites('SetChallengeAlarm', 0);
      sendAllSprites('showChallenge', EMPTY);
      sendAllSprites('HideChallengeGFX');
    }
  }

  Accepchallenge() {
    const cl = G.ChallengeList as LList;
    if (cl.count > 0) {
      cl.deleteAt(1);
      while (cl.count > 0) DeclineChallenge();
    }
  }

  mouseEnter() {
    if ((G.ChallengeList as LList).count > 0) this.SetPointingCursor(1);
  }

  SetPointingCursor(q: LValue) {
    if (q) {
      if (this.state === sym('idle')) {
        this.state = sym('pointing');
        cursor(280);
      }
    } else if (this.state === sym('pointing')) {
      this.state = sym('idle');
      cursor(0);
    }
  }

  mouseLeave() {
    this.SetPointingCursor(0);
    return pass();
  }

  inactivate() {
    this.state = sym('inactive');
  }
}
