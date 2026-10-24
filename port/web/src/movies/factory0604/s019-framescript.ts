// factory0604 behavior 19 "framescript" (the Paintshop's frame script, frame 10):
// holds the frame; "z" undoes the last stroke.

import { Behavior, go, sendAllSprites, sendSprite, the } from '../../director';
import { eq } from '../robotwars/util';

export class Framescript extends Behavior {
  beginSprite() {
    sendSprite(1, 'usedoktor');
  }

  exitFrame() {
    go(the.frame);
  }

  keyUp() {
    if (eq(the.key, 'z')) sendAllSprites('Undo');
  }
}
