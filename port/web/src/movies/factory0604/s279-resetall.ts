// factory0604 behavior 279 "ResetAll" (unused in the score): empties the robot
// (a debugging button) and shows the credits.

import { Behavior, member } from '../../director';
import { lingoString } from '../../lingo';
import { ResetAll as resetAll } from '../robotwars/s022-resetscripts';
import { userPL } from './util';

export class ResetAll extends Behavior {
  sp = 0;

  beginSprite() {
    this.sp = this.spriteNum;
  }

  mouseUp() {
    resetAll();
    member('Money Stats').text = lingoString(userPL().prop('money'));
  }
}
