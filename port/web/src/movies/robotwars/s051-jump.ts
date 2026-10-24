// robotwars behavior 51 "Jump": go to a marker on mouseUp (pointing cursor) or exitFrame.

import { Behavior, cursor, go, rollover, sendAllSprites, the } from '../../director';
import { LList, propList, sym, type LSymbol, type LValue } from '../../lingo';

export class Jump extends Behavior {
  newFrame: LValue;
  sp = 0;
  onEvent: LSymbol | undefined;
  pActive: LValue;

  beginSprite() {
    this.sp = the.currentSpriteNum;
    if (this.onEvent === sym('mouseUp')) if (rollover(this.sp)) cursor(280);
    this.pActive = 1;
  }

  Activate(q: LValue) {
    this.pActive = q;
  }

  getPropertyDescriptionList() {
    return propList(
      sym('onEvent'), propList(sym('default'), sym('mouseUp'), sym('format'), sym('symbol'), sym('comment'), 'on:', sym('range'), new LList([sym('mouseUp'), sym('exitFrame')])),
      sym('newFrame'), propList(sym('default'), '', sym('format'), sym('marker'), sym('comment'), 'Go to marker:'),
    );
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
