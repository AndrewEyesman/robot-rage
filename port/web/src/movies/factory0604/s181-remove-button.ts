// factory0604 script 181 "remove button behavior": a parent script on the workshop's
// "Remove" buttons (puppet sprites): takes the part off the robot on mouseUp.

import { cursor, sendAllSprites, sendSprite, the } from '../../director';
import type { LValue } from '../../lingo';
import { playsound } from '../robotwars/s030-soundscript';

export class RemoveButtonBehavior {
  sp: number;
  name: LValue;
  part: LValue;
  x: LValue;

  constructor(sp0: number, part0: LValue, name0: LValue) {
    this.sp = sp0;
    this.name = name0;
    this.part = part0;
  }

  mouseEnter() {
    if (!the.stillDown) cursor(280);
  }

  mouseLeave() {
    if (!the.stillDown) cursor(-1);
  }

  mouseUp() {
    sendSprite(1, 'usedoktor');
    sendAllSprites('removePart', this.part);
    sendSprite(1, 'makedoktor');
  }

  mouseDown() {
    playsound('knappljud', 255);
  }
}
