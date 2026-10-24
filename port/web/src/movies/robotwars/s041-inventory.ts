// robotwars script 41 "inventory behavior": a parent script holding a sprite's number,
// name and position.

import { sprite } from '../../director';
import { sym, type LSymbol, type LValue } from '../../lingo';

export class InventoryBehavior {
  sp: number;
  name: LValue;
  state: LSymbol;
  x: number;

  constructor(sp0: number, name0: LValue) {
    this.sp = sp0;
    this.name = name0;
    this.x = sprite(this.sp).locH;
    this.state = sym('idle');
  }
}
