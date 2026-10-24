// login013_ behavior 10 (the email field): at most 100 characters; RETURN or TAB
// moves on to the password field (5 channels on).

import { Behavior, pass, sprite, the } from '../../director';
import { EMPTY, QUOTE, RETURN, TAB, sym, type LSymbol } from '../../lingo';

export class EmailField extends Behavior {
  sp = 0;
  state: LSymbol | undefined;

  beginSprite() {
    this.sp = the.currentSpriteNum;
    this.state = sym('init');
  }

  private clip() {
    const m = sprite(this.sp).member;
    if (m.text.length > 100) m.text = m.text.slice(0, 100);
  }

  keyDown() {
    this.clip();
    switch (the.key) {
      case RETURN:
      case TAB:
        if (sprite(this.sp).member.text !== EMPTY) the.keyboardFocusSprite = this.sp + 5;
        break;
      case '_':
      case QUOTE:
        break;
      default:
        pass();
    }
  }

  prepareFrame() {
    this.clip();
    if (this.state === sym('init')) {
      if (sprite(this.sp).member.text !== EMPTY) the.keyboardFocusSprite = this.sp + 5;
      this.state = sym('idle');
    }
  }
}
