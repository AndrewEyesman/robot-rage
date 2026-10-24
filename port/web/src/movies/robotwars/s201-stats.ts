// robotwars behavior 201 "StatsBehavior": the robot's name, wins/losses/ties, points
// and ranking; #buildMess blinks a message instead for 5 seconds.

import { Behavior, G, dot, put, sprite, the } from '../../director';
import { EMPTY, RETURN, TAB, concatSpace, lingoString, sym, type LSymbol, type LValue } from '../../lingo';
import { getranking } from './s240-getranking';

export class StatsBehavior extends Behavior {
  sp = 0;
  state: LSymbol | undefined;
  startTime = 0;
  txt: LValue;
  counter = 0;

  beginSprite() {
    this.sp = this.spriteNum;
    sprite(this.sp).member.text = EMPTY;
    this.counter = 0;
    this.state = sym('stats');
  }

  showstatsNow() {
    this.state = sym('stats');
  }

  prepareFrame() {
    if (this.state === sym('stats')) {
      put('stats Ok');
      const robotname = lingoString(dot(G.gGameGlobals, 'robotname'));
      const points = lingoString(dot(G.gUserData, 'score'));
      const ranking = getranking(Number(dot(G.gUserData, 'score')));
      const gs = dot(G.gUserData, 'GameStats');
      const Matches = concatSpace(concatSpace(concatSpace(concatSpace(lingoString(dot(gs, 'Win')), '/'), lingoString(dot(gs, 'lose'))), '/'), lingoString(dot(gs, 'draw')));
      sprite(this.sp).member.text = 'Name: ' + robotname + RETURN + 'Won/Lost/Ties: ' + TAB + Matches + RETURN + 'Points: ' + TAB + points + RETURN + 'Ranking: ' + TAB + lingoString(ranking);
      this.state = sym('idle');
    } else if (this.state === sym('showText')) {
      if (the.milliSeconds < this.startTime + 4000) {
        switch (this.counter) {
          case 15:
          case 45:
            sprite(this.sp).member.text = EMPTY;
            break;
          case 30:
          case 60:
          case 75:
            sprite(this.sp).member.text = this.txt;
            break;
        }
        this.counter = this.counter + 1;
      } else {
        this.counter = 0;
        sprite(this.sp).member.text = EMPTY;
      }
      if (the.milliSeconds > this.startTime + 5000) this.state = sym('stats');
    }
  }

  buildMess(txt0: LValue) {
    this.txt = txt0;
    this.startTime = the.milliSeconds;
    sprite(this.sp).member.text = this.txt;
    this.state = sym('showText');
  }
}
