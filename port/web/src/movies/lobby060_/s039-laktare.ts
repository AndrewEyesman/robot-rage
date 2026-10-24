// lobby060_ behavior 39: hides its sprite unless spectating (laktare) is on (not in the score).

import { Behavior, G, dot, sprite } from '../../director';
import { eq } from './util';

export class LaktareBlend extends Behavior {
  beginSprite() {
    if (eq(dot(G.gVersionList, 'laktare', 'version'), 0)) sprite(this.spriteNum).blend = 0;
  }
}
