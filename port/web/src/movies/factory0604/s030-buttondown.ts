// factory0604 script 30 "buttondown behavior" (a parent script, unused): swaps a
// puppet sprite to "<name>D" while pressed.

import { sprite } from '../../director';
import { EMPTY } from '../../lingo';

export class ButtondownBehavior {
  sp: number;
  name: string;

  constructor(sp0: number, name0: string) {
    this.sp = sp0;
    this.name = name0;
  }

  mouseEnter() {
    sprite(this.sp).member = this.name + EMPTY;
  }

  mouseLeave() {
    sprite(this.sp).member = this.name;
  }

  mouseDown() {
    sprite(this.sp).member = this.name + 'D';
  }

  mouseUp() {
    sprite(this.sp).member = this.name + EMPTY;
  }

  mouseUpOutSide() {
    sprite(this.sp).member = this.name + EMPTY;
  }
}
