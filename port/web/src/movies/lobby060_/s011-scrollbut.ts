// lobby060_ behavior 11 "scrollbut" (sprites 7 and 18): the list's scroll arrows;
// held down, they move the thumb (sprite 5) 4 pixels a frame.

import { Behavior, sendSprite } from '../../director';
import { sym, type LSymbol, type LValue } from '../../lingo';

export class Scrollbut extends Behavior {
  pState: LSymbol | undefined;
  move: LValue;

  beginSprite() {
    this.pState = sym('nada');
    if (this.spriteNum === 18) this.move = -4;
    if (this.spriteNum === 7) this.move = 4;
  }

  mouseDown() {
    this.pState = sym('down');
  }

  prepareFrame() {
    if (this.pState === sym('down')) sendSprite(5, 'ScrollER', this.move);
  }

  mouseUp() {
    this.pState = sym('nada');
  }

  mouseLeave() {
    this.pState = sym('nada');
  }

  mouseUpOutSide() {
    this.pState = sym('nada');
  }
}
