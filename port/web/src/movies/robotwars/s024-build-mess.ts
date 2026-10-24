// robotwars behavior 24 "Build Mess Behavior": a message in this sprite's text and the
// one below it (a shadow) for 4 seconds, steady or blinking (#flash, #flash2).

import { Behavior, sprite, the } from '../../director';
import { EMPTY, sym, type LSymbol, type LValue } from '../../lingo';

export class BuildMess extends Behavior {
  sp = 0;
  state: LSymbol | undefined;
  startTime = 0;
  txt: LValue;
  counter = 0;
  pMode: LValue;

  beginSprite() {
    this.sp = this.spriteNum;
    this.state = sym('idle');
    sprite(this.sp).member.text = EMPTY;
    this.counter = 1000;
  }

  private show(t: LValue) {
    sprite(this.sp).member.text = t;
    sprite(this.sp - 1).member.text = t;
  }

  prepareFrame() {
    if (this.state === sym('showText')) {
      if (the.milliSeconds < this.startTime + 4000) {
        switch (this.counter) {
          case 3:
          case 13:
          case 23:
            this.show(this.txt);
            break;
          case 10:
          case 20:
            this.show(EMPTY);
            break;
        }
        this.counter = this.counter + 1;
      } else {
        this.counter = 0;
        this.show(EMPTY);
        this.state = sym('idle');
      }
    }
  }

  buildMess(txt0: LValue, tMode?: LValue) {
    this.txt = txt0;
    this.startTime = the.milliSeconds;
    this.pMode = tMode;
    if (this.pMode === sym('flash')) {
      this.show(EMPTY);
      this.counter = 11;
    } else if (this.pMode === sym('flash2')) {
      this.show(EMPTY);
      this.counter = 0;
    } else {
      this.counter = 1000;
      this.show(this.txt);
    }
    this.state = sym('showText');
  }
}
