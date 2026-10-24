// robotwars behavior 28 "message box behavior": the balloon (#say text, delay,
// duration; #hideBalloon). Also resets the global spritelist.

import { Behavior, G, sprite, the } from '../../director';
import { LList, sym, voidp, type LSymbol, type LValue } from '../../lingo';

export class MessageBox extends Behavior {
  sp = 0;
  state: LSymbol | undefined;
  startTime = 0;
  endTime = 0;

  beginSprite() {
    this.sp = the.currentSpriteNum;
    this.state = sym('init');
    // wait = 0: a local.
    G.spritelist = new LList();
    for (let i = 1; i <= 300; i++) (G.spritelist as LList).add(0);
  }

  endSprite() {
    sprite(this.sp).visible = true;
  }

  say(s: LValue, d?: LValue, dur?: LValue) {
    if (voidp(dur)) dur = 60000;
    if (voidp(d)) d = 0;
    sprite(this.sp).visible = false;
    this.state = sym('showText');
    this.startTime = the.milliSeconds + Number(d);
    this.endTime = the.milliSeconds + Number(d) + Number(dur);
    sprite(this.sp).member.text = s;
  }

  hideBalloon() {
    sprite(this.sp).visible = false;
    this.state = sym('idle');
  }

  prepareFrame() {
    const st = this.state;
    if (st === sym('idle')) return;
    if (st === sym('init')) {
      sprite(this.sp).visible = false;
      this.state = sym('idle');
    } else if (st === sym('showText')) {
      if (the.milliSeconds >= this.startTime) {
        sprite(this.sp).visible = true;
        this.state = sym('hideText');
      }
    } else if (st === sym('hideText')) {
      if (the.milliSeconds >= this.endTime) {
        sprite(this.sp).visible = false;
        this.state = sym('idle');
      }
    }
  }
}
