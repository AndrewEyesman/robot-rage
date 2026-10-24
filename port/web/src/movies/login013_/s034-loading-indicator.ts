// login013_ parent script "loading indicator": a dot wobbling around a point while
// a request is out (two of them, half a turn apart).

import { sprite } from '../../director';
import { add, cos, integerp, num, point, sin, type LPoint } from '../../lingo';

export class LoadingIndicator {
  sp: number;
  pIndicatorLoc: LPoint;
  pangle: number;
  parentSprite: number | undefined;
  relLoc: LPoint | undefined;
  dy: number;

  constructor(sp0: number, pt: LPoint, tAngle: number, tParent?: number) {
    this.sp = sp0;
    this.pangle = tAngle;
    this.parentSprite = tParent;
    this.pIndicatorLoc = pt;
    const sp = sprite(this.sp);
    if (integerp(this.parentSprite)) {
      const parent = sprite(this.parentSprite!);
      this.pIndicatorLoc = point(add(pt.locH, parent.locH), add(pt.locV, parent.locV));
      sp.locZ = parent.locZ + 1;
      this.relLoc = parent.loc;
    } else {
      sp.locZ = 799;
    }
    sp.puppet = true;
    sp.loc = pt;
    sp.ink = 36;
    sp.member = 'loading symbol';
    this.dy = -15;
    if (tAngle === 0) {
      sp.ink = 4;
      sp.foreColor = 0;
      this.dy = -15;
    }
  }

  prepareFrame() {
    this.pangle = this.pangle + 10;
    const x = num(cos(0.02 * this.pangle)) * 4;
    const y = num(sin(0.02 * this.pangle)) * 2;
    const sp = sprite(this.sp);
    sp.blend = 50 + y * this.dy;
    if (integerp(this.parentSprite)) {
      const parent = sprite(this.parentSprite!);
      if (parent.type === 0) sp.puppet = false;
      else sp.loc = point(num(this.pIndicatorLoc.locH) + x + parent.locH - num(this.relLoc!.locH), num(this.pIndicatorLoc.locV) + y + parent.locV - num(this.relLoc!.locV));
    } else {
      sp.loc = point(num(this.pIndicatorLoc.locH) + x, num(this.pIndicatorLoc.locV) + y);
    }
  }
}
