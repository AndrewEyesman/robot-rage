// login013_ behavior "passwordbehavior": the password field shows stars while the
// typed password collects in a hidden member (parameter visiblePassword).

import { Behavior, member, pass, sprite, the } from '../../director';
import { BACKSPACE, EMPTY, QUOTE, RETURN, TAB, line, type LValue } from '../../lingo';

export class Passwordbehavior extends Behavior {
  sp = 0;
  visiblePassword: LValue;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  srcMember: any;
  changed = 0;

  private get hidden() {
    return member(this.visiblePassword as string);
  }

  beginSprite() {
    this.sp = the.currentSpriteNum;
    this.srcMember = sprite(this.sp).member;
    this.srcMember.text = EMPTY;
    this.hidden.text = EMPTY;
    for (let i = 1; i <= this.hidden.text.length; i++) this.srcMember.text = this.srcMember.text + '*';
    this.changed = 0;
  }

  prepareFrame() {
    // Text that got in another way (pasted, or typed before this behavior saw it)
    // moves to the hidden member and is replaced by stars.
    const t = this.srcMember.text as string;
    if (t.length >= 2 && t[1] !== '*') {
      if (t.length > 8) this.srcMember.text = t.slice(1, 9);
      this.hidden.text = line(this.srcMember.text, 1);
      let s = EMPTY;
      for (let i = 1; i <= this.hidden.text.length; i++) s = s + '*';
      this.srcMember.text = s;
    }
  }

  keyDown() {
    const p = this.srcMember.selection;
    const p1 = p.getAt(1) as number;
    const p2 = p.getAt(2) as number;
    if (p2 > p1) {
      this.srcMember.text = this.srcMember.text.slice(0, p1) + this.srcMember.text.slice(p2);
      this.hidden.text = this.hidden.text.slice(0, p1) + this.hidden.text.slice(p2);
    }
    const key = the.key;
    const code = the.keyCode;
    if (key === RETURN) return;
    if (key === TAB) return pass();
    if (key === BACKSPACE) {
      if (p2 === p1 && p1 > 0) {
        this.srcMember.text = this.srcMember.text.slice(0, p1 - 1) + this.srcMember.text.slice(p1);
        this.hidden.text = this.hidden.text.slice(0, p1 - 1) + this.hidden.text.slice(p1);
        this.changed = 1;
      }
      return;
    }
    if ([123, 124, 125, 126, 115, 116, 117, 119, 121].includes(code)) return pass();
    if (key === QUOTE) return;
    if (member('visiblePassword').text.length < 20) {
      this.hidden.text = this.hidden.text + key;
      this.changed = 1;
      this.srcMember.text = this.srcMember.text + '*';
      the.selStart = member('visiblePassword').text.length;
    }
  }
}
