// factory0604 behavior 136 (unused in the score): goes to the workshop.

import { Behavior, go } from '../../director';

export class GoBuild extends Behavior {
  exitFrame() {
    go('build');
  }
}
