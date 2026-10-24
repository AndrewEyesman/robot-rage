// factory0604 behavior 23 "DoorMessage...fromArena" (unused in the score; robotwars'
// ShowDoorMessage does this job): types a message onto the door a few characters at a
// time, then blinks a "¦" cursor and opens the doors after 3.5 s.

import { Behavior, sendAllSprites, sprite, the } from '../../director';
import { EMPTY, char, chars, lingoString, putBefore, putInto, random, sym, type LSymbol, type LValue } from '../../lingo';
import { playsound } from '../robotwars/s030-soundscript';

export class DoorMessageFromArena extends Behavior {
  sp = 0;
  state: LSymbol | undefined;
  charnum = 0;
  message = '';
  wait = 0;
  QuickShow: LValue;
  tecken = 0;
  startTime = 0;

  beginSprite() {
    this.tecken = 0;
    this.sp = this.spriteNum;
    this.wait = 0;
    sprite(this.sp).member.text = EMPTY;
    this.state = sym('idle');
  }

  showDoorMessage(txt: LValue, fast?: LValue) {
    if (fast) {
      if (lingoString(txt) !== this.message) {
        this.message = lingoString(txt);
        this.state = sym('ShowFast');
      }
    } else {
      this.message = lingoString(txt);
      sprite(this.sp).member.text = '¦';
      this.state = sym('show');
    }
    this.charnum = 0;
    this.wait = 1;
  }

  prepareFrame() {
    const m = sprite(this.sp).member;
    if (this.state === sym('show')) {
      this.charnum = this.charnum + 1;
      if (this.charnum > this.message.length) {
        this.tecken = this.tecken + 1;
        this.startTime = the.milliSeconds;
        this.state = sym('Blink');
      } else {
        const p = this.charnum - 1 < 1 ? 1 : m.text.length;
        const x = random(3);
        m.text = putBefore(m.text, chars(this.message, p, this.charnum + x), ['char', p]);
        this.charnum = this.charnum + x;
        playsound('MsgType', 255);
        this.wait = 0;
      }
    } else if (this.state === sym('ShowFast')) {
      m.text = this.message;
      this.state = sym('nada');
    } else if (this.state === sym('Blink')) {
      if (this.wait > 0) {
        this.wait = this.wait - 1;
        return;
      }
      if (this.tecken >= 1) {
        if (the.milliSeconds >= this.startTime + 3500 || this.message.length === 0) {
          sendAllSprites('doorAction', sym('open'));
          this.startTime = the.milliSeconds;
        }
      }
      const t = m.text as string;
      if (char(t, t.length) === '¦') m.text = putInto(t, ' ', ['char', t.length]);
      else m.text = putInto(t, '¦', ['char', t.length]);
      this.wait = 30;
    }
  }
}
