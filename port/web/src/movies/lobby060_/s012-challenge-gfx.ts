// lobby060_ behavior 12 (sprite 33): shows or hides the challenge panel, its own
// sprite and the five after it.

import { Behavior, sprite, the } from '../../director';
import type { LValue } from '../../lingo';

export class ChallengeGfx extends Behavior {
  showChallengeGFX() {
    this.SetVis(1);
  }

  HideChallengeGFX() {
    this.SetVis(0);
  }

  SetVis(bol: LValue) {
    const sp = the.currentSpriteNum;
    for (let i = sp; i <= sp + 5; i++) sprite(i).visible = !!bol;
  }
}
