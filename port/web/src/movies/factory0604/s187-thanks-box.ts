// factory0604 behavior 187 (sprite 79, the Buy rooms): the thank-you box, this sprite
// and the three after it; hidden until #ShowthanksBox. Shown again when its span ends
// (outside authoring).

import { Behavior, sprite, the } from '../../director';
import type { LValue } from '../../lingo';

export class ThanksBox extends Behavior {
  sp = 0;

  beginSprite() {
    this.sp = the.currentSpriteNum;
    this.SetVisib(0);
  }

  endSprite() {
    if (the.runMode !== 'Author') this.SetVisib(1);
  }

  ShowthanksBox(ttex: LValue) {
    sprite(this.sp + 3).member.text = ttex;
    this.SetVisib(1);
  }

  SetVisib(bb: LValue) {
    for (let i = 1; i <= 4; i++) sprite(this.sp - 1 + i).visible = !!bb;
  }
}
