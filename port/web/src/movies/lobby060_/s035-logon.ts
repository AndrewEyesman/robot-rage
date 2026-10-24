// lobby060_ behavior 35: a log-on button (not in the score).

import { Behavior, sendSprite } from '../../director';
import { sym } from '../../lingo';

export class LogonButton extends Behavior {
  mouseUp() {
    sendSprite(0, 'setState', sym('logon'));
  }
}
