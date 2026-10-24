// factory0604 behavior 20 "mirror button": toggles mirrored painting on both paint maps.

import { Behavior, member, sendSprite, sprite } from '../../director';
import { sym, type LValue } from '../../lingo';

export class MirrorButton extends Behavior {
  sp = 0;
  srcName = '';
  tool: LValue;
  toggle = 0;

  beginSprite() {
    this.sp = this.spriteNum;
    this.srcName = sprite(this.sp).member.name;
    this.tool = sym('mirror');
    this.toggle = 1;
  }

  mouseDown() {
    this.toggle = this.toggle ? 0 : 1;
    this.selectTool();
    sendSprite(25, 'toggleMirror');
    sendSprite(26, 'toggleMirror');
  }

  selectTool(_t?: LValue) {
    switch (this.toggle) {
      case 0:
        sprite(this.sp).member = member(this.srcName + 'D');
        break;
      case 1:
        sprite(this.sp).member = member(this.srcName);
        break;
    }
  }
}
