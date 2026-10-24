// factory0604 behavior 264 "_ooolmouse goto menuitem" (an older version of 164, unused
// in the score): shows the part and goes to its page.

import { Behavior, cursor, go, label, sendSprite } from '../../director';
import { lingoString, num, type LValue } from '../../lingo';
import { showPartInfo } from './s164-mouse-goto-menuitem';

export class OldGotoMenuitem extends Behavior {
  sp = 0;
  last: LValue;
  first: LValue;
  theFrame: LValue = 1;
  theItem: LValue = 0;
  pAct: LValue = 1;
  pname: LValue;

  beginSprite() {
    this.sp = this.spriteNum;
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
    this.goMenuItem();
  }

  goMenuItem() {
    showPartInfo(this.pAct, this.pname);
    go(label(lingoString(this.theItem)) + num(this.theFrame));
  }
}
