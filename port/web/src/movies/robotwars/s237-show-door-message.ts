// robotwars behavior 237 "ShowDoorMessage": types a message onto the garage door a few
// characters at a time (with a typing sound), then blinks a "¦" cursor.

import { Behavior, sprite, the } from '../../director';
import { EMPTY, char, chars, lingoString, putBefore, putInto, random, sym, type LSymbol, type LValue } from '../../lingo';
import { playsound } from './s030-soundscript';
import { eq } from './util';

const CURSOR = '¦';

export class ShowDoorMessage extends Behavior {
  sp = 0;
  pState: LSymbol | undefined;
  charnum = 0;
  message: LValue;
  wait = 0;
  QuickShow: LValue;

  beginSprite() {
    this.sp = the.currentSpriteNum;
    sprite(this.sp).member.text = EMPTY;
    this.wait = 0;
    this.pState = sym('idle');
  }

  showDoorMessage(txt: LValue, fast?: LValue) {
    if (!eq(fast, 1)) {
      this.pState = sym('show');
      this.message = txt;
      sprite(this.sp).member.text = CURSOR;
    } else if (!eq(txt, this.message)) {
      this.message = txt;
      this.pState = sym('ShowFast');
    }
    this.charnum = 0;
    this.wait = 1;
  }

  prepareFrame() {
    const m = sprite(this.sp).member;
    if (this.pState === sym('show')) {
      const message = lingoString(this.message);
      this.charnum = this.charnum + 1;
      if (this.charnum > message.length) {
        this.pState = sym('Blink');
      } else {
        let p: number;
        if (this.charnum - 1 < 1) p = 1;
        else p = m.text.length;
        const x = random(3);
        // put message.char[p..charnum + x] before char p of the member
        m.text = putBefore(m.text, chars(message, p, this.charnum + x), ['char', p]);
        this.charnum = this.charnum + x;
        playsound('MsgType', 255);
        this.wait = 0;
      }
    } else if (this.pState === sym('ShowFast')) {
      m.text = this.message;
      this.pState = sym('nada');
    } else if (this.pState === sym('Blink')) {
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
