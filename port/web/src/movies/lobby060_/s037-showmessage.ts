// lobby060_ behavior 37 "Showmessage" (sprite 20, the message panel): types a
// message a few characters at a time with a typing sound, then blinks a "¦" cursor.

import { Behavior, sprite } from '../../director';
import { char, chars, lingoString, putBefore, putInto, random, sym, type LSymbol, type LValue } from '../../lingo';
import { playsound } from '../robotwars/s030-soundscript';
import { eq } from './util';

const CURSOR = '¦';

export class Showmessage extends Behavior {
  sp = 0;
  state: LSymbol | undefined;
  charnum = 0;
  message: LValue;
  wait = 0;

  beginSprite() {
    this.sp = this.spriteNum;
    this.wait = 0;
    this.state = sym('idle');
    sprite(this.sp).member.text = ' ';
  }

  showmessage(txt: LValue, fast?: LValue) {
    if (!eq(fast, 1)) {
      this.state = sym('show');
      this.message = txt;
      sprite(this.sp).member.text = CURSOR;
    } else {
      // #ShowFast has no branch in prepareFrame; the old message stays with a cursor.
      this.state = sym('ShowFast');
      sprite(this.sp).member.text = lingoString(this.message) + ' ' + CURSOR;
    }
    this.charnum = 0;
    this.wait = 1;
  }

  prepareFrame() {
    const m = sprite(this.sp).member;
    if (this.state === sym('show')) {
      const message = lingoString(this.message);
      this.charnum = this.charnum + 1;
      if (this.charnum > message.length) {
        this.state = sym('Blink');
      } else {
        let p: number;
        if (this.charnum - 1 < 1) p = 1;
        else p = m.text.length;
        playsound('MsgType', 255);
        const x = random(2);
        // put message.char[p..charnum + x] before char p of the member
        m.text = putBefore(m.text, chars(message, p, this.charnum + x), ['char', p]);
        this.charnum = this.charnum + x;
        this.wait = 0;
      }
    } else if (this.state === sym('Blink')) {
      if (this.wait > 0) {
        this.wait = this.wait - 1;
        return;
      }
      const t: string = m.text;
      if (char(t, t.length) === CURSOR) m.text = putInto(t, ' ', ['char', t.length]);
      else m.text = putInto(t, CURSOR, ['char', t.length]);
      this.wait = 30;
    }
  }
}
