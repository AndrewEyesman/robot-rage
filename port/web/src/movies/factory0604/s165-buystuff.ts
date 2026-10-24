// factory0604 behaviors 165 and 202 "buyStuff" (the same handlers; 165 is in the score,
// 202 lists fewer parts in its parameter dialog): the Buy button of a part page; buys
// #pname (RegisterBuy).

import { Behavior, cursor, sprite } from '../../director';
import type { LValue } from '../../lingo';
import { RegisterBuy } from '../robotwars/s017-money-manager';

export class BuyStuff extends Behavior {
  sp = 0;
  pname: LValue;
  dName = '';
  /** "D" for 165 and 202; 265 names its pressed member "<name> D". */
  protected pressed = 'D';

  beginSprite() {
    this.sp = this.spriteNum;
    this.dName = sprite(this.sp).member.name;
  }

  mouseEnter() {
    cursor(280);
  }

  mouseLeave() {
    cursor(-1);
  }

  mouseDown() {
    sprite(this.sp).member = this.dName + this.pressed;
  }

  mouseUp() {
    sprite(this.sp).member = this.dName;
    RegisterBuy(this.pname);
  }

  mouseUpOutSide() {
    sprite(this.sp).member = this.dName;
  }
}
