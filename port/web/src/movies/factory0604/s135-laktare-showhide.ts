// factory0604 behaviors 135 and 292 "laktare showhide" (identical, unused in the score):
// hides the sprite when version.txt switches the "laktare" feature off.

import { Behavior, G, dot, sprite, the } from '../../director';
import { eq } from '../robotwars/util';

export class LaktareShowhide extends Behavior {
  sp = 0;

  beginSprite() {
    this.sp = the.currentSpriteNum;
    if (eq(dot(G.gVersionList, 'laktare', 'version'), '0')) sprite(this.sp).locV = -1000;
  }
}
