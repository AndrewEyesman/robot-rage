// login013_ behavior 23.

import { Behavior, sprite, the } from '../../director';

export class Marker extends Behavior {
  setMarker(loca: number) {
    sprite(the.currentSpriteNum).locV = loca;
  }
}
