// factory0604 behavior 270 "framescript" (unused in the score): holds the frame; "z" undoes.

import { Behavior, go, sendAllSprites, the } from '../../director';
import { eq } from '../robotwars/util';

export class Framescript270 extends Behavior {
  exitFrame() {
    go(the.frame);
  }

  keyUp() {
    if (eq(the.key, 'z')) sendAllSprites('Undo');
  }
}
