// factory0604 behavior 164 "mouse goto menuitem": an entry of a Buy list. Shows the part
// (#pname) in the preview with its price and size, names it in the purchase box, and
// goes to its page (#theFrame frames after marker #theItem). #pPop opens the purchase
// box there (gpopBuy).

import { Behavior, G, cursor, go, label, member, sendAllSprites, sendSprite } from '../../director';
import { EMPTY, lingoString, num, voidp, type LValue } from '../../lingo';
import { parts, propOf } from './util';

/** goMenuItem's common part (behaviors 134, 138, 164, 264): the price and size of the part. */
export function showPartInfo(pAct: LValue, pname: LValue): LValue {
  member('storlek txt').text = EMPTY;
  member('pris txt').text = '0';
  let k: LValue;
  if (pAct) {
    sendSprite(6, 'Show3DPart', pname);
    k = parts().getaProp(pname);
    const r = propOf(k, 'pris');
    const s = propOf(k, 'utrymme');
    if (r !== undefined) member('pris txt').text = lingoString(r);
    if (s !== undefined) member('storlek txt').text = 'Storlek: ' + lingoString(s);
  }
  return k;
}

export class MouseGotoMenuitem extends Behavior {
  sp = 0;
  last: LValue;
  first: LValue;
  theFrame: LValue = 1;
  theItem: LValue = 0;
  pAct: LValue = 1;
  pname: LValue;
  pPop: LValue = 0;

  beginSprite() {
    this.sp = this.spriteNum;
  }

  mouseEnter() {}

  mouseLeave() {
    cursor(0);
  }

  mouseUp() {
    member('buy message').text = EMPTY;
    sendSprite(6, 'InitRobot');
    this.goMenuItem();
  }

  goMenuItem() {
    const k = showPartInfo(this.pAct, this.pname);
    if (!voidp(k)) sendAllSprites('SetBuyWin', propOf(k, 'namn'));
    if (this.pPop) G.gpopBuy = 1;
    sendAllSprites('HidepurchaseBox');
    go(label(lingoString(this.theItem)) + num(this.theFrame));
  }
}
