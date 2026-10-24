// arena104 behavior 48: a button back to "goback" (not in the score, and the movie
// has no such marker).

import { go } from '../../director';

export class Script48 {
  mouseUp() {
    go('goback');
  }
}
