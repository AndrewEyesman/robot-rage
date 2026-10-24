// factory0604 behaviors 169, 171, 282 and 286 (identical, unused in the score): close
// the garage doors every frame.

import { Behavior, sendAllSprites } from '../../director';
import { sym } from '../../lingo';

export class CloseDoorsEveryFrame extends Behavior {
  exitFrame() {
    sendAllSprites('doorAction', sym('close'));
  }
}
