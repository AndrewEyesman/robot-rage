// factory0604 behavior 201 (sprite 313, frames 100-145): the purchase box (this sprite
// and the 19 after it), hidden until #ShowpurchaseBox; its text (the next sprite) names
// the part chosen in the Buy lists (#SetBuyWin).

import { Behavior, member, pass, sprite, the, type TextualMember } from '../../director';
import { lingoString, type LValue } from '../../lingo';
import { eq } from '../robotwars/util';
import { copyRtf, putIntoLine1 } from './util';

export class PurchaseBox201 extends Behavior {
  sp = 0;

  beginSprite() {
    this.sp = the.currentSpriteNum;
    this.SetVisib(0);
    copyRtf(sprite(this.sp + 1).member as TextualMember, member('superPackN1') as TextualMember);
  }

  endSprite() {
    this.SetVisib(1);
  }

  mouseUp() {
    return pass();
  }

  SetBuyWin(ttex: LValue) {
    const box = sprite(this.sp + 1).member as TextualMember;
    if (eq(ttex, 'Super Pack 1')) copyRtf(box, member('superPackN1') as TextualMember);
    else if (eq(ttex, 'Super Pack 2')) copyRtf(box, member('superPackN2') as TextualMember);
    else {
      copyRtf(box, member('originalSMSText') as TextualMember);
      putIntoLine1(box, lingoString(ttex));
    }
  }

  ShowpurchaseBox() {
    this.SetVisib(1);
  }

  HidepurchaseBox() {
    this.SetVisib(0);
  }

  SetVisib(bb: LValue) {
    for (let i = 1; i <= 20; i++) sprite(this.sp - 1 + i).visible = !!bb;
  }
}
