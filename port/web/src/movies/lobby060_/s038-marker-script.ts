// lobby060_ behavior 38 "Marker_script" (sprite 10): the highlight bar under the
// selected line of the list in the sprite before it.

import { Behavior, sprite } from '../../director';
import { rect, type LValue } from '../../lingo';

export class MarkerScript extends Behavior {
  sp = 0;
  lineNum: LValue;
  Linespace = 0;

  select(n: LValue) {
    this.lineNum = n;
  }

  beginSprite() {
    this.sp = this.spriteNum;
    this.Linespace = sprite(this.sp - 1).member.fixedLineSpace;
  }

  HideSelection() {
    this.lineNum = 0;
  }

  prepareFrame() {
    const n = Number(this.lineNum ?? 0);
    if (n > 0) {
      const list = sprite(this.sp - 1);
      const scrollTop = Number(list.member.scrollTop ?? 0);
      let y1 = list.top + (n - 1) * this.Linespace - scrollTop;
      let y2 = list.top + (n - 1) * this.Linespace - scrollTop + this.Linespace;
      y1 = Math.max(list.top, y1);
      y2 = Math.max(list.top, y2);
      y1 = Math.min(list.bottom, y1);
      y2 = Math.min(list.bottom, y2);
      sprite(this.sp).rect = rect(list.left - 6, y1, list.right + 3, y2);
    }
  }
}
