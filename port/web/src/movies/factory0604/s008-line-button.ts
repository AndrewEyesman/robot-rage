// factory0604 behavior 8 "line button behavior": a Paintshop line-width button
// (#linewidth from the score); pressed while its width is the selected one.

import { Behavior, member, sendAllSprites, sprite, the } from '../../director';
import type { LValue } from '../../lingo';

export class LineButton extends Behavior {
  sp = 0;
  srcName = '';
  linewidth: LValue;

  beginSprite() {
    this.sp = the.currentSpriteNum;
    this.srcName = sprite(this.sp).member.name;
  }

  SetLineWidth(t: LValue) {
    if (t === this.linewidth) sprite(this.sp).member = member(this.srcName + 'D');
    else sprite(this.sp).member = member(this.srcName);
  }

  mouseDown() {
    sendAllSprites('SetLineWidth', this.linewidth);
  }
}
