// factory0604 behavior 21 "bar behavior" (sprites 78-80): the workshop's used space,
// top speed and armour bars, as the sprite's offset (0-208 px) from where it starts.

import { Behavior, member, sendAllSprites, sprite } from '../../director';
import { LList, div, lf, lingoString, mul, num, sub, sym, type LValue } from '../../lingo';
import { calculateMaxSpace, calculateMaxSpeed, CalculateUsedSpace, calculateUsedWeight } from '../robotwars/s013-robot-descriptions';
import { robotDesc, userPL } from './util';

export class BarBehavior extends Behavior {
  sp = 0;
  barType: LValue;
  maxWidth = 0;
  pStart = 0;

  beginSprite() {
    this.sp = this.spriteNum;
    this.maxWidth = 208;
    this.pStart = sprite(this.sp).locH;
    sendAllSprites('updateBar');
  }

  updateBar() {
    let w: LValue = 0;
    const rd = robotDesc();
    switch (this.barType) {
      case sym('utrymme'):
        w = div(mul(this.maxWidth, CalculateUsedSpace(rd)), calculateMaxSpace(rd));
        member('utrymme kvar text').text = 'Kvar: ' + lingoString(sub(calculateMaxSpace(rd), CalculateUsedSpace(rd)));
        if (num(w) > this.maxWidth) w = this.maxWidth;
        break;
      case sym('hastighet'): {
        const vikt = calculateUsedWeight(rd);
        const motor = rd.prop('motor') as LList;
        if (motor.count === 0 || (rd.prop('batteri') as LList).count === 0) w = 0;
        else w = mul(this.maxWidth, calculateMaxSpeed(vikt, motor.getAt(1)));
        break;
      }
      case sym('pansar'):
        if (userPL().getaProp(sym('pansar')) === undefined) userPL().setaProp(sym('pansar'), 0);
        w = div(mul(userPL().prop('pansar'), lf(10.0)), calculateMaxSpace(rd));
        break;
    }
    w = Math.min(num(w), this.maxWidth);
    sprite(this.sp).locH = w + this.pStart;
  }
}
