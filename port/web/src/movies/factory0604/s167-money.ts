// factory0604 behaviors 167 and 278 "money behavior" (identical; 167 is in the score):
// shows the robot's credits in member "Money Stats".

import { Behavior, member } from '../../director';
import { lingoString, type LSymbol } from '../../lingo';
import { userPL } from './util';

export class MoneyBehavior extends Behavior {
  sp = 0;
  state: LSymbol | undefined;

  beginSprite() {
    this.sp = this.spriteNum;
    member('Money Stats').text = lingoString(userPL().prop('money'));
  }
}
