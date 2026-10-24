// factory0604 behavior 138 (unused in the score): behavior 164 that goes to its page as
// soon as it begins; for the "3 Hjul" (three wheels) part it also places a third wheel
// in 3D member 280.

import { Behavior, cursor, go, label, member, sendAllSprites, sendSprite } from '../../director';
import { member3d, vector } from '../../director/s3d';
import { EMPTY, lingoString, num, voidp, type LValue } from '../../lingo';
import { eq } from '../robotwars/util';
import { propOf } from './util';
import { showPartInfo } from './s164-mouse-goto-menuitem';

export class GotoMenuitemNow extends Behavior {
  sp = 0;
  last: LValue;
  first: LValue;
  theFrame: LValue = 1;
  theItem: LValue = 0;
  pAct: LValue = 1;
  pname: LValue;

  beginSprite() {
    this.sp = this.spriteNum;
    this.goMenuItem();
  }

  mouseEnter() {
    cursor(280);
  }

  mouseLeave() {
    cursor(-1);
  }

  mouseDown() {
    sendSprite(6, 'InitRobot');
  }

  mouseUp() {
    member('buy message').text = EMPTY;
    this.goMenuItem();
  }

  goMenuItem() {
    const k = showPartInfo(this.pAct, this.pname);
    if (!voidp(k)) {
      sendAllSprites('SetBuyWin', propOf(k, 'namn'));
      if (eq(propOf(k, 'namn'), '3 Hjul')) {
        const theMember = member3d(280, 1);
        theMember.model('litethjulhb').clone('litethjulm');
        let theModel = member3d(280, 1).model('litethjulm');
        theModel.transform.position = vector(0.0, 25.0, -150.0);
        theModel = member3d(280, 1).model('litethjulm');
        theModel.transform.position = vector(0.0, 25.0, -200.0);
        theModel = member3d(280, 1).model('litethjulhb');
        theModel.transform.position = vector(-100, 25.0, 0.0);
        theModel = member3d(280, 1).model('litethjulvb');
        theModel.transform.position = vector(100, 25, 0);
      }
    }
    sendAllSprites('HidepurchaseBox');
    go(label(lingoString(this.theItem)) + num(this.theFrame));
  }
}
