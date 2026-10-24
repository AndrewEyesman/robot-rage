// arena104 behavior 229 "abusevis": the report-abuse question's sprites (frame 26) show
// only when the player flagged abuse.

import { Behavior, G, sprite } from '../../director';
import { eq } from './util';

// global gAbuse

export class AbuseVis extends Behavior {
  beginSprite() {
    if (eq(G.gAbuse, 0)) {
      sprite(this.spriteNum).visible = false;
    } else {
      sprite(this.spriteNum).visible = true;
    }
  }

  endSprite() {
    sprite(this.spriteNum).visible = true;
  }
}
