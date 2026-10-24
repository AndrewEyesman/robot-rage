// login013_ behavior 12 (the new robot's name): letters, digits, space and _ only,
// at most 20 characters (and short enough as an IRC nick).

import { Behavior, beep, callGlobal, dontPassEvent, pass, sprite, the } from '../../director';
import { EMPTY, QUOTE, RETURN, TAB, offset, sym, type LSymbol } from '../../lingo';

export class RobotNameField extends Behavior {
  sp = 0;
  state: LSymbol | undefined;

  beginSprite() {
    this.sp = the.currentSpriteNum;
    sprite(this.sp).member.text = EMPTY;
    this.state = sym('init');
  }

  keyDown() {
    const myCharacters = 'abcdefghijklmnopqrstuvwxyz_ 0123456789';
    const m = sprite(this.sp).member;
    if (m.text.length > 20) m.text = m.text.slice(0, 20);
    switch (the.key) {
      case RETURN:
      case TAB:
        if (m.text !== EMPTY) the.keyboardFocusSprite = this.sp + 4;
        break;
      case '_':
      case QUOTE:
        break;
      default:
        if (offset(the.key, myCharacters) > 0 || the.keyCode === 51) pass();
        else {
          beep();
          dontPassEvent();
        }
    }
  }

  prepareFrame() {
    const m = sprite(this.sp).member;
    const n = String(callGlobal('formatInternalUserName', m.text, '0123') ?? '').length;
    if (n > 29) m.text = m.text.slice(0, m.text.length - 1);
    if (this.state === sym('init')) {
      if (m.text !== EMPTY) the.keyboardFocusSprite = this.sp + 4;
      this.state = sym('idle');
    }
  }
}
