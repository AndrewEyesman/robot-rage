// arena104 behavior 14: hold on this frame (not in the score).

import { go, the } from '../../director';

export class Hold14 {
  exitFrame() {
    go(the.frame);
  }
}
