// factory0604 behaviors 14, 267 and 272 "paintTool" (identical; 14 is the one in the
// score): a Paintshop tool button. Shows its pressed member ("<name>D") while its tool
// is the selected one; a click selects it for every sprite (#selectPaintTool).

import { Behavior, member, sendAllSprites, sprite, the } from '../../director';
import type { LValue } from '../../lingo';

export class PaintTool extends Behavior {
  sp = 0;
  srcName = '';
  tool: LValue;

  beginSprite() {
    this.sp = the.currentSpriteNum;
    this.srcName = sprite(this.sp).member.name;
  }

  selectPaintTool(t: LValue) {
    if (t === this.tool) sprite(this.sp).member = member(this.srcName + 'D');
    else sprite(this.sp).member = member(this.srcName);
  }

  mouseDown() {
    sendAllSprites('selectPaintTool', this.tool);
  }
}
