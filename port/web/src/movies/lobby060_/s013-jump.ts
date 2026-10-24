// lobby060_ behavior 13 "Jump" (the WORKSHOP, BACKYARD, GARAGE and QUIT buttons):
// goes to a marker on mouseUp (or exitFrame), with a pointing cursor.

import { Behavior, cursor, go, rollover, sendAllSprites, the } from '../../director';
import { LPropList, LList, EMPTY, sym, type LValue } from '../../lingo';

export class Jump extends Behavior {
  newFrame: LValue;
  sp = 0;
  onEvent: LValue;
  pActive: LValue;

  beginSprite() {
    this.sp = the.currentSpriteNum;
    if (this.onEvent === sym('mouseUp')) {
      if (rollover(this.sp)) cursor(280);
    }
    this.pActive = 1;
  }

  Activate(q: LValue) {
    this.pActive = q;
  }

  getPropertyDescriptionList() {
    this.sp = the.currentSpriteNum;
    const description = new LPropList();
    description.addProp(sym('onEvent'), new LPropList([[sym('default'), sym('mouseUp')], [sym('format'), sym('symbol')], [sym('comment'), 'on:'], [sym('range'), new LList([sym('mouseUp'), sym('exitFrame')])]]));
    description.addProp(sym('newFrame'), new LPropList([[sym('default'), EMPTY], [sym('format'), sym('marker')], [sym('comment'), 'Go to marker:']]));
    return description;
  }

  exitFrame() {
    if (this.onEvent === sym('exitFrame')) {
      go(this.newFrame as string);
      sendAllSprites('refresh');
    }
  }

  mouseUp() {
    if (!this.pActive) return;
    if (this.sp !== the.clickOn) return;
    if (this.onEvent === sym('mouseUp')) {
      go(this.newFrame as string);
      sendAllSprites('refresh');
    }
  }

  mouseEnter() {
    if (!this.pActive) return;
    if (this.onEvent === sym('mouseUp')) cursor(280);
  }

  mouseLeave() {
    if (!this.pActive) return;
    if (this.onEvent === sym('mouseUp')) cursor(-1);
  }

  endSprite() {
    if (!this.pActive) return;
    if (this.onEvent === sym('mouseUp')) cursor(-1);
  }
}
