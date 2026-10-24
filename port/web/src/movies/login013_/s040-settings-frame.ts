// login013_ behavior 40 (frame "settings"): back to the robot list when asked.

import { Behavior, go, the } from '../../director';
import { sym, type LSymbol } from '../../lingo';

export class SettingsFrame extends Behavior {
  pState: LSymbol | undefined;
  beginSprite() {
    this.pState = sym('done');
  }
  golist() {
    if (this.pState === sym('done')) go('listrobots');
  }
  exitFrame() {
    go(the.frame);
  }
}
