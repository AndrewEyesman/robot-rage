// arena104 behavior 83: hold on this frame (not in the score).

import { go, the } from '../../director';

export class Hold83 {
  exitFrame() {
    go(the.frame);
  }
}
