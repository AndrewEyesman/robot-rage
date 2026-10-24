// factory0604 behavior 134 (unused in the score): shows part #p1 with its price and
// size as it begins, and goes to the 7th page after marker "ammo".

import { Behavior, go, label, sendAllSprites } from '../../director';
import { lingoString, num, sym, voidp, type LValue } from '../../lingo';
import { propOf } from './util';
import { showPartInfo } from './s164-mouse-goto-menuitem';

export class GotoAmmo extends Behavior {
  sp = 0;
  theItem: LValue;
  theFrame: LValue;

  beginSprite() {
    this.theItem = 'ammo';
    this.theFrame = 7;
    const pname = sym('p1');
    const pAct = 1;
    const k = showPartInfo(pAct, pname);
    if (!voidp(k)) sendAllSprites('SetBuyWin', propOf(k, 'namn'));
  }

  exitFrame() {
    sendAllSprites('HidepurchaseBox');
    go(label(lingoString(this.theItem)) + num(this.theFrame));
  }
}
